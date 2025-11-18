use std::io::Write;

use anyhow::{anyhow, Result};
use bincode::Options;
use willhook::{
    hook::event::{InputEvent, KeyPress},
    keyboard_hook,
};

use crate::{
    ipc::{pipe_client_connect, HookKeyState, HookMessage},
    keyboard_labels::{build_key_labels, should_skip_keyboard_event},
};

/// Toggle for experimental Raw Input backend.
///
/// Set to `true` to use Raw Input (Windows Raw Input API).
/// Set to `false` to use the existing willhook-based low-level hook backend.
const USE_RAW_INPUT_BACKEND: bool = true;

pub fn run() -> Result<()> {
    if USE_RAW_INPUT_BACKEND {
        #[cfg(target_os = "windows")]
        {
            return run_raw_input();
        }

        #[cfg(not(target_os = "windows"))]
        {
            return Err(anyhow!("Raw Input backend is only available on Windows"));
        }
    }

    run_willhook()
}

fn run_willhook() -> Result<()> {
    let Some(hook) = keyboard_hook() else {
        return Err(anyhow!("failed to install global keyboard hook"));
    };

    // Try to connect to named pipe; fall back to stdout if unavailable
    let mut sink: Box<dyn Write + Send> = match pipe_client_connect("dmnote_keys_v1") {
        Ok(file) => Box::new(file),
        Err(_) => Box::new(std::io::stdout()),
    };
    let _codec = bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .allow_trailing_bytes();

    loop {
        match hook.recv() {
            Ok(InputEvent::Keyboard(event)) => {
                if should_skip_keyboard_event(&event) {
                    continue;
                }

                let labels = build_key_labels(&event);
                if labels.is_empty() {
                    continue;
                }

                let state = match event.pressed {
                    KeyPress::Down(_) => HookKeyState::Down,
                    KeyPress::Up(_) => HookKeyState::Up,
                    _ => continue,
                };

                let message = HookMessage {
                    labels,
                    state,
                    vk_code: event.vk_code,
                    scan_code: event.scan_code,
                    flags: event.flags,
                };

                // Compact payload: "D:<key>" or "U:<key>" (first matched label chosen by main)
                // Keep bincode as fallback channel structure if needed later.
                let s = match message.state {
                    HookKeyState::Down => {
                        format!("D:{}\n", message.labels.get(0).cloned().unwrap_or_default())
                    }
                    HookKeyState::Up => {
                        format!("U:{}\n", message.labels.get(0).cloned().unwrap_or_default())
                    }
                };
                sink.write_all(s.as_bytes())?;
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn run_raw_input() -> Result<()> {
    use std::ffi::c_void;
    use std::mem::size_of;

    use willhook::hook::event::{IsKeyboardEventInjected, KeyboardEvent, KeyboardKey};
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{GetLastError, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Input::{
        GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE,
        RAWINPUTHEADER, RIDEV_INPUTSINK, RIDEV_NOLEGACY, RID_INPUT, RIM_TYPEKEYBOARD,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassExW,
        TranslateMessage, CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, MSG, WNDCLASSEXW,
        WM_DESTROY, WM_INPUT, WM_QUIT, WS_OVERLAPPEDWINDOW, PostQuitMessage, RI_KEY_E0,
        RI_KEY_BREAK,
    };

    // Try to connect to named pipe; fall back to stdout if unavailable
    let mut sink: Box<dyn Write + Send> = match pipe_client_connect("dmnote_keys_v1") {
        Ok(file) => Box::new(file),
        Err(_) => Box::new(std::io::stdout()),
    };

    unsafe extern "system" fn wndproc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_DESTROY => {
                // Signal message loop to quit; keyboard daemon process should exit shortly after.
                PostQuitMessage(0);
                LRESULT(0)
            }
            _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
        }
    }

    unsafe {
        // Register a minimal window class for receiving WM_INPUT.
        let class_name: Vec<u16> = "DmNoteRawInput\0".encode_utf16().collect();
        use windows::Win32::System::LibraryLoader::GetModuleHandleW;
        let hinstance = GetModuleHandleW(None)?;

        let wnd_class = WNDCLASSEXW {
            cbSize: size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(wndproc),
            hInstance: hinstance.into(),
            lpszClassName: PCWSTR(class_name.as_ptr()),
            ..Default::default()
        };

        if RegisterClassExW(&wnd_class) == 0 {
            return Err(anyhow!(
                "RegisterClassExW failed: {:?}",
                GetLastError()
            ));
        }

        let hwnd = CreateWindowExW(
            Default::default(),
            PCWSTR(class_name.as_ptr()),
            PCWSTR(class_name.as_ptr()),
            WS_OVERLAPPEDWINDOW,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            None,
            None,
            Some(hinstance.into()),
            None,
        )?;

        // Register for Raw Input keyboard events, even when not in focus.
        let rid = RAWINPUTDEVICE {
            usUsagePage: 0x01,
            usUsage: 0x06, // Keyboard
            dwFlags: RIDEV_INPUTSINK | RIDEV_NOLEGACY,
            hwndTarget: hwnd,
        };

        RegisterRawInputDevices(&[rid], size_of::<RAWINPUTDEVICE>() as u32)
            .map_err(|e| anyhow!("RegisterRawInputDevices failed: {e}"))?;

        // Message loop: process WM_INPUT and translate to HookMessage.
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).into() {
            if msg.message == WM_INPUT {
                // First query required buffer size.
                let mut size: u32 = 0;
                let header_size = size_of::<RAWINPUTHEADER>() as u32;
                let hraw = HRAWINPUT(msg.lParam.0 as *mut c_void);
                let res = GetRawInputData(
                    hraw,
                    RID_INPUT,
                    None,
                    &mut size,
                    header_size,
                );
                if res == u32::MAX || size == 0 {
                    continue;
                }

                let mut buffer: Vec<u8> = Vec::with_capacity(size as usize);
                buffer.set_len(size as usize);

                let hraw = HRAWINPUT(msg.lParam.0 as *mut c_void);
                let res = GetRawInputData(
                    hraw,
                    RID_INPUT,
                    Some(buffer.as_mut_ptr() as *mut c_void),
                    &mut size,
                    header_size,
                );
                if res == u32::MAX {
                    continue;
                }

                let raw: &RAWINPUT = &*(buffer.as_ptr() as *const RAWINPUT);
                // Ignore non-keyboard raw input.
                if raw.header.dwType != RIM_TYPEKEYBOARD.0 {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                    continue;
                }

                let kbd = unsafe { raw.data.keyboard };
                let vkey = kbd.VKey as u32;
                let scan_code = kbd.MakeCode as u32;
                let flags = kbd.Flags as u32;

                // Normalize virtual key so that left/right modifiers and others
                // match willhook's expectations.
                let mut vk_norm = vkey;

                const VK_SHIFT: u32 = 0x10;
                const VK_CONTROL: u32 = 0x11;
                const VK_MENU: u32 = 0x12;
                const VK_LSHIFT: u32 = 0xA0;
                const VK_RSHIFT: u32 = 0xA1;
                const VK_LCONTROL: u32 = 0xA2;
                const VK_RCONTROL: u32 = 0xA3;
                const VK_LMENU: u32 = 0xA4;
                const VK_RMENU: u32 = 0xA5;

                // SHIFT: Raw Input 종종 VK_SHIFT + scan code(좌 42, 우 54)로 들어옴.
                if vk_norm == VK_SHIFT {
                    match scan_code {
                        42 => vk_norm = VK_LSHIFT,
                        54 => vk_norm = VK_RSHIFT,
                        _ => {}
                    }
                }

                // CTRL: VK_CONTROL + E0 플래그로 좌/우를 구분하는 경우 대비.
                if vk_norm == VK_CONTROL {
                    if (flags & RI_KEY_E0) != 0 {
                        vk_norm = VK_RCONTROL;
                    } else {
                        vk_norm = VK_LCONTROL;
                    }
                }

                // ALT: VK_MENU + E0 플래그로 좌/우를 구분하는 경우 대비.
                if vk_norm == VK_MENU {
                    if (flags & RI_KEY_E0) != 0 {
                        vk_norm = VK_RMENU;
                    } else {
                        vk_norm = VK_LMENU;
                    }
                }

                let key = Some(KeyboardKey::from(vk_norm));

                // Map Raw Input flags to KeyPress (down/up),
                // using RI_KEY_BREAK similar to multiinput.
                let is_break = (flags & RI_KEY_BREAK) != 0;
                let pressed = if is_break {
                    KeyPress::Up(false)
                } else {
                    KeyPress::Down(false)
                };

                // Map Raw Input extended flag to low-level hook-style flags
                // so that keyboard_labels' numpad/extended logic behaves identically.
                let mut ll_flags = 0u32;
                if (flags & RI_KEY_E0) != 0 {
                    // LLKHF_EXTENDED == 0x01 in keyboard_labels.rs
                    ll_flags |= 0x01;
                }

                let event = KeyboardEvent {
                    pressed,
                    key,
                    vk_code: Some(vk_norm),
                    scan_code: Some(scan_code),
                    flags: Some(ll_flags),
                    is_injected: Some(IsKeyboardEventInjected::NotInjected),
                };

                if should_skip_keyboard_event(&event) {
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                    continue;
                }

                let labels = build_key_labels(&event);
                if labels.is_empty() {
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                    continue;
                }

                let state = match event.pressed {
                    KeyPress::Down(_) => HookKeyState::Down,
                    KeyPress::Up(_) => HookKeyState::Up,
                    _ => {
                        TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                        continue;
                    }
                };

                let message = HookMessage {
                    labels,
                    state,
                    vk_code: event.vk_code,
                    scan_code: event.scan_code,
                    flags: event.flags,
                };

                let s = match message.state {
                    HookKeyState::Down => {
                        format!("D:{}\n", message.labels.get(0).cloned().unwrap_or_default())
                    }
                    HookKeyState::Up => {
                        format!("U:{}\n", message.labels.get(0).cloned().unwrap_or_default())
                    }
                };

                let _ = sink.write_all(s.as_bytes());
            }

            TranslateMessage(&msg);
            DispatchMessageW(&msg);

            if msg.message == WM_QUIT {
                break;
            }
        }
    }

    Ok(())
}
