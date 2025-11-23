use willhook::hook::event::{IsKeyboardEventInjected, KeyboardEvent, KeyboardKey};

const LLKHF_EXTENDED: u32 = 0x01;

pub fn build_key_labels(event: &KeyboardEvent) -> Vec<String> {
    let mut labels = Vec::new();

    // Handle Right Alt / Han/Eng key specifically by VK code first
    // VK_RMENU (0xA5/165): Right Alt in US keyboard layout -> map to "21"
    // VK_HANGUL (0x15/21): Han/Eng toggle in Korean IME (same physical key) -> use "21"
    if let Some(vk_code) = event.vk_code {
        if vk_code == 0xA5 || vk_code == 0x15 {
            labels.push("21".to_string());
            labels.push("RIGHT ALT".to_string());
            return labels;
        }
    }

    if let Some(label) = numpad_override_label(event) {
        labels.push(label.to_string());
    } else if let Some(key) = event.key {
        extend_unique(&mut labels, keyboard_key_to_global(key));
    }

    if labels.is_empty() {
        if let Some(vk_code) = event.vk_code {
            labels.push(vk_code.to_string());
        } else if let Some(scan_code) = event.scan_code {
            labels.push(scan_code.to_string());
        }
    }

    labels
}

pub fn should_skip_keyboard_event(event: &KeyboardEvent) -> bool {
    let is_shift = matches!(event.vk_code, Some(0x10) | Some(0xA0) | Some(0xA1))
        || matches!(
            event.key,
            Some(KeyboardKey::LeftShift) | Some(KeyboardKey::RightShift)
        );

    if !is_shift {
        return false;
    }

    if matches!(event.is_injected, Some(IsKeyboardEventInjected::Injected)) {
        return true;
    }

    if matches!(event.scan_code, Some(554)) {
        return true;
    }

    false
}

fn extend_unique(target: &mut Vec<String>, items: Vec<String>) {
    for item in items {
        if !target.iter().any(|existing| existing == &item) {
            target.push(item);
        }
    }
}

fn numpad_override_label(event: &KeyboardEvent) -> Option<&'static str> {
    let scan_code = event.scan_code?;
    let label = match scan_code {
        82 => "NUMPAD 0",
        79 => "NUMPAD 1",
        80 => "NUMPAD 2",
        81 => "NUMPAD 3",
        75 => "NUMPAD 4",
        76 => "NUMPAD 5",
        77 => "NUMPAD 6",
        71 => "NUMPAD 7",
        72 => "NUMPAD 8",
        73 => "NUMPAD 9",
        28 => "NUMPAD RETURN",
        83 => "NUMPAD DELETE",
        _ => return None,
    };

    let flags = event.flags.unwrap_or(0);
    let is_extended = (flags & LLKHF_EXTENDED) != 0;

    match scan_code {
        28 => {
            if is_extended {
                Some(label)
            } else {
                None
            }
        }
        _ => {
            if !is_extended {
                Some(label)
            } else {
                None
            }
        }
    }
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
        93 => vec!["CONTEXT MENU".to_string(), "APPS".to_string()],
        19 => vec!["PAUSE".to_string()],
        255 => vec!["PAUSE".to_string()],
        // VK_END (0x23 / 35) is not mapped in KeyboardKey,
        // so it comes through as Other(35); normalize to "END"
        // to match frontend key map expectations.
        35 => vec!["END".to_string()],
        _ => vec![code.to_string()],
    }
}
