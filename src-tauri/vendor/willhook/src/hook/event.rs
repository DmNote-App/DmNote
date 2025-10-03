#![allow(non_snake_case)]

use std::convert::From;
use winapi::shared::windef::*;
use winapi::shared::minwindef::*;
use winapi::um::winuser::*;

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub enum InputEvent {
    Keyboard(KeyboardEvent),
    Mouse(MouseEvent),
    Ohter(u32),
}

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub struct KeyboardEvent {
    pub pressed: KeyPress,
    pub key: Option<KeyboardKey>,
    pub vk_code: Option<u32>,
    pub scan_code: Option<u32>,
    pub flags: Option<u32>,
    pub is_injected: Option<IsKeyboardEventInjected>,
}

impl KeyboardEvent {
    pub unsafe fn new(wm_key_code: WPARAM, kbd_hook_struct: *const KBDLLHOOKSTRUCT) -> Self {
        let (vk_code, scan_code, flags) = if kbd_hook_struct.is_null() {
            (None, None, None)
        } else {
            let data = &*kbd_hook_struct;
            (
                Some(data.vkCode as u32),
                Some(data.scanCode as u32),
                Some(data.flags as u32),
            )
        };

        KeyboardEvent{
            pressed: KeyPress::from(wm_key_code),
            key: KeyboardKey::optionally_from(kbd_hook_struct),
            vk_code,
            scan_code,
            flags,
            is_injected: IsKeyboardEventInjected::optionally_from(kbd_hook_struct),
        }

    }
}

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub enum IsKeyboardEventInjected {
    Injected,
    NotInjected,
}

impl IsKeyboardEventInjected {
    unsafe fn optionally_from(value: *const KBDLLHOOKSTRUCT) -> Option<Self> {
        if value.is_null() {
            None
        } else {
            Some(IsKeyboardEventInjected::from((*value).flags))
        }
    }
}

impl From<DWORD> for IsKeyboardEventInjected {
    fn from(value: DWORD) -> Self {
        let i1 = 0 != value & LLKHF_INJECTED;
        let i2 = 0 != value & LLKHF_LOWER_IL_INJECTED;
        use IsKeyboardEventInjected::*;
        match i1 || i2 {
            true => Injected,
            false => NotInjected,
        }
    }
}

/// WIP: Enum to distinguish system key press from normal key press.
pub enum IsSystemKeyPress {
    /// System key is basically any key pressed/released while ALT is also pressed.
    System,
    /// Indicates that key input event occured while ALT key was NOT pressed.
    Normal,
}

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub enum KeyPress {
    Down(bool),
    Up(bool),
    Other(usize),
}

impl From<WPARAM> for KeyPress {
    fn from(code: WPARAM) -> Self {
        use KeyPress::*;
        match code.try_into() {
            Ok(WM_KEYDOWN) => Down(false),
            Ok(WM_KEYUP) => Up(false),
            Ok(WM_SYSKEYDOWN) => Down(true),
            Ok(WM_SYSKEYUP) => Up(true),
            // Either we failed to convert or 
            // it is not one of our supported values
            _ => Other(code),
        }
    }
}

/// From u32 to usize
impl From<KeyPress> for WPARAM {
    fn from(code: KeyPress) -> Self {
        use KeyPress::*;
        match code {
            Up(is_sys) => {
                match is_sys {
                    false => WM_KEYUP as WPARAM,
                    true => WM_SYSKEYUP as WPARAM,
                }
            },
            Down(is_sys) => {
                match is_sys {
                    false => WM_KEYDOWN as WPARAM,
                    true => WM_SYSKEYUP as WPARAM,
                }
            },
            Other(usize) => usize as WPARAM,
        }
    }
}

impl From<DWORD> for KeyboardKey {
    fn from(code: DWORD) -> Self {
        use KeyboardKey::*;
        match code.try_into() {
            Ok(sc) => {
                match sc {
                    VK_BACK => BackSpace,
                    VK_TAB => Tab,
                    VK_RETURN => Enter,
                    VK_ESCAPE => Escape,
                    VK_SPACE => Space,
                    VK_PRIOR => PageUp,
                    VK_NEXT => PageDown,
                    VK_HOME => Home,
                    VK_LEFT => ArrowLeft,
                    VK_UP => ArrowUp,
                    VK_RIGHT => ArrowRight,
                    VK_DOWN => ArrowDown,
                    VK_PRINT => Print,
                    VK_SNAPSHOT => PrintScreen,
                    VK_INSERT => Insert,
                    VK_DELETE => Delete,
                    VK_0 => Number0,
                    VK_1 => Number1,
                    VK_2 => Number2,
                    VK_3 => Number3,
                    VK_4 => Number4,
                    VK_5 => Number5,
                    VK_6 => Number6,
                    VK_7 => Number7,
                    VK_8 => Number8,
                    VK_9 => Number9,
                    VK_A => A,
                    VK_B => B,
                    VK_C => C,
                    VK_D => D,
                    VK_E => E,
                    VK_F => F,
                    VK_G => G,
                    VK_H => H,
                    VK_I => I,
                    VK_J => J,
                    VK_K => K,
                    VK_L => L,
                    VK_M => M,
                    VK_N => N,
                    VK_O => O,
                    VK_P => P,
                    VK_Q => Q,
                    VK_R => R,
                    VK_S => S,
                    VK_T => T,
                    VK_U => U,
                    VK_V => V,
                    VK_W => W,
                    VK_X => X,
                    VK_Y => Y,
                    VK_Z => Z,
                    VK_LWIN => LeftWindows,
                    VK_RWIN => RightWindows,
                    VK_NUMPAD0 => Numpad0,
                    VK_NUMPAD1 => Numpad1,
                    VK_NUMPAD2 => Numpad2,
                    VK_NUMPAD3 => Numpad3,
                    VK_NUMPAD4 => Numpad4,
                    VK_NUMPAD5 => Numpad5,
                    VK_NUMPAD6 => Numpad6,
                    VK_NUMPAD7 => Numpad7,
                    VK_NUMPAD8 => Numpad8,
                    VK_NUMPAD9 => Numpad9,
                    VK_MULTIPLY => Multiply,
                    VK_ADD => Add,
                    VK_SEPARATOR => Separator,
                    VK_SUBTRACT => Subtract,
                    VK_DECIMAL => Decimal,
                    VK_DIVIDE => Divide,
                    VK_F1 => F1,
                    VK_F2 => F2,
                    VK_F3 => F3,
                    VK_F4 => F4,
                    VK_F5 => F5,
                    VK_F6 => F6,
                    VK_F7 => F7,
                    VK_F8 => F8,
                    VK_F9 => F9,
                    VK_F10 => F10,
                    VK_F11 => F11,
                    VK_F12 => F12,
                    VK_F13 => F13,
                    VK_F14 => F14,
                    VK_F15 => F15,
                    VK_F16 => F16,
                    VK_F17 => F17,
                    VK_F18 => F18,
                    VK_F19 => F19,
                    VK_F20 => F20,
                    VK_F21 => F21,
                    VK_F22 => F22,
                    VK_F23 => F23,
                    VK_F24 => F24,
                    VK_NUMLOCK => NumLock,
                    VK_SCROLL => ScrollLock,
                    VK_CAPITAL => CapsLock,
                    VK_LSHIFT => LeftShift,
                    VK_RSHIFT => RightShift,
                    VK_LCONTROL => LeftControl,
                    VK_RCONTROL => RightControl,
                    VK_LMENU => LeftAlt,
                    VK_RMENU => RightAlt,
                    VK_OEM_PERIOD => Period,
                    VK_OEM_COMMA => Comma,
                    VK_OEM_1 => SemiColon,
                    VK_OEM_2 => Slash,
                    VK_OEM_3 => Grave,
                    VK_OEM_4 => LeftBrace,
                    VK_OEM_5 => BackwardSlash,
                    VK_OEM_6 => RightBrace,
                    VK_OEM_7 => Apostrophe,
                    _ => Other(code),
                }
            }
            Err(_) => Other(code),
        }
    }
}

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub enum KeyboardKey {
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
    J,
    K,
    L,
    M,
    N,
    O,
    P,
    Q,
    R,
    S,
    T,
    U,
    V,
    W,
    X,
    Y,
    Z,
    Number0,
    Number1,
    Number2,
    Number3,
    Number4,
    Number5,
    Number6,
    Number7,
    Number8,
    Number9,
    LeftAlt,
    RightAlt,
    LeftShift,
    RightShift,
    LeftControl,
    RightControl,
    BackSpace,
    Tab,
    Enter,
    Escape,
    Space,
    PageUp,
    PageDown,
    Home,
    ArrowLeft,
    ArrowUp,
    ArrowRight,
    ArrowDown,
    Print,
    PrintScreen,
    Insert,
    Delete,
    LeftWindows,
    RightWindows,
    Comma,         // ,<
    Period,        // .>
    Slash,         // /?
    SemiColon,     // ;:
    Apostrophe,    // '"
    LeftBrace,     // [{
    BackwardSlash, // \|
    RightBrace,    // ]}
    Grave,         // `~
    F1,
    F2,
    F3,
    F4,
    F5,
    F6,
    F7,
    F8,
    F9,
    F10,
    F11,
    F12,
    F13,
    F14,
    F15,
    F16,
    F17,
    F18,
    F19,
    F20,
    F21,
    F22,
    F23,
    F24,
    NumLock,
    ScrollLock,
    CapsLock,
    Numpad0,
    Numpad1,
    Numpad2,
    Numpad3,
    Numpad4,
    Numpad5,
    Numpad6,
    Numpad7,
    Numpad8,
    Numpad9,
    Multiply,
    Add,
    Separator,
    Subtract,
    Decimal,
    Divide,
    Other(u32),
    InvalidKeyCodeReceived,
}

// those dont have defines.
const VK_0: i32 = 0x30;
const VK_1: i32 = 0x31;
const VK_2: i32 = 0x32;
const VK_3: i32 = 0x33;
const VK_4: i32 = 0x34;
const VK_5: i32 = 0x35;
const VK_6: i32 = 0x36;
const VK_7: i32 = 0x37;
const VK_8: i32 = 0x38;
const VK_9: i32 = 0x39;
const VK_A: i32 = 0x41;
const VK_B: i32 = 0x42;
const VK_C: i32 = 0x43;
const VK_D: i32 = 0x44;
const VK_E: i32 = 0x45;
const VK_F: i32 = 0x46;
const VK_G: i32 = 0x47;
const VK_H: i32 = 0x48;
const VK_I: i32 = 0x49;
const VK_J: i32 = 0x4A;
const VK_K: i32 = 0x4B;
const VK_L: i32 = 0x4C;
const VK_M: i32 = 0x4D;
const VK_N: i32 = 0x4E;
const VK_O: i32 = 0x4F;
const VK_P: i32 = 0x50;
const VK_Q: i32 = 0x51;
const VK_R: i32 = 0x52;
const VK_S: i32 = 0x53;
const VK_T: i32 = 0x54;
const VK_U: i32 = 0x55;
const VK_V: i32 = 0x56;
const VK_W: i32 = 0x57;
const VK_X: i32 = 0x58;
const VK_Y: i32 = 0x59;
const VK_Z: i32 = 0x5A;

impl KeyboardKey {
    pub unsafe fn optionally_from(value: *const KBDLLHOOKSTRUCT) -> Option<Self> {
        if value.is_null() {
            None
        } else {
            Some(KeyboardKey::from((*value).vkCode))
        }
    }
}

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub struct MouseEvent {
    pub event: MouseEventType,
    pub is_injected: Option<IsMouseEventInjected>,
}

impl MouseEvent {
    pub unsafe fn new(wm_mouse_param: WPARAM, ms_ll_hook_struct: *const MSLLHOOKSTRUCT) -> Self {
        use MouseEventType::*;
        MouseEvent{
            is_injected: IsMouseEventInjected::optionally_from(ms_ll_hook_struct),
            event: match wm_mouse_param as u32 {
                // Mouse press
                WM_LBUTTONDOWN | WM_LBUTTONUP | WM_LBUTTONDBLCLK => Press(MousePressEvent::new(wm_mouse_param, ms_ll_hook_struct)),
                WM_RBUTTONDOWN | WM_RBUTTONUP | WM_RBUTTONDBLCLK => Press(MousePressEvent::new(wm_mouse_param, ms_ll_hook_struct)),
                WM_MBUTTONDOWN | WM_MBUTTONUP | WM_MBUTTONDBLCLK => Press(MousePressEvent::new(wm_mouse_param, ms_ll_hook_struct)),
                WM_XBUTTONDOWN | WM_XBUTTONUP | WM_XBUTTONDBLCLK => Press(MousePressEvent::new(wm_mouse_param, ms_ll_hook_struct)),
                
                // Mouse move
                WM_MOUSEMOVE => Move(MouseMoveEvent::new(ms_ll_hook_struct)),

                // Wheel move
                WM_MOUSEWHEEL | WM_MOUSEHWHEEL => Wheel(MouseWheelEvent {  }),

                _ => Other(wm_mouse_param),
            }
        }
    }
}

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub enum IsMouseEventInjected {
    Injected,
    NotInjected,
}

impl IsMouseEventInjected {
    unsafe fn optionally_from(value: *const MSLLHOOKSTRUCT) -> Option<Self> {
        if value.is_null() {
            None
        } else {
            Some(IsMouseEventInjected::from((*value).flags))
        }
    }
}

impl From<DWORD> for IsMouseEventInjected {
    fn from(value: DWORD) -> Self {
        let i1 = 0 != value & LLMHF_INJECTED;
        let i2 = 0 != value & LLMHF_LOWER_IL_INJECTED;
        use IsMouseEventInjected::*;
        match i1 || i2 {
            true => Injected,
            false => NotInjected,
        }
    }
}

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub enum MouseEventType {
    Press(MousePressEvent),
    Move(MouseMoveEvent),
    Wheel(MouseWheelEvent),
    Other(usize)
}

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub struct MousePressEvent {
    pub pressed: MouseButtonPress,
    pub button: MouseButton,
}

impl MousePressEvent {
    pub unsafe fn new(wm_mouse_param: WPARAM, ms_ll_hook_struct: *const MSLLHOOKSTRUCT) -> MousePressEvent {
        MousePressEvent { 
            pressed: MouseButtonPress::from(wm_mouse_param),
            button: MouseButton::from(wm_mouse_param, ms_ll_hook_struct),
        }
    }
}

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub struct MouseWheelEvent {

}

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

impl From<POINT> for Point {
    fn from(value: POINT) -> Self {
        Point { x: value.x, y: value.y }
    }
}

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub struct MouseMoveEvent {
    pub point: Option<Point>,
}

impl MouseMoveEvent {
    pub unsafe fn new(ms_ll_hook_struct: *const MSLLHOOKSTRUCT) -> MouseMoveEvent {
        if ms_ll_hook_struct.is_null() {
            MouseMoveEvent{ point: None }
        } else {
            let msll = &*ms_ll_hook_struct;
            let pt = msll.pt;
            MouseMoveEvent{ point: Some(pt.into()) }
        }
    }
}

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub enum MouseButtonPress {
    Down,
    Up,
    Other(usize),
}

impl From<WPARAM> for MouseButtonPress {
    fn from(value: WPARAM) -> Self {
        use MouseButtonPress::*;
        match value.try_into() {
            Ok(uv) => {
                match uv {
                    WM_LBUTTONDOWN| WM_RBUTTONDOWN| WM_MBUTTONDOWN | WM_XBUTTONDOWN => Down,
                    WM_RBUTTONUP | WM_LBUTTONUP | WM_MBUTTONUP | WM_XBUTTONUP => Up,
                    _ => Other(value),
                }
            }
            Err(_) => Other(value),
        }
    }
}

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub enum MouseClick {
    SingleClick,
    DoubleClick,
    Other(u32),
}

impl From<WPARAM> for MouseClick {
    fn from(value: WPARAM) -> Self {
        use MouseClick::*;
        match value.try_into() {
            Ok (uv) => {
                match uv {
                    WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN | WM_XBUTTONDOWN => SingleClick,
                    WM_LBUTTONUP | WM_RBUTTONUP | WM_MBUTTONUP | WM_XBUTTONUP => SingleClick,
                    WM_LBUTTONDBLCLK | WM_RBUTTONDBLCLK | WM_MBUTTONDBLCLK | WM_XBUTTONDBLCLK => DoubleClick,
                    _ => Other(value as u32),

                }
            },
            Err(_) => Other(value as u32),
        }    
    }
}

#[derive(Copy, Clone, Ord, PartialOrd, Hash, Eq, PartialEq, Debug)]
pub enum MouseButton {
    Left(MouseClick),
    Right(MouseClick),
    Middle(MouseClick),
    X1(MouseClick), // XBUTTON1
    X2(MouseClick), // XBUTTON2
    UnkownX(MouseClick),  // Either XBUTTON1 or XBUTTON2
    Other(usize),
}

impl MouseButton {
    pub unsafe fn from(wm_mouse_param: WPARAM, ms_ll_hook_struct: *const MSLLHOOKSTRUCT) -> Self {
        let click = MouseClick::from(wm_mouse_param);

        use MouseButton::*;
        match wm_mouse_param.try_into() {
            Ok(param) => {
                match param {
                    WM_LBUTTONDOWN | WM_LBUTTONUP | WM_LBUTTONDBLCLK => Left(click),
                    WM_RBUTTONDOWN | WM_RBUTTONUP | WM_RBUTTONDBLCLK => Right(click),
                    WM_MBUTTONDOWN | WM_MBUTTONUP | WM_MBUTTONDBLCLK=> Middle(click),
                    WM_XBUTTONDOWN | WM_XBUTTONUP | WM_XBUTTONDBLCLK => {
                        if ms_ll_hook_struct.is_null() {
                            UnkownX(click)
                        } else {
                            Self::into_extra(click, &*ms_ll_hook_struct)
                        }
                    },
                    // Value out of expected set
                    _ => Other(wm_mouse_param)
                }
            },
            // Conversion error
            Err(_) => Other(wm_mouse_param),
        }
    }

    fn into_extra(click: MouseClick, ms_ll_hook_struct: &MSLLHOOKSTRUCT) -> Self {
        use MouseButton::*;
        match GET_XBUTTON_WPARAM(ms_ll_hook_struct.mouseData.try_into().expect("")) {
            XBUTTON1 => X1(click),
            XBUTTON2 => X2(click),
            _ => UnkownX(click),
        }
    }
}

