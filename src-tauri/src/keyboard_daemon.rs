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

pub fn run() -> Result<()> {
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
                    HookKeyState::Down => format!("D:{}\n", message.labels.get(0).cloned().unwrap_or_default()),
                    HookKeyState::Up => format!("U:{}\n", message.labels.get(0).cloned().unwrap_or_default()),
                };
                sink.write_all(s.as_bytes())?;
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }

    Ok(())
}
