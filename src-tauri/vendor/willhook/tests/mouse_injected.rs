//! These tests inject programmatically mouse events and verify if willhook's hook receive them properly.
//! It is important to keep in mind, that these injected events are going through Windows OS.
//! These injected events will appear in the context of the currently focused window.
//! Hence, it is best to invoke below tests in one-time CLI environment.
//! You may observe strange behavior of your mouse if real mouse is present, beware.
//! Also, these tests do not distinguish injected or real mouse events. So running the tests while using the mouse will give random failures.

#[cfg(test)]
mod mouse_hook_tests {
    use willhook::*;
    use willhook::hook::event::*;
    use willhook::hook::event::InputEvent::*;
    use willhook::hook::event::MouseButtonPress::*;
    use willhook::hook::event::MouseButton::*;
    use willhook::hook::event::MouseClick::*;
    use willhook::hook::event::IsMouseEventInjected::*;
    use willhook::hook::event::MouseEventType::*;
    use mki::Mouse;

    fn a_button(button: MouseButton, press: MouseButtonPress) -> Result<InputEvent, std::sync::mpsc::TryRecvError> {
        Ok(Mouse(MouseEvent {
                        event: Press(MousePressEvent{
                            pressed: press,
                            button: button,
                        }),
                        is_injected: Some(Injected)}))
    }

    fn a_move(an_x: i32, an_y: i32) -> Result<InputEvent, std::sync::mpsc::TryRecvError> {
        Ok(Mouse(MouseEvent {
            event: Move(MouseMoveEvent{
                point: Some(Point{x: an_x, y: an_y}),
            }),
            is_injected: Some(Injected)}))
    }

    // The MKI implementation seems to be buggy at the current version.
    // It sends incorrect mouse events.
    // These are workarounds for this, and also a timing issue.
    mod fixme {
        use winapi::shared::windef::{LPPOINT, POINT};
        use winapi::ctypes::c_int;
        use winapi::um::winuser::{SendInput, MOUSEEVENTF_MOVE, LPINPUT, INPUT, INPUT_u, INPUT_MOUSE, MOUSEINPUT, GetCursorPos};

        pub fn delay_execution() {
            // This test is a race between the thread running the test and the background hook.
            // I don't see a good way around that for now, other then sleeping and yielding the injecter thread.
            std::thread::sleep(std::time::Duration::from_millis(100));
            std::thread::yield_now();
        }

        pub fn press(m: mki::Mouse) {
            m.release();
            delay_execution();
        }

        pub fn release(m: mki::Mouse) {
            m.click();
            delay_execution();
        }

        pub fn move_by(x: i32, y: i32) -> (i32, i32) {
            unsafe {
                let mut current_pos = POINT{ x: 0, y: 0, };
                GetCursorPos(&mut current_pos);

                let mut inner_input: INPUT_u = std::mem::zeroed();
                *inner_input.mi_mut() = MOUSEINPUT {
                    dx: x,
                    dy: y,
                    mouseData: 0,
                    time: 0,
                    dwFlags: MOUSEEVENTF_MOVE,
                    dwExtraInfo: 0,
                };
                let mut input = INPUT {
                    type_: INPUT_MOUSE,
                    u: inner_input,
                };
        
                SendInput(1, &mut input as LPINPUT, std::mem::size_of::<INPUT>() as c_int);
                (x + current_pos.x, y + current_pos.y)
            }
        }

        pub fn click(m: mki::Mouse) {
            press(m);
            release(m);
        }
    }


    mod mouse_clicks {
        use crate::mouse_hook_tests::*;

        #[test]
        fn press_one_mouse_key() {
            fixme::press(Mouse::Left);

            let h = mouse_hook().unwrap();
            assert!(h.try_recv().is_err());

            fixme::press(Mouse::Left);

            assert_eq!(h.try_recv(), a_button(Left(SingleClick), Down));
            assert!(h.try_recv().is_err());
        }    
        
        #[test]
        fn release_one_mouse_key() {
            fixme::release(Mouse::Left);
        
            let h = mouse_hook().unwrap();
            assert!(h.try_recv().is_err());

            fixme::release(Mouse::Left);

            assert_eq!(h.try_recv(), a_button(Left(SingleClick), Up));
            assert!(h.try_recv().is_err());
        }
        
        #[test]
        fn click_one_mouse_key() {
            let h = mouse_hook().unwrap();
            assert!(h.try_recv().is_err());

            fixme::click(Mouse::Left);

            assert_eq!(h.try_recv(), a_button(Left(SingleClick), Down));
            assert_eq!(h.try_recv(), a_button(Left(SingleClick), Up));
            assert!(h.try_recv().is_err());
        }

        #[test]
        fn hold_rmb_while_pressing_lmb() {
            let h = mouse_hook().unwrap();
            assert!(h.try_recv().is_err());

            fixme::press(Mouse::Right);
            fixme::click(Mouse::Left);
            fixme::release(Mouse::Right);

            assert_eq!(h.try_recv(), a_button(Right(SingleClick), Down));
            assert_eq!(h.try_recv(), a_button(Left(SingleClick), Down));
            assert_eq!(h.try_recv(), a_button(Left(SingleClick), Up));
            assert_eq!(h.try_recv(), a_button(Right(SingleClick), Up));
            assert!(h.try_recv().is_err());
        }

        #[test]
        fn hold_rmb_while_pressing_lmb_interleaved_capture() {
            let h = mouse_hook().unwrap();
            assert!(h.try_recv().is_err());

            fixme::press(Mouse::Right);
            assert_eq!(h.try_recv(), a_button(Right(SingleClick), Down));
            assert!(h.try_recv().is_err());

            fixme::press(Mouse::Left);
            fixme::release(Mouse::Left);
            assert_eq!(h.try_recv(), a_button(Left(SingleClick), Down));
            assert_eq!(h.try_recv(), a_button(Left(SingleClick), Up));
            assert!(h.try_recv().is_err());

            fixme::release(Mouse::Right);
            assert_eq!(h.try_recv(), a_button(Right(SingleClick), Up));
            assert!(h.try_recv().is_err());

            assert!(h.try_recv().is_err());
        }

        #[test]
        fn multiple_buttons() {        
            fixme::press(Mouse::Left);
            fixme::click(Mouse::Right);
            let h = mouse_hook().unwrap();
            assert!(h.try_recv().is_err());

            fixme::press(Mouse::Left);
            assert_eq!(h.try_recv(), a_button(Left(SingleClick), Down));
            assert!(h.try_recv().is_err());

            fixme::press(Mouse::Right);
            fixme::click(Mouse::Middle);
            fixme::release(Mouse::Left);
            assert_eq!(h.try_recv(), a_button(Right(SingleClick), Down));
            assert_eq!(h.try_recv(), a_button(Middle(SingleClick), Down));
            assert_eq!(h.try_recv(), a_button(Middle(SingleClick), Up));
            assert_eq!(h.try_recv(), a_button(Left(SingleClick), Up));
            assert!(h.try_recv().is_err());

            fixme::release(Mouse::Extra);
            assert_eq!(h.try_recv(), a_button(X2(SingleClick), Up));
            assert!(h.try_recv().is_err());
            
            fixme::release(Mouse::Side);
            fixme::click(Mouse::Left);
            fixme::click(Mouse::Extra);
            assert_eq!(h.try_recv(), a_button(X1(SingleClick), Up));
            assert_eq!(h.try_recv(), a_button(Left(SingleClick), Down));
            assert_eq!(h.try_recv(), a_button(Left(SingleClick), Up));
            assert_eq!(h.try_recv(), a_button(X2(SingleClick), Down));
            assert_eq!(h.try_recv(), a_button(X2(SingleClick), Up));
            assert!(h.try_recv().is_err());
        }

        #[test]
        fn multiple_hooks_test() {
            {
                fixme::press(Mouse::Left);
                fixme::click(Mouse::Left);
                let h1 = mouse_hook().unwrap();
                assert!(h1.try_recv().is_err());

                fixme::press(Mouse::Left);
                assert_eq!(h1.try_recv(), a_button(Left(SingleClick), Down));
                assert!(h1.try_recv().is_err());

                // These events are received by h1
                fixme::press(Mouse::Left);
                fixme::release(Mouse::Left);
            }

            {
                // But H press/release should not be received by h2
                let h2 = mouse_hook().unwrap();
                assert!(h2.try_recv().is_err());

                fixme::click(Mouse::Left);
                assert_eq!(h2.try_recv(), a_button(Left(SingleClick), Down));
                assert_eq!(h2.try_recv(), a_button(Left(SingleClick), Up));
                assert!(h2.try_recv().is_err());

                fixme::release(Mouse::Right);
                assert_eq!(h2.try_recv(), a_button(Right(SingleClick), Up));
                assert!(h2.try_recv().is_err());

                // This J release is captured by h2, but will not be seen by h3
                fixme::release(Mouse::Left);
            }
            let h3 = mouse_hook().unwrap();
            assert!(h3.try_recv().is_err());
            
            fixme::click(Mouse::Left);
            fixme::click(Mouse::Right);        
            assert_eq!(h3.try_recv(), a_button(Left(SingleClick), Down));
            assert_eq!(h3.try_recv(), a_button(Left(SingleClick), Up));
            assert_eq!(h3.try_recv(), a_button(Right(SingleClick), Down));
            assert_eq!(h3.try_recv(), a_button(Right(SingleClick), Up));
            assert!(h3.try_recv().is_err());
        }

        #[test]
        fn mouse_hook_does_not_capture_mouse() {
            let h1 = mouse_hook().unwrap();
            assert!(h1.try_recv().is_err());

            use mki::Keyboard;

            Keyboard::A.click();
            Keyboard::B.click();
            fixme::click(Mouse::Left);    
            Keyboard::C.click();

            fixme::delay_execution();

            assert_eq!(h1.try_recv(), a_button(Left(SingleClick), Down));
            assert_eq!(h1.try_recv(), a_button(Left(SingleClick), Up));
            assert!(h1.try_recv().is_err());
        }
    }

    mod mouse_moves {
        use crate::mouse_hook_tests::*;

        #[test]
        fn move_once() {
            fixme::move_by(10, 10);

            let h = mouse_hook().unwrap();
            assert!(h.try_recv().is_err());

            let (new_x, new_y) = fixme::move_by(10, 10);

            assert_eq!(h.try_recv(), a_move(new_x, new_y));
            assert!(h.try_recv().is_err());
        }

        #[test]
        fn move_couple_of_times() {
            fixme::move_by(10, 10);

            let h = mouse_hook().unwrap();
            assert!(h.try_recv().is_err());

            let new_pos = vec![
                fixme::move_by(10, 10),
                fixme::move_by(-10, 10),
                fixme::move_by(-10, -10),
                fixme::move_by(10, -10),
                fixme::move_by(1, 0),
                fixme::move_by(0, 1),
            ];

            for np in new_pos {
                let (new_x, new_y) = np;
                assert_eq!(h.try_recv(), a_move(new_x, new_y));
            }
            assert!(h.try_recv().is_err());
        }
    }
}