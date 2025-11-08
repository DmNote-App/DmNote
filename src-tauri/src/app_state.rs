use std::{
    collections::HashSet,
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
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
    AppHandle, Emitter, Manager, Monitor, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};
use tauri_runtime_wry::wry::dpi::{LogicalPosition, LogicalSize};

use crate::{
    ipc,
    keyboard::KeyboardManager,
    models::{
        overlay_resize_anchor_from_str, BootstrapOverlayState, BootstrapPayload, KeyCounters,
        KeyMappings, OverlayBounds, OverlayResizeAnchor, SettingsDiff, SettingsState,
    },
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
    overlay_force_close: Arc<AtomicBool>,
    keyboard_task: RwLock<Option<KeyboardDaemonTask>>,
    key_counters: Arc<RwLock<KeyCounters>>,
    key_counter_enabled: Arc<AtomicBool>,
    active_keys: Arc<RwLock<HashSet<String>>>,
}

impl AppState {
    pub fn initialize(store: AppStore) -> Result<Self> {
        let store = Arc::new(store);
        let snapshot = store.snapshot();
        let keyboard =
            KeyboardManager::new(snapshot.keys.clone(), snapshot.selected_key_type.clone());
        let settings = SettingsService::new(store.clone());

        let key_counters = Arc::new(RwLock::new(snapshot.key_counters.clone()));
        Self::sync_counters_with_keys_impl(&key_counters, &snapshot.keys);
        let key_counter_enabled = Arc::new(AtomicBool::new(snapshot.key_counter_enabled));
        let active_keys = Arc::new(RwLock::new(HashSet::new()));

        Ok(Self {
            store,
            settings,
            keyboard,
            overlay_visible: Arc::new(RwLock::new(false)),
            overlay_force_close: Arc::new(AtomicBool::new(false)),
            keyboard_task: RwLock::new(None),
            key_counters,
            key_counter_enabled,
            active_keys,
        })
    }

    pub fn initialize_runtime(&self, app: &AppHandle) -> Result<()> {
        self.attach_main_window_handlers(app);
        self.ensure_overlay_window(app)?;
        // 개발자 모드가 켜져 있으면 시작 시 DevTools 오픈 허용 및 자동 오픈 시도
        let snapshot = self.store.snapshot();
        if snapshot.developer_mode_enabled {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.open_devtools();
            }
            if let Some(overlay) = app.get_webview_window("overlay") {
                let _ = overlay.open_devtools();
            }
        }
        self.start_keyboard_hook(app.clone())?;
        Ok(())
    }

    fn attach_main_window_handlers(&self, app: &AppHandle) {
        let overlay_force_close = self.overlay_force_close.clone();
        if let Some(window) = app.get_webview_window("main") {
            attach_main_window_close_handler(window, overlay_force_close, app.clone());
            return;
        }

        let overlay_force_close = overlay_force_close.clone();
        let app_handle = app.clone();
        thread::spawn(move || {
            for _ in 0..15 {
                if let Some(window) = app_handle.get_webview_window("main") {
                    attach_main_window_close_handler(
                        window,
                        overlay_force_close.clone(),
                        app_handle.clone(),
                    );
                    break;
                }
                thread::sleep(Duration::from_millis(25));
            }
        });
    }

    pub fn bootstrap_payload(&self) -> BootstrapPayload {
        let state = self.store.snapshot();
        let mut custom_js = state.custom_js.clone();
        let _ = custom_js.normalize();
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
                developer_mode_enabled: state.developer_mode_enabled,
                background_color: state.background_color.clone(),
                use_custom_css: state.use_custom_css,
                custom_css: state.custom_css.clone(),
                use_custom_js: state.use_custom_js,
                custom_js,
                overlay_resize_anchor: state.overlay_resize_anchor.clone(),
                key_counter_enabled: state.key_counter_enabled,
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
            key_counters: self.key_counters.read().clone(),
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
        if let Some(value) = diff.changed.key_counter_enabled {
            self.key_counter_enabled.store(value, Ordering::SeqCst);
        }
        app.emit("settings:changed", diff)?;
        Ok(())
    }

    pub fn set_overlay_visibility(&self, app: &AppHandle, visible: bool) -> Result<()> {
        let window = self.ensure_overlay_window(app)?;
        if visible {
            show_overlay_window(&window)?;
        } else {
            hide_overlay_window(&window)?;
        }
        *self.overlay_visible.write() = visible;
        app.emit("overlay:visibility", &json!({ "visible": visible }))?;
        Ok(())
    }

    pub fn set_overlay_lock(&self, app: &AppHandle, locked: bool, persist: bool) -> Result<()> {
        if persist {
            let _ = self.store.update(|state| {
                state.overlay_locked = locked;
            })?;
        }

        let window = self.ensure_overlay_window(app)?;
        window.set_ignore_cursor_events(locked)?;
        app.emit("overlay:lock", &json!({ "locked": locked }))?;
        Ok(())
    }

    pub fn shutdown(&self) {
        if let Err(err) = self.persist_key_counters() {
            log::warn!("failed to persist key counters during shutdown: {err}");
        }
        if let Some(task) = self.keyboard_task.write().take() {
            drop(task);
        }
    }

    pub fn set_overlay_anchor(&self, app: &AppHandle, anchor: &str) -> Result<String> {
        let parsed = overlay_resize_anchor_from_str(anchor);
        let value: OverlayResizeAnchor =
            parsed.unwrap_or_else(|| self.store.snapshot().overlay_resize_anchor.clone());
        let updated = self.store.update(|state| {
            state.overlay_resize_anchor = value.clone();
        })?;
        app.emit("overlay:anchor", &json!({ "anchor": value.as_str() }))?;
        Ok(updated.overlay_resize_anchor.as_str().to_string())
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
            .and_then(|value| overlay_resize_anchor_from_str(&value))
            .unwrap_or_else(|| self.store.snapshot().overlay_resize_anchor.clone());

        let width = width.clamp(100.0, 2000.0).round();
        let height = height.clamp(100.0, 2000.0).round();

        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let position = window
            .outer_position()
            .map(|value| value.to_logical::<f64>(scale_factor))
            .unwrap_or_else(|_| LogicalPosition::new(0.0, 0.0));
        let size = window
            .outer_size()
            .map(|value| value.to_logical::<f64>(scale_factor))
            .unwrap_or_else(|_| LogicalSize::new(DEFAULT_OVERLAY_WIDTH, DEFAULT_OVERLAY_HEIGHT));

        let mut new_x = position.x;
        let mut new_y = position.y;

        match anchor {
            OverlayResizeAnchor::BottomLeft => new_y += size.height - height,
            OverlayResizeAnchor::TopRight => new_x += size.width - width,
            OverlayResizeAnchor::BottomRight => {
                new_x += size.width - width;
                new_y += size.height - height;
            }
            OverlayResizeAnchor::Center => {
                new_x += (size.width - width) / 2.0;
                new_y += (size.height - height) / 2.0;
            }
            OverlayResizeAnchor::TopLeft => {}
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
                    match anchor {
                        OverlayResizeAnchor::Center => new_y -= delta / 2.0,
                        OverlayResizeAnchor::BottomLeft | OverlayResizeAnchor::BottomRight => {}
                        _ => new_y -= delta,
                    }
                }
                let _ = self.store.update(|state| {
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

        let _ = self.store.update(|state| {
            state.overlay_bounds = Some(bounds.clone());
            state.overlay_bounds_are_logical = true;
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

        self.clear_active_keys();

        let current_exe = std::env::current_exe().context("failed to locate dm-note executable")?;

        // Prepare Named Pipe server asynchronously to avoid blocking before spawning the daemon.
        #[cfg(target_os = "windows")]
        let pipe_receiver: Option<std::sync::mpsc::Receiver<Option<std::fs::File>>> = {
            use std::sync::mpsc;
            let (tx, rx) = mpsc::channel();
            std::thread::spawn(move || {
                match ipc::pipe_server_create("dmnote_keys_v1") {
                    Ok(f) => { let _ = tx.send(Some(f)); }
                    Err(err) => { warn!("failed to create named pipe: {err}"); let _ = tx.send(None); }
                }
            });
            Some(rx)
        };
        #[cfg(not(target_os = "windows"))]
        let pipe_receiver: Option<std::sync::mpsc::Receiver<Option<std::fs::File>>> = None;
        let mut child = Command::new(current_exe)
            .arg("--keyboard-daemon")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("failed to spawn keyboard daemon process")?;

        let stdout = child
            .stdout
            .take()
            .context("keyboard daemon stdout unavailable")?;
        let stderr = child.stderr.take();

        let running = Arc::new(AtomicBool::new(true));
        let running_reader = running.clone();
        let keyboard = self.keyboard.clone();
        let app_handle = app.clone();

        let reader_handle = thread::Builder::new()
            .name("keyboard-daemon-reader".into())
            .spawn(move || {
                // Prefer Named Pipe if available; otherwise, use stdout
                #[allow(unused_mut)]
                let mut reader: BufReader<Box<dyn std::io::Read + Send>> = {
                    #[cfg(target_os = "windows")]
                    {
                        if let Some(rx) = pipe_receiver {
                            // Wait a short time for the pipe to be ready; otherwise, fall back to stdout.
                            match rx.recv_timeout(Duration::from_millis(1500)) {
                                Ok(Some(f)) => BufReader::new(Box::new(f)),
                                _ => BufReader::new(Box::new(stdout)),
                            }
                        } else {
                            BufReader::new(Box::new(stdout))
                        }
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        BufReader::new(Box::new(stdout))
                    }
                };
                let mut overlay_window = app_handle.get_webview_window(OVERLAY_LABEL);
                // Elevate reader thread priority slightly on Windows
                #[cfg(target_os = "windows")]
                unsafe {
                    use windows::Win32::System::Threading::{GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_ABOVE_NORMAL};
                    let _ = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_ABOVE_NORMAL);
                }

                while running_reader.load(Ordering::SeqCst) {
                    let mut line = String::new();
                    match reader.read_line(&mut line) {
                        Ok(0) => break,
                        Ok(_) => {
                            let s = line.trim();
                            if s.len() < 3 || !s.as_bytes().get(1).map(|c| *c == b':').unwrap_or(false) {
                                continue;
                            }
                            let (state_ch, rest) = s.split_at(1);
                            let key = &rest[1..];
                            if key.is_empty() {
                                continue;
                            }
                            let state = if state_ch == "D" { "DOWN" } else { "UP" };
                            let Some(key_label) = keyboard.match_candidate(std::iter::once(key)) else { continue };
                            let mode = keyboard.current_mode();
                            let app_state = app_handle.state::<AppState>();
                            if state == "DOWN" {
                                if app_state.register_key_down(&mode, &key_label) {
                                    if let Some(count) = app_state.increment_key_counter(&mode, &key_label) {
                                        if let Err(err) = app_handle.emit(
                                            "keys:counter",
                                            &json!({
                                                "mode": mode.clone(),
                                                "key": key_label.clone(),
                                                "count": count,
                                            }),
                                        ) {
                                            error!("failed to emit keys:counter event: {err}");
                                        }
                                    }
                                }
                            } else {
                                app_state.register_key_up(&mode, &key_label);
                            }
                            let payload = json!({ "key": key_label, "state": state, "mode": mode });

                            let mut emitted = false;
                            if let Some(overlay) = overlay_window.as_ref() {
                                match overlay.emit("keys:state", &payload) {
                                    Ok(_) => emitted = true,
                                    Err(err) => { error!("failed to emit keys:state to overlay: {err}"); overlay_window = None; }
                                }
                            }
                            if !emitted {
                                if overlay_window.is_none() {
                                    overlay_window = app_handle.get_webview_window(OVERLAY_LABEL);
                                    if let Some(overlay) = overlay_window.as_ref() {
                                        if overlay.emit("keys:state", &payload).is_ok() { emitted = true; } else { overlay_window = None; }
                                    }
                                }
                                if !emitted {
                                    if let Err(err) = app_handle.emit("keys:state", &payload) {
                                        error!("failed to emit keys:state (fallback): {err}");
                                    }
                                }
                            }
                        }
                        Err(err) => {
                            if err.kind() == std::io::ErrorKind::Interrupted || err.kind() == std::io::ErrorKind::WouldBlock { continue; }
                            break;
                        }
                    }
                }
            })
            .map_err(|err| anyhow!("failed to spawn keyboard daemon reader: {err}"))?;

        let stderr_handle = if let Some(stderr) = stderr {
            match thread::Builder::new()
                .name("keyboard-daemon-stderr".into())
                .spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines() {
                        match line {
                            Ok(text) if !text.trim().is_empty() => {
                                warn!("keyboard-daemon stderr: {text}");
                            }
                            Ok(_) => {}
                            Err(err) => {
                                error!("error reading keyboard daemon stderr: {err}");
                                break;
                            }
                        }
                    }
                }) {
                Ok(handle) => Some(handle),
                Err(err) => {
                    warn!("failed to spawn keyboard daemon stderr reader: {err}");
                    None
                }
            }
        } else {
            None
        };

        *task_guard = Some(KeyboardDaemonTask {
            running,
            reader_handle: Some(reader_handle),
            stderr_handle,
            child: Some(child),
        });
        Ok(())
    }

    fn ensure_overlay_window(&self, app: &AppHandle) -> Result<WebviewWindow> {
        if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
            return Ok(window);
        }

        let snapshot = self.store.snapshot();
        let monitor_data = MonitorData::gather(app);

        let (mut bounds, had_bounds, mut bounds_are_logical) = if let Some(mut bounds) =
            snapshot.overlay_bounds.clone()
        {
            let mut is_logical = snapshot.overlay_bounds_are_logical;
            if !is_logical {
                if let Some(converted) = convert_physical_bounds_to_logical(&bounds, &monitor_data)
                {
                    bounds = converted;
                    is_logical = true;
                }
            }
            (bounds, true, is_logical)
        } else {
            (
                OverlayBounds {
                    x: 0.0,
                    y: 0.0,
                    width: DEFAULT_OVERLAY_WIDTH,
                    height: DEFAULT_OVERLAY_HEIGHT,
                },
                false,
                true,
            )
        };

        let position = self.compute_overlay_position(&bounds, had_bounds, &monitor_data);
        bounds.x = position.x;
        bounds.y = position.y;
        if !monitor_data.is_empty() {
            bounds_are_logical = true;
        }

        let window = WebviewWindowBuilder::new(
            app,
            OVERLAY_LABEL,
            WebviewUrl::App("overlay/index.html".into()),
        )
        .title("DM Note - Overlay")
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(false)
        .visible(true)
        .inner_size(bounds.width, bounds.height)
        .position(bounds.x, bounds.y)
        .shadow(false)
        .devtools(true)
        .build()
        .context("failed to create overlay window")?;

        window.set_ignore_cursor_events(snapshot.overlay_locked)?;
        window.set_always_on_top(snapshot.always_on_top)?;
        let _ = window.set_maximizable(false);

        self.overlay_force_close.store(false, Ordering::SeqCst);

        *self.overlay_visible.write() = true;

        let _ = self.store.update(|state| {
            state.overlay_bounds = Some(bounds.clone());
            state.overlay_bounds_are_logical = bounds_are_logical;
        })?;

        self.configure_overlay_window(&window, app);

        Ok(window)
    }

    fn configure_overlay_window(&self, window: &WebviewWindow, app: &AppHandle) {
        let overlay_visible = self.overlay_visible.clone();
        let store = self.store.clone();
        let app_handle = app.clone();
        let overlay_window = window.clone();
        let force_close_flag = self.overlay_force_close.clone();

        window.on_window_event(move |event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                if force_close_flag.swap(false, Ordering::SeqCst) {
                    *overlay_visible.write() = false;
                } else {
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
            }
            WindowEvent::Focused(true) => {
                focus_main_window(&app_handle);
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
        bounds: &OverlayBounds,
        had_stored_bounds: bool,
        monitors: &MonitorData,
    ) -> OverlayPosition {
        if monitors.is_empty() {
            return if had_stored_bounds {
                OverlayPosition {
                    x: bounds.x,
                    y: bounds.y,
                }
            } else {
                OverlayPosition {
                    x: OVERLAY_MARGIN,
                    y: OVERLAY_MARGIN,
                }
            };
        }

        let fallback = monitors
            .primary_spec()
            .cloned()
            .or_else(|| monitors.first().cloned());

        let Some(fallback_spec) = fallback else {
            return OverlayPosition {
                x: bounds.x,
                y: bounds.y,
            };
        };

        let target_spec = if had_stored_bounds {
            let center_x = bounds.x + bounds.width / 2.0;
            let center_y = bounds.y + bounds.height / 2.0;
            monitors
                .find_by_logical(center_x, center_y)
                .cloned()
                .unwrap_or(fallback_spec.clone())
        } else {
            fallback_spec.clone()
        };

        let base_x = if had_stored_bounds {
            bounds.x
        } else {
            target_spec.logical_origin_x + target_spec.logical_width - bounds.width - OVERLAY_MARGIN
        };

        let base_y = if had_stored_bounds {
            bounds.y
        } else {
            target_spec.logical_origin_y + target_spec.logical_height
                - bounds.height
                - OVERLAY_MARGIN
        };

        target_spec.clamp(base_x, base_y, bounds.width, bounds.height)
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

        if let Some(enabled) = diff.changed.developer_mode_enabled {
            // 활성화 시에만 DevTools 열기 
            if enabled {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.open_devtools();
                }
                if let Some(overlay) = app.get_webview_window(OVERLAY_LABEL) {
                    let _ = overlay.open_devtools();
                }
            }
        }

        Ok(())
    }

    pub fn increment_key_counter(&self, mode: &str, key: &str) -> Option<u32> {
        if !self.key_counter_enabled.load(Ordering::Relaxed) {
            return None;
        }
        let mut counters = self.key_counters.write();
        let mode_entry = counters.entry(mode.to_string()).or_default();
        let count = mode_entry.entry(key.to_string()).or_insert(0);
        *count = count.saturating_add(1);
        Some(*count)
    }

    pub fn snapshot_key_counters(&self) -> KeyCounters {
        self.key_counters.read().clone()
    }

    pub fn reset_key_counters(&self) -> KeyCounters {
        let mut counters = self.key_counters.write();
        for mode_entry in counters.values_mut() {
            for value in mode_entry.values_mut() {
                *value = 0;
            }
        }
        counters.clone()
    }

    pub fn reset_mode_counters(&self, mode: &str) {
        let mut counters = self.key_counters.write();
        if let Some(entry) = counters.get_mut(mode) {
            for value in entry.values_mut() {
                *value = 0;
            }
        }
    }

    pub fn register_key_down(&self, mode: &str, key: &str) -> bool {
        let mut guard = self.active_keys.write();
        guard.insert(Self::compose_active_key(mode, key))
    }

    pub fn register_key_up(&self, mode: &str, key: &str) {
        let mut guard = self.active_keys.write();
        guard.remove(&Self::compose_active_key(mode, key));
    }

    pub fn clear_active_keys(&self) {
        self.active_keys.write().clear();
    }

    pub fn persist_key_counters(&self) -> Result<KeyCounters> {
        let snapshot = self.key_counters.read().clone();
        self.store.set_key_counters(snapshot.clone())?;
        Ok(snapshot)
    }

    pub fn sync_counters_with_keys(&self, keys: &KeyMappings) {
        Self::sync_counters_with_keys_impl(&self.key_counters, keys);
    }

    fn sync_counters_with_keys_impl(target: &Arc<RwLock<KeyCounters>>, keys: &KeyMappings) {
        let mut guard = target.write();
        guard.retain(|mode, _| keys.contains_key(mode));
        for (mode, key_list) in keys.iter() {
            let entry = guard.entry(mode.clone()).or_default();
            entry.retain(|key, _| key_list.contains(key));
            for key in key_list.iter() {
                entry.entry(key.clone()).or_insert(0);
            }
        }
    }

    fn compose_active_key(mode: &str, key: &str) -> String {
        format!("{}::{}", mode, key)
    }
}

impl Drop for AppState {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn focus_main_window(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        if let Err(err) = main.set_focus() {
            log::debug!("failed to refocus main window: {err}");
        }
    }
}

fn attach_main_window_close_handler(
    window: WebviewWindow,
    overlay_force_close: Arc<AtomicBool>,
    app_handle: AppHandle,
) {
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. }) {
            {
                let state = app_handle.state::<AppState>();
                state.shutdown();
            }
            overlay_force_close.store(true, Ordering::SeqCst);
            if let Some(overlay) = app_handle.get_webview_window(OVERLAY_LABEL) {
                if let Err(err) = overlay.close() {
                    log::warn!(
                        "failed to close overlay window during main window shutdown: {err}"
                    );
                }
            }
            app_handle.exit(0);
        }
    });
}

fn show_overlay_window(window: &WebviewWindow) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};

        let hwnd = window.hwnd()?;
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        window.show()?;
        Ok(())
    }
}

fn hide_overlay_window(window: &WebviewWindow) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE};

        let hwnd = window.hwnd()?;
        unsafe {
            let _ = ShowWindow(hwnd, SW_HIDE);
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        window.hide()?;
        Ok(())
    }
}

fn convert_physical_bounds_to_logical(
    bounds: &OverlayBounds,
    monitors: &MonitorData,
) -> Option<OverlayBounds> {
    if monitors.is_empty() {
        return None;
    }

    let center_x = bounds.x + bounds.width / 2.0;
    let center_y = bounds.y + bounds.height / 2.0;

    let scale = monitors
        .find_by_physical(center_x, center_y)
        .map(|spec| spec.scale_factor)
        .unwrap_or_else(|| monitors.fallback_scale());

    if !scale.is_finite() || scale <= 0.0 {
        return None;
    }

    Some(OverlayBounds {
        x: bounds.x / scale,
        y: bounds.y / scale,
        width: bounds.width / scale,
        height: bounds.height / scale,
    })
}

#[derive(Clone)]
struct MonitorSpec {
    logical_origin_x: f64,
    logical_origin_y: f64,
    logical_width: f64,
    logical_height: f64,
    physical_origin_x: f64,
    physical_origin_y: f64,
    physical_width: f64,
    physical_height: f64,
    scale_factor: f64,
}

impl MonitorSpec {
    fn from_monitor(monitor: Monitor) -> Option<Self> {
        let scale = monitor.scale_factor();
        let work_area = monitor.work_area();
        let origin = work_area.position;
        let size = work_area.size;

        let logical_origin = origin.to_logical::<f64>(scale);
        let logical_size = size.to_logical::<f64>(scale);

        Some(Self {
            logical_origin_x: logical_origin.x,
            logical_origin_y: logical_origin.y,
            logical_width: logical_size.width,
            logical_height: logical_size.height,
            physical_origin_x: origin.x as f64,
            physical_origin_y: origin.y as f64,
            physical_width: size.width as f64,
            physical_height: size.height as f64,
            scale_factor: scale,
        })
    }

    fn matches(&self, other: &Self) -> bool {
        (self.physical_origin_x - other.physical_origin_x).abs() < 0.5
            && (self.physical_origin_y - other.physical_origin_y).abs() < 0.5
            && (self.physical_width - other.physical_width).abs() < 0.5
            && (self.physical_height - other.physical_height).abs() < 0.5
            && (self.scale_factor - other.scale_factor).abs() < f64::EPSILON
    }

    fn contains_logical(&self, x: f64, y: f64) -> bool {
        x >= self.logical_origin_x
            && x <= self.logical_origin_x + self.logical_width
            && y >= self.logical_origin_y
            && y <= self.logical_origin_y + self.logical_height
    }

    fn contains_physical(&self, x: f64, y: f64) -> bool {
        x >= self.physical_origin_x
            && x <= self.physical_origin_x + self.physical_width
            && y >= self.physical_origin_y
            && y <= self.physical_origin_y + self.physical_height
    }

    fn clamp(&self, x: f64, y: f64, width: f64, height: f64) -> OverlayPosition {
        let max_x = self.logical_origin_x + (self.logical_width - width).max(0.0);
        let max_y = self.logical_origin_y + (self.logical_height - height).max(0.0);

        OverlayPosition {
            x: x.clamp(self.logical_origin_x, max_x),
            y: y.clamp(self.logical_origin_y, max_y),
        }
    }
}

struct MonitorData {
    specs: Vec<MonitorSpec>,
    primary_index: Option<usize>,
}

impl MonitorData {
    fn gather(app: &AppHandle) -> Self {
        let mut specs: Vec<MonitorSpec> = app
            .available_monitors()
            .ok()
            .unwrap_or_default()
            .into_iter()
            .filter_map(MonitorSpec::from_monitor)
            .collect();

        let mut primary_index = None;
        if let Ok(Some(primary)) = app.primary_monitor() {
            if let Some(primary_spec) = MonitorSpec::from_monitor(primary) {
                primary_index = specs.iter().position(|spec| spec.matches(&primary_spec));

                if primary_index.is_none() {
                    specs.push(primary_spec);
                    primary_index = Some(specs.len() - 1);
                }
            }
        }

        Self {
            specs,
            primary_index,
        }
    }

    fn is_empty(&self) -> bool {
        self.specs.is_empty()
    }

    fn primary_spec(&self) -> Option<&MonitorSpec> {
        self.primary_index
            .and_then(|idx| self.specs.get(idx))
            .or_else(|| self.specs.first())
    }

    fn fallback_scale(&self) -> f64 {
        self.primary_spec()
            .map(|spec| spec.scale_factor)
            .unwrap_or(1.0)
    }

    fn find_by_physical(&self, x: f64, y: f64) -> Option<&MonitorSpec> {
        self.specs.iter().find(|spec| spec.contains_physical(x, y))
    }

    fn find_by_logical(&self, x: f64, y: f64) -> Option<&MonitorSpec> {
        self.specs.iter().find(|spec| spec.contains_logical(x, y))
    }

    fn first(&self) -> Option<&MonitorSpec> {
        self.specs.first()
    }
}

fn persist_overlay_bounds(window: &WebviewWindow, store: &Arc<AppStore>) -> Result<()> {
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let position = window.outer_position()?.to_logical::<f64>(scale_factor);
    let size = window.outer_size()?.to_logical::<f64>(scale_factor);

    let bounds = OverlayBounds {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    };

    let _ = store.update(|state| {
        state.overlay_bounds = Some(bounds.clone());
        state.overlay_bounds_are_logical = true;
    })?;
    Ok(())
}

struct KeyboardDaemonTask {
    running: Arc<AtomicBool>,
    reader_handle: Option<JoinHandle<()>>,
    stderr_handle: Option<JoinHandle<()>>,
    child: Option<Child>,
}

impl Drop for KeyboardDaemonTask {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);

        if let Some(child) = self.child.as_mut() {
            if let Err(err) = child.kill() {
                if err.kind() != std::io::ErrorKind::InvalidInput {
                    warn!("failed to kill keyboard daemon: {err}");
                }
            }
            let _ = child.wait();
        }

        if let Some(handle) = self.reader_handle.take() {
            let _ = handle.join();
        }

        if let Some(handle) = self.stderr_handle.take() {
            let _ = handle.join();
        }
    }
}

#[derive(Clone)]
struct OverlayPosition {
    x: f64,
    y: f64,
}

