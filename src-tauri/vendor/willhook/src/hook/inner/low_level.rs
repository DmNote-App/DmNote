
use crate::hook::event::*;
use crate::hook::inner::GLOBAL_CHANNEL;

use std::ptr::null_mut;

use winapi::{shared::{minwindef::*, windef::*}, um::winuser::{CallNextHookEx, KBDLLHOOKSTRUCT, MSLLHOOKSTRUCT, HC_ACTION}};

// In the case of normal compilation, just call CallNextHookEx
#[cfg(not(test))]
unsafe fn call_next_hook(hhk: HHOOK, n_code: INT, w_param: WPARAM, l_param: LPARAM) -> LRESULT {
    CallNextHookEx(hhk, n_code, w_param, l_param)
}

// In the case of tests, use home-made mock for CallNextHookEx
#[cfg(test)]
use std::sync::Mutex;
#[cfg(test)]
use std::sync::mpsc::*;
#[cfg(test)]
use once_cell::sync::Lazy;
#[cfg(test)]
static mut CALL_NEXT_HOOK_CALLS: Lazy<(Sender<(usize, INT, WPARAM, LPARAM)>, Receiver<(usize, INT, WPARAM, LPARAM)>)> = Lazy::new(|| { channel() });
#[cfg(test)]
static mut CALL_NEXT_HOOK_RETURN: Mutex<LRESULT> = Mutex::new(0 as LRESULT);
#[cfg(test)]
unsafe fn call_next_hook(hhk: HHOOK, n_code: INT, w_param: WPARAM, l_param: LPARAM) -> LRESULT {
    assert!(CALL_NEXT_HOOK_CALLS.0.send((hhk as usize, n_code, w_param, l_param)).is_ok());
    let rv = *(CALL_NEXT_HOOK_RETURN.lock().unwrap());
    rv
}


pub unsafe extern "system" fn keyboard_procedure(
    code: INT,
    wm_key_code: WPARAM,
    win_hook_struct: LPARAM,
) -> LRESULT {
    // If code is less than zero then the hook procedure
    // must pass the message to the CallNextHookEx function
    // without further processing and should return the value returned by CallNextHookEx.
    if code != HC_ACTION {
        // hhk - This parameter (the 1st one) is ignored, according to MSDN
        // args... - The subsequent parameters are simply forwarded
        return call_next_hook(null_mut() as HHOOK, code, wm_key_code, win_hook_struct);
    }

    let kbd_hook_struct: *mut KBDLLHOOKSTRUCT = win_hook_struct as *mut _;        
    let keyboard_event = KeyboardEvent::new(wm_key_code, kbd_hook_struct);

    let _ignore_error = GLOBAL_CHANNEL.send_keyboard_event(keyboard_event).is_err();

    call_next_hook(null_mut() as HHOOK, code, wm_key_code, win_hook_struct)
}

#[cfg(test)]
mod keyboard_procedure_tests {
    use quickcheck::TestResult;
    use winapi::{
        shared::{
            minwindef::{WPARAM, LPARAM, UINT, INT, DWORD, LRESULT},
            basetsd::ULONG_PTR,
            ntdef::NULL},
        um::winuser::{WM_KEYDOWN, HC_ACTION, WM_INPUT, WM_SYSKEYDOWN, WM_KEYUP, WM_SYSKEYUP}};

    use crate::hook::event::{InputEvent, KeyPress, KeyboardEvent};

    use super::{keyboard_procedure, CALL_NEXT_HOOK_CALLS, CALL_NEXT_HOOK_RETURN};
    use super::GLOBAL_CHANNEL;

    use quickcheck::*;

    struct MOCK_KBD_LL_HOOK_STRUCT {
        vk_code: DWORD,
        scan_code: DWORD,
        flags: DWORD,
        time: DWORD,
        extra_info: ULONG_PTR,
    }

    unsafe fn assert_call_next_hook_called_once(expected: (usize, i32, usize, isize)) {
        assert_call_next_hook_equals(Ok(expected));
        assert_call_next_hook_equals(Err(std::sync::mpsc::TryRecvError::Empty));

    }

    unsafe fn assert_call_next_hook_equals(expected:  Result<(usize, i32, usize, isize), std::sync::mpsc::TryRecvError>) {
        let actual = CALL_NEXT_HOOK_CALLS.1.try_recv();
        assert_eq!(expected, actual);
    }

    unsafe fn assert_one_input_event_present(ie: InputEvent) {
        assert_current_input_event_equals(Ok(ie));
        assert_there_are_no_more_input_events();
    }

    unsafe fn assert_there_are_no_more_input_events() {
        assert_current_input_event_equals(Err(std::sync::mpsc::TryRecvError::Empty));
    }

    unsafe fn assert_current_input_event_equals(r: Result<InputEvent, std::sync::mpsc::TryRecvError>) {
        let ie = GLOBAL_CHANNEL.try_recv();
        assert_eq!(r, ie);
    }

    unsafe fn set_call_next_hook_return_value(rv: LPARAM) {
        *(CALL_NEXT_HOOK_RETURN.lock().unwrap()) = rv;
    }

    quickcheck! {
        fn invalid_code_calls_next_hook(code: INT, rv: LRESULT) -> TestResult {
            if code == HC_ACTION {
                return TestResult::discard()
            }

            let w_param = WM_INPUT as WPARAM;
            let l_param = NULL as LPARAM;
            unsafe {
                set_call_next_hook_return_value(rv);
                assert_eq!(rv, keyboard_procedure(code, w_param, l_param));
                assert_call_next_hook_called_once((NULL as usize, code, w_param, l_param));
                assert_there_are_no_more_input_events();
            }

            TestResult::from_bool(true)
        }
    }

    unsafe fn run_invalid_kbd_ll_hook_struct(w_param: UINT, press: KeyPress) {
        let w_param = w_param as WPARAM;
        let l_param = NULL as LPARAM;
        keyboard_procedure(HC_ACTION, w_param as usize, l_param);
        assert_call_next_hook_called_once((NULL as usize, HC_ACTION, w_param, l_param));
        assert_one_input_event_present(InputEvent::Keyboard(KeyboardEvent{
            pressed: press,
            key: None,
            vk_code: None,
            scan_code: None,
            flags: None,
            is_injected: None,
        }));
    }

    #[test]
    fn invalid_kbd_ll_hook_struct() {
        unsafe {
            run_invalid_kbd_ll_hook_struct(WM_KEYDOWN, KeyPress::Down(false));
            run_invalid_kbd_ll_hook_struct(WM_SYSKEYDOWN, KeyPress::Down(true));
            run_invalid_kbd_ll_hook_struct(WM_KEYUP, KeyPress::Up(false));
            run_invalid_kbd_ll_hook_struct(WM_SYSKEYUP, KeyPress::Up(true));
        }
    }
}

pub unsafe extern "system" fn mouse_procedure(
    code: INT,
    wm_mouse_param: WPARAM,
    win_hook_struct: LPARAM,
) -> LRESULT {
    // If code is less than zero, then the hook procedure
    // must pass the message to the CallNextHookEx function
    // without further processing and should return the value returned by CallNextHookEx.
    if code < 0 {
        unsafe {
            return CallNextHookEx(null_mut() as HHOOK, code, wm_mouse_param, win_hook_struct);
        }
    }

    let mice_hook_struct: *const MSLLHOOKSTRUCT = win_hook_struct as *mut _;
    let mouse_event = MouseEvent::new(wm_mouse_param, mice_hook_struct);
    let _ignore_error = GLOBAL_CHANNEL.send_mouse_event(mouse_event).is_err();

    CallNextHookEx(null_mut() as HHOOK, code, wm_mouse_param, win_hook_struct)
}
