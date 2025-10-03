use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use log::{error, warn};
use parking_lot::RwLock;
use serde_json::json;
use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_runtime_wry::wry::dpi::{LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize};
use willhook::{
    hook::event::{InputEvent, KeyPress, KeyboardKey},
    keyboard_hook,
};

use crate::{
    keyboard::KeyboardManager,
    models::{BootstrapOverlayState, BootstrapPayload, OverlayBounds, SettingsDiff, SettingsState},
    services::settings::SettingsService,
    store::AppStore,
};

const OVERLAY_LABEL: &str = "overlay";
const DEFAULT_OVERLAY_WIDTH: f64 = 860.0;
const DEFAULT_OVERLAY_HEIGHT: f64 = 320.0;
const OVERLAY_MARGIN: f64 = 40.0;

pub struct AppState {
    pub store: Arc<AppStore>,
    pub settings: SettingsService,
    pub keyboard: KeyboardManager,
    overlay_visible: Arc<RwLock<bool>>,
    keyboard_task: RwLock<Option<KeyboardHookTask>>,
}

impl AppState {
    pub fn initialize(store: AppStore) -> Result<Self> {
        let store = Arc::new(store);
        let snapshot = store.snapshot();
        let keyboard =
            KeyboardManager::new(snapshot.keys.clone(), snapshot.selected_key_type.clone());
        let settings = SettingsService::new(store.clone());

        Ok(Self {
            store,
            settings,
            keyboard,
            overlay_visible: Arc::new(RwLock::new(false)),
            keyboard_task: RwLock::new(None),
        })
    }

    pub fn initialize_runtime(&self, app: &AppHandle) -> Result<()> {
        self.ensure_overlay_window(app)?;
        self.start_keyboard_hook(app.clone())?;
        Ok(())
    }

    pub fn bootstrap_payload(&self) -> BootstrapPayload {
        let state = self.store.snapshot();
        BootstrapPayload {
            settings: SettingsState {
                hardware_acceleration: state.hardware_acceleration,
                always_on_top: state.always_on_top,
                overlay_locked: state.overlay_locked,
                note_effect: state.note_effect,
                note_settings: state.note_settings.clone(),
                angle_mode: state.angle_mode.clone(),
                language: state.language.clone(),
                laboratory_enabled: state.laboratory_enabled,
                background_color: state.background_color.clone(),
                use_custom_css: state.use_custom_css,
                custom_css: state.custom_css.clone(),
                overlay_resize_anchor: state.overlay_resize_anchor.clone(),
            },
            keys: state.keys.clone(),
            positions: state.key_positions.clone(),
            custom_tabs: state.custom_tabs.clone(),
            selected_key_type: state.selected_key_type.clone(),
            current_mode: self.keyboard.current_mode(),
            overlay: BootstrapOverlayState {
                visible: *self.overlay_visible.read(),
                locked: state.overlay_locked,
                anchor: state.overlay_resize_anchor.as_str().to_string(),
            },
        }
    }

    pub fn overlay_status(&self) -> BootstrapOverlayState {
        let state = self.store.snapshot();
        BootstrapOverlayState {
            visible: *self.overlay_visible.read(),
            locked: state.overlay_locked,
            anchor: state.overlay_resize_anchor.as_str().to_string(),
        }
    }

    pub fn emit_settings_changed(&self, diff: &SettingsDiff, app: &AppHandle) -> Result<()> {
        self.apply_settings_effects(diff, app)?;
        app.emit("settings:changed", diff)?;
        Ok(())
    }

    pub fn set_overlay_visibility(&self, app: &AppHandle, visible: bool) -> Result<()> {
        let window = self.ensure_overlay_window(app)?;
        if visible {
            window.show()?;
        } else {
            window.hide()?;
        }
        *self.overlay_visible.write() = visible;
        app.emit("overlay:visibility", &json!({ "visible": visible }))?;
        Ok(())
    }

    pub fn set_overlay_lock(&self, app: &AppHandle, locked: bool, persist: bool) -> Result<()> {
        if persist {
            self.store.update(|state| {
                state.overlay_locked = locked;
            })?;
        }
        let window = self.ensure_overlay_window(app)?;
        window.set_ignore_cursor_events(locked)?;
        app.emit("overlay:lock", &json!({ "locked": locked }))?;
        Ok(())
    }

    pub fn shutdown(&self) {
        if let Some(task) = self.keyboard_task.write().take() {
            drop(task);
        }
    }

    pub fn set_overlay_anchor(&self, app: &AppHandle, anchor: &str) -> Result<String> {
        let parsed = crate::models::overlay_resize_anchor_from_str(anchor);
        let value = parsed.unwrap_or_else(|| self.store.snapshot().overlay_resize_anchor);
        self.store.update(|state| {
            state.overlay_resize_anchor = value.clone();
        })?;
        app.emit("overlay:anchor", &json!({ "anchor": value.as_str() }))?;
        Ok(value.as_str().to_string())
    }

    pub fn resize_overlay(
        &self,
        app: &AppHandle,
        width: f64,
        height: f64,
        anchor: Option<String>,
        content_top_offset: Option<f64>,
    ) -> Result<OverlayBounds> {
        let window = self.ensure_overlay_window(app)?;
        let anchor = anchor
            .and_then(|value| crate::models::overlay_resize_anchor_from_str(&value))
            .unwrap_or_else(|| self.store.snapshot().overlay_resize_anchor);

        let width = width.clamp(100.0, 2000.0).round();
        let height = height.clamp(100.0, 2000.0).round();

        let position = window
            .outer_position()
            .unwrap_or(PhysicalPosition::new(0, 0));
        let size = window.outer_size().unwrap_or(PhysicalSize::new(
            DEFAULT_OVERLAY_WIDTH as u32,
            DEFAULT_OVERLAY_HEIGHT as u32,
        ));

        let mut new_x = position.x as f64;
        let mut new_y = position.y as f64;

        match anchor.as_str() {
            "bottom-left" => new_y += size.height as f64 - height,
            "top-right" => new_x += size.width as f64 - width,
            "bottom-right" => {
                new_x += size.width as f64 - width;
                new_y += size.height as f64 - height;
            }
            "center" => {
                new_x += (size.width as f64 - width) / 2.0;
                new_y += (size.height as f64 - height) / 2.0;
            }
            _ => {}
        }

        if let Some(offset) = content_top_offset {
            if offset.is_finite() {
                let previous = self
                    .store
                    .snapshot()
                    .overlay_last_content_top_offset
                    .unwrap_or(offset);
                let delta = offset - previous;
                if delta != 0.0 {
                    match anchor.as_str() {
                        "center" => new_y -= delta / 2.0,
                        anchor if anchor.contains("bottom") => {}
                        _ => new_y -= delta,
                    }
                }
                self.store.update(|state| {
                    state.overlay_last_content_top_offset = Some(offset);
                })?;
            }
        }

        window.set_size(LogicalSize::new(width, height))?;
        window.set_position(LogicalPosition::new(new_x, new_y))?;

        let bounds = OverlayBounds {
            x: new_x,
            y: new_y,
            width,
            height,
        };
        self.store.update(|state| {
            state.overlay_bounds = Some(bounds.clone());
        })?;

        app.emit(
            "overlay:resized",
            &json!({
                "x": bounds.x,
                "y": bounds.y,
                "width": bounds.width,
                "height": bounds.height,
            }),
        )?;

        Ok(bounds)
    }

    pub fn start_keyboard_hook(&self, app: AppHandle) -> Result<()> {
        let mut task_guard = self.keyboard_task.write();
        if task_guard.is_some() {
            return Ok(());
        }

        let running = Arc::new(AtomicBool::new(true));
        let keyboard = self.keyboard.clone();
        let running_flag = running.clone();

        let handle = thread::Builder::new()
            .name("willhook-keyboard".into())
            .spawn(move || {
                let Some(hook) = keyboard_hook() else {
                    warn!("failed to initialize global keyboard hook");
                    return;
                };

                while running_flag.load(Ordering::SeqCst) {
                    match hook.try_recv() {
                        Ok(InputEvent::Keyboard(event)) => {
                            if let Some(key) = event.key {
                                let labels = keyboard_key_to_global(key);
                                if labels.is_empty() {
                                    continue;
                                }

                                let Some(key_label) = keyboard
                                    .match_candidate(labels.iter().map(|label| label.as_str()))
                                else {
                                    continue;
                                };

                                let state = match event.pressed {
                                    KeyPress::Down(_) => "DOWN",
                                    KeyPress::Up(_) => "UP",
                                    _ => continue,
                                };

                                let mode = keyboard.current_mode();
                                if let Err(err) = app.emit(
                                    "keys:state",
                                    &json!({
                                        "key": key_label,
                                        "state": state,
                                        "mode": mode,
                                    }),
                                ) {
                                    error!("failed to emit keys:state event: {err}");
                                }
                            }
                        }
                        Ok(_) => {}
                        Err(std::sync::mpsc::TryRecvError::Empty) => {
                            thread::sleep(Duration::from_millis(1));
                        }
                        Err(std::sync::mpsc::TryRecvError::Disconnected) => break,
                    }
                }
            })
            .map_err(|err| anyhow!("failed to spawn keyboard hook thread: {err}"))?;

        *task_guard = Some(KeyboardHookTask {
            running,
            handle: Some(handle),
        });
        Ok(())
    }
    fn ensure_overlay_window(&self, app: &AppHandle) -> Result<WebviewWindow> {
        if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
            return Ok(window);
        }

        let snapshot = self.store.snapshot();
        let (mut bounds, had_bounds) = if let Some(bounds) = snapshot.overlay_bounds.clone() {
            (bounds, true)
        } else {
            (
                OverlayBounds {
                    x: 0.0,
                    y: 0.0,
                    width: DEFAULT_OVERLAY_WIDTH,
                    height: DEFAULT_OVERLAY_HEIGHT,
                },
                false,
            )
        };

        let position = self.compute_overlay_position(app, &bounds, had_bounds);
        bounds.x = position.x;
        bounds.y = position.y;

        let window = WebviewWindowBuilder::new(
            app,
            OVERLAY_LABEL,
            WebviewUrl::App("overlay/index.html".into()),
        )
        .decorations(false)
        .resizable(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(false)
        .visible(true)
        .inner_size(bounds.width, bounds.height)
        .position(bounds.x, bounds.y)
        .shadow(false)
        .build()
        .context("failed to create overlay window")?;

        window.set_ignore_cursor_events(snapshot.overlay_locked)?;
        window.set_always_on_top(snapshot.always_on_top)?;
        if let Err(err) = window.set_focus() {
            log::debug!("failed to focus overlay window: {err}");
        }

        *self.overlay_visible.write() = true;

        self.store.update(|state| {
            state.overlay_bounds = Some(bounds.clone());
        })?;

        self.configure_overlay_window(&window, app);

        Ok(window)
    }

    fn configure_overlay_window(&self, window: &WebviewWindow, app: &AppHandle) {
        let overlay_visible = self.overlay_visible.clone();
        let store = self.store.clone();
        let app_handle = app.clone();
        let overlay_window = window.clone();

        window.on_window_event(move |event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if let Err(err) = overlay_window.hide() {
                    log::error!("failed to hide overlay window on close: {err}");
                }
                *overlay_visible.write() = false;
                if let Err(err) =
                    app_handle.emit("overlay:visibility", &json!({ "visible": false }))
                {
                    log::error!("failed to emit overlay visibility change: {err}");
                }
            }
            WindowEvent::Focused(false) => {
                let snapshot = store.snapshot();
                if let Err(err) = overlay_window.set_always_on_top(snapshot.always_on_top) {
                    log::warn!("failed to reapply always on top: {err}");
                }
            }
            WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                if let Err(err) = persist_overlay_bounds(&overlay_window, &store) {
                    log::warn!("failed to persist overlay bounds: {err}");
                }
            }
            _ => {}
        });
    }

    fn compute_overlay_position(
        &self,
        app: &AppHandle,
        bounds: &OverlayBounds,
        had_stored_bounds: bool,
    ) -> OverlayPosition {
        if had_stored_bounds {
            return OverlayPosition {
                x: bounds.x,
                y: bounds.y,
            };
        }

        if let Ok(Some(monitor)) = app.primary_monitor() {
            let work_area = monitor.work_area();

            let origin = work_area.position;

            let size = work_area.size;

            let origin_x = origin.x as f64;

            let origin_y = origin.y as f64;

            let work_width = size.width as f64;

            let work_height = size.height as f64;

            let x = origin_x + work_width - bounds.width - OVERLAY_MARGIN;

            let y = origin_y + work_height - bounds.height - OVERLAY_MARGIN;

            return OverlayPosition {
                x: x.max(origin_x),

                y: y.max(origin_y),
            };
        }

        OverlayPosition {
            x: OVERLAY_MARGIN,
            y: OVERLAY_MARGIN,
        }
    }

    fn apply_settings_effects(&self, diff: &SettingsDiff, app: &AppHandle) -> Result<()> {
        if let Some(value) = diff.changed.always_on_top {
            if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
                window.set_always_on_top(value)?;
            }
        }

        if let Some(value) = diff.changed.overlay_locked {
            self.set_overlay_lock(app, value, false)?;
        }

        Ok(())
    }
}

fn persist_overlay_bounds(window: &WebviewWindow, store: &Arc<AppStore>) -> Result<()> {
    let position = window.outer_position()?;
    let size = window.outer_size()?;

    let bounds = OverlayBounds {
        x: position.x as f64,
        y: position.y as f64,
        width: size.width as f64,
        height: size.height as f64,
    };

    store
        .update(|state| {
            state.overlay_bounds = Some(bounds.clone());
        })
        .map(|_| ())
        .map_err(|err| err.into())
}

struct KeyboardHookTask {
    running: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl Drop for KeyboardHookTask {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.handle.take() {
            if let Err(err) = handle.join() {
                error!("failed to join keyboard hook thread: {:?}", err);
            }
        }
    }
}

#[derive(Clone)]
struct OverlayPosition {
    x: f64,
    y: f64,
}

fn keyboard_key_to_global(key: KeyboardKey) -> Vec<String> {
    use KeyboardKey::*;
    match key {
        A => vec!["A".to_string()],
        B => vec!["B".to_string()],
        C => vec!["C".to_string()],
        D => vec!["D".to_string()],
        E => vec!["E".to_string()],
        F => vec!["F".to_string()],
        G => vec!["G".to_string()],
        H => vec!["H".to_string()],
        I => vec!["I".to_string()],
        J => vec!["J".to_string()],
        K => vec!["K".to_string()],
        L => vec!["L".to_string()],
        M => vec!["M".to_string()],
        N => vec!["N".to_string()],
        O => vec!["O".to_string()],
        P => vec!["P".to_string()],
        Q => vec!["Q".to_string()],
        R => vec!["R".to_string()],
        S => vec!["S".to_string()],
        T => vec!["T".to_string()],
        U => vec!["U".to_string()],
        V => vec!["V".to_string()],
        W => vec!["W".to_string()],
        X => vec!["X".to_string()],
        Y => vec!["Y".to_string()],
        Z => vec!["Z".to_string()],
        Number0 => vec!["0".to_string()],
        Number1 => vec!["1".to_string()],
        Number2 => vec!["2".to_string()],
        Number3 => vec!["3".to_string()],
        Number4 => vec!["4".to_string()],
        Number5 => vec!["5".to_string()],
        Number6 => vec!["6".to_string()],
        Number7 => vec!["7".to_string()],
        Number8 => vec!["8".to_string()],
        Number9 => vec!["9".to_string()],
        LeftAlt => vec!["LEFT ALT".to_string()],
        RightAlt => vec!["RIGHT ALT".to_string()],
        LeftShift => vec!["LEFT SHIFT".to_string()],
        RightShift => vec!["RIGHT SHIFT".to_string()],
        LeftControl => vec!["LEFT CTRL".to_string()],
        RightControl => vec!["25".to_string(), "RIGHT CTRL".to_string()],
        BackSpace => vec!["BACKSPACE".to_string()],
        Tab => vec!["TAB".to_string()],
        Enter => vec!["RETURN".to_string(), "NUMPAD RETURN".to_string()],
        Escape => vec!["ESCAPE".to_string()],
        Space => vec!["SPACE".to_string()],
        PageUp => vec!["PAGE UP".to_string()],
        PageDown => vec!["PAGE DOWN".to_string()],
        Home => vec!["HOME".to_string()],
        ArrowLeft => vec!["LEFT ARROW".to_string()],
        ArrowUp => vec!["UP ARROW".to_string()],
        ArrowRight => vec!["RIGHT ARROW".to_string()],
        ArrowDown => vec!["DOWN ARROW".to_string()],
        Print => vec!["PRINT".to_string()],
        PrintScreen => vec!["PRINT SCREEN".to_string()],
        Insert => vec!["INS".to_string()],
        Delete => vec!["DELETE".to_string()],
        LeftWindows => vec!["91".to_string(), "LEFT WINDOWS".to_string()],
        RightWindows => vec!["92".to_string(), "RIGHT WINDOWS".to_string()],
        Comma => vec!["COMMA".to_string()],
        Period => vec!["DOT".to_string(), "PERIOD".to_string()],
        Slash => vec!["FORWARD SLASH".to_string(), "/".to_string()],
        SemiColon => vec!["SEMICOLON".to_string()],
        Apostrophe => vec!["QUOTE".to_string()],
        LeftBrace => vec!["SQUARE BRACKET OPEN".to_string()],
        BackwardSlash => vec!["BACKSLASH".to_string()],
        RightBrace => vec!["SQUARE BRACKET CLOSE".to_string()],
        Grave => vec!["SECTION".to_string(), "GRAVE".to_string()],
        Add => vec!["NUMPAD PLUS".to_string(), "+".to_string()],
        Subtract => vec!["NUMPAD MINUS".to_string(), "-".to_string()],
        Decimal => vec!["NUMPAD DELETE".to_string(), "DECIMAL".to_string()],
        Divide => vec!["NUMPAD DIVIDE".to_string(), "/".to_string()],
        Multiply => vec!["NUMPAD MULTIPLY".to_string(), "*".to_string()],
        Separator => vec!["NUMPAD SEPARATOR".to_string()],
        F1 => vec!["F1".to_string()],
        F2 => vec!["F2".to_string()],
        F3 => vec!["F3".to_string()],
        F4 => vec!["F4".to_string()],
        F5 => vec!["F5".to_string()],
        F6 => vec!["F6".to_string()],
        F7 => vec!["F7".to_string()],
        F8 => vec!["F8".to_string()],
        F9 => vec!["F9".to_string()],
        F10 => vec!["F10".to_string()],
        F11 => vec!["F11".to_string()],
        F12 => vec!["F12".to_string()],
        F13 => vec!["F13".to_string()],
        F14 => vec!["F14".to_string()],
        F15 => vec!["F15".to_string()],
        F16 => vec!["F16".to_string()],
        F17 => vec!["F17".to_string()],
        F18 => vec!["F18".to_string()],
        F19 => vec!["F19".to_string()],
        F20 => vec!["F20".to_string()],
        F21 => vec!["F21".to_string()],
        F22 => vec!["F22".to_string()],
        F23 => vec!["F23".to_string()],
        F24 => vec!["F24".to_string()],
        NumLock => vec!["NUM LOCK".to_string()],
        ScrollLock => vec!["SCROLL LOCK".to_string()],
        CapsLock => vec!["CAPS LOCK".to_string()],
        Numpad0 => vec!["NUMPAD 0".to_string()],
        Numpad1 => vec!["NUMPAD 1".to_string()],
        Numpad2 => vec!["NUMPAD 2".to_string()],
        Numpad3 => vec!["NUMPAD 3".to_string()],
        Numpad4 => vec!["NUMPAD 4".to_string()],
        Numpad5 => vec!["NUMPAD 5".to_string()],
        Numpad6 => vec!["NUMPAD 6".to_string()],
        Numpad7 => vec!["NUMPAD 7".to_string()],
        Numpad8 => vec!["NUMPAD 8".to_string()],
        Numpad9 => vec!["NUMPAD 9".to_string()],
        Other(code) => other_key_labels(code),
        InvalidKeyCodeReceived => Vec::new(),
    }
}

fn other_key_labels(code: u32) -> Vec<String> {
    match code {
        187 => vec!["EQUALS".to_string(), "=".to_string()],
        189 => vec!["MINUS".to_string(), "-".to_string()],
        _ => vec![code.to_string()],
    }
}
