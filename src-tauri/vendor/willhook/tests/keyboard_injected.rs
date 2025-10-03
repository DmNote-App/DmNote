//! These tests inject programmatically keyboard events and verify if willhook's hook receive them properly.
//! It is important to keep in mind, that these injected events are going through Windows OS.
//! These injected events will appear in the context of the currently focused window.
//! Hence, it is best to invoke below tests in one-time CLI environment.
//! You may observe it by letters appearing in CLI input after test run finishes, like so:
//! PS C:\workspace\willhook> cfgklaa
//! It can become real mess especially if you run tests from GUI program

#[cfg(test)]
mod keyboard_hook_tests {
    use willhook::*;
    use willhook::hook::event::InputEvent;
    use willhook::hook::event::KeyPress;
    use willhook::hook::event::KeyboardEvent;
    use willhook::hook::event::InputEvent::*;
    use willhook::hook::event::KeyPress::*;
    use willhook::hook::event::KeyboardKey;
    use willhook::hook::event::KeyboardKey::*;
    use willhook::hook::event::IsKeyboardEventInjected::*;
    use mki::Keyboard;

    fn a_key(key: KeyboardKey, press: KeyPress) -> Result<InputEvent, std::sync::mpsc::TryRecvError> {
        Ok(Keyboard(KeyboardEvent {
                        pressed: press,
                        key: Some(key),
                        vk_code: None,
                        scan_code: None,
                        flags: None,
                        is_injected: Some(Injected)}))
    }

    #[test]
    fn press_one_keyboard_key() {
        Keyboard::A.press();

        let h = keyboard_hook().unwrap();
        assert!(h.try_recv().is_err());

        Keyboard::A.press();

        assert_eq!(h.try_recv(), a_key(A, Down(false)));
        assert!(h.try_recv().is_err());
    }    
    
    #[test]
    fn release_one_keyboard_key() {
        Keyboard::B.release();
    
        let h = keyboard_hook().unwrap();
        assert!(h.try_recv().is_err());

        Keyboard::B.release();

        assert_eq!(h.try_recv(), a_key(B, Up(false)));
        assert!(h.try_recv().is_err());
    }
    
    #[test]
    fn click_one_keyboard_key() {
        let h = keyboard_hook().unwrap();
        assert!(h.try_recv().is_err());

        Keyboard::C.click();

        assert_eq!(h.try_recv(), a_key(C, Down(false)));
        assert_eq!(h.try_recv(), a_key(C, Up(false)));
        assert!(h.try_recv().is_err());
    }

    #[test]
    fn click_one_system_key() {
        let h = keyboard_hook().unwrap();
        assert!(h.try_recv().is_err());

        Keyboard::LeftAlt.press();
        Keyboard::D.click();
        Keyboard::LeftAlt.release();

        assert_eq!(h.try_recv(), a_key(LeftAlt, Down(true)));
        assert_eq!(h.try_recv(), a_key(D, Down(true)));
        assert_eq!(h.try_recv(), a_key(D, Up(true)));
        assert_eq!(h.try_recv(), a_key(LeftAlt, Up(false)));
        assert!(h.try_recv().is_err());
    }

    #[test]
    fn click_one_system_key_receive_interleaving() {
        let h = keyboard_hook().unwrap();
        assert!(h.try_recv().is_err());

        Keyboard::LeftAlt.press();
        assert_eq!(h.try_recv(), a_key(LeftAlt, Down(true)));
        assert!(h.try_recv().is_err());

        Keyboard::E.press();
        Keyboard::E.release();
        assert_eq!(h.try_recv(), a_key(E, Down(true)));
        assert_eq!(h.try_recv(), a_key(E, Up(true)));
        assert!(h.try_recv().is_err());

        Keyboard::LeftAlt.release();
        assert_eq!(h.try_recv(), a_key(LeftAlt, Up(false)));
        assert!(h.try_recv().is_err());

        assert!(h.try_recv().is_err());
    }

    #[test]
    fn multiple_keys() {        
        Keyboard::F.press();
        Keyboard::G.click();
        let h = keyboard_hook().unwrap();
        assert!(h.try_recv().is_err());

        Keyboard::LeftAlt.press();
        assert_eq!(h.try_recv(), a_key(LeftAlt, Down(true)));
        assert!(h.try_recv().is_err());

        Keyboard::H.press();
        Keyboard::I.click();
        Keyboard::H.release();
        assert_eq!(h.try_recv(), a_key(H, Down(true)));
        assert_eq!(h.try_recv(), a_key(I, Down(true)));
        assert_eq!(h.try_recv(), a_key(I, Up(true)));
        assert_eq!(h.try_recv(), a_key(H, Up(true)));
        assert!(h.try_recv().is_err());

        Keyboard::LeftAlt.release();
        assert_eq!(h.try_recv(), a_key(LeftAlt, Up(false)));
        assert!(h.try_recv().is_err());
        
        Keyboard::J.release();
        Keyboard::K.click();
        Keyboard::L.click();        
        assert_eq!(h.try_recv(), a_key(J, Up(false)));
        assert_eq!(h.try_recv(), a_key(K, Down(false)));
        assert_eq!(h.try_recv(), a_key(K, Up(false)));
        assert_eq!(h.try_recv(), a_key(L, Down(false)));
        assert_eq!(h.try_recv(), a_key(L, Up(false)));
        assert!(h.try_recv().is_err());
    }

    #[test]
    fn multiple_hooks_test() {
        {
            Keyboard::F.press();
            Keyboard::G.click();
            let h1 = keyboard_hook().unwrap();
            assert!(h1.try_recv().is_err());

            Keyboard::LeftAlt.press();
            assert_eq!(h1.try_recv(), a_key(LeftAlt, Down(true)));
            assert!(h1.try_recv().is_err());

            // These events are received by h1
            Keyboard::H.press();
            Keyboard::H.release();
        }

        {
            // But H press/release should not be received by h2
            let h2 = keyboard_hook().unwrap();
            assert!(h2.try_recv().is_err());

            Keyboard::I.click();
            assert_eq!(h2.try_recv(), a_key(I, Down(true)));
            assert_eq!(h2.try_recv(), a_key(I, Up(true)));
            assert!(h2.try_recv().is_err());

            Keyboard::LeftAlt.release();
            assert_eq!(h2.try_recv(), a_key(LeftAlt, Up(false)));
            assert!(h2.try_recv().is_err());

            // This J release is captured by h2, but will not be seen by h3
            Keyboard::J.release();
        }
        let h3 = keyboard_hook().unwrap();
        assert!(h3.try_recv().is_err());
        
        Keyboard::K.click();
        Keyboard::L.click();        
        assert_eq!(h3.try_recv(), a_key(K, Down(false)));
        assert_eq!(h3.try_recv(), a_key(K, Up(false)));
        assert_eq!(h3.try_recv(), a_key(L, Down(false)));
        assert_eq!(h3.try_recv(), a_key(L, Up(false)));
        assert!(h3.try_recv().is_err());
    }

    #[test]
    fn keyboard_hook_does_not_capture_mouse() {
        let h1 = keyboard_hook().unwrap();
        assert!(h1.try_recv().is_err());

        use mki::Mouse;

        Mouse::Left.click();
        Mouse::Right.click();
        Keyboard::K.click();    
        Mouse::Left.click();
        assert_eq!(h1.try_recv(), a_key(K, Down(false)));
        assert_eq!(h1.try_recv(), a_key(K, Up(false)));
        assert!(h1.try_recv().is_err());
    }
}