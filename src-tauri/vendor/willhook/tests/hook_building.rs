#[cfg(test)]
mod hook_building_tests {
    use willhook::hook::{HookBuilder, Hook};
    use willhook::{mouse_hook, keyboard_hook, willhook};

    #[test]
    fn default_build_fails() {
        assert!(HookBuilder::new().build().is_none());
    }

    #[test]
    fn build_succeeds_with_at_least_one_hook() {
        assert!(mouse_hook().is_some())
    }

    #[test]
    fn build_fails_if_hook_exists_1() {
        let _existing = mouse_hook();
        assert!(mouse_hook().is_none());
    }
    #[test]
    fn build_fails_if_hook_exists_2() {
        let _existing = keyboard_hook();
        assert!(keyboard_hook().is_none());
    }
    #[test]
    fn build_fails_if_hook_exists_3() {
        let _existing = willhook();
        assert!(willhook().is_none());
    }

    #[test]
    fn build_fails_if_different_type_of_hook_exists_1() {
        let _existing = keyboard_hook();
        assert!(mouse_hook().is_none());
    }
    #[test]
    fn build_fails_if_different_type_of_hook_exists_2() {
        let _existing = keyboard_hook();
        assert!(willhook().is_none());
    }
    #[test]
    fn build_fails_if_different_type_of_hook_exists_3() {
        let _existing = mouse_hook();
        assert!(keyboard_hook().is_none());
    }
    #[test]
    fn build_fails_if_different_type_of_hook_exists_4() {
        let _existing = mouse_hook();
        assert!(willhook().is_none());
    }
    #[test]
    fn build_fails_if_different_type_of_hook_exists_5() {
        let _existing = willhook();
        assert!(mouse_hook().is_none());
    }
    #[test]
    fn build_fails_if_different_type_of_hook_exists_6() {
        let _existing = willhook();
        assert!(keyboard_hook().is_none());
    }

    #[test]
    fn building_data_race() {
        // If tests are run in paraller, then they would expose data race sporadically.
        // But this test starts a lot of threads to race symptops appearance probability more likely.
        // This test detected data race between HookBuilder::build() in the past.
        let repetitions = 100usize;
        for _ in 0..repetitions {
            use std::sync::{Arc, Barrier};
            use std::thread;

            let racers = 1000usize;
        
            let barrier = Arc::new(Barrier::new(racers));
            let mut handles = Vec::with_capacity(racers);
        
            for _ in 0..racers {
                let b = Arc::clone(&barrier);
                handles.push(thread::spawn(move || {
                    b.wait();
                    keyboard_hook()
                }));
            }
        
            // Wait while all hooks were attempted to be created.
            // We have to store all values.
            // That is to ensure that the successfuly created hook does not go out of scope while other `racers` are running.
            // If that hook would go out of scope, the other running `racers` could have a chance to create a hook, making test invalid.
            let hooks = handles.into_iter()
                .map(|jh| { jh.join().unwrap() } )
                .collect::<Vec<Option<Hook>>>();
            // All hooks are collected, which means all `racers` are done. Only now we can count.
            let hooks = hooks.into_iter().filter(|h| h.is_some()).count();
            // No matter the number of builders, there should be only one successful build.
            assert_eq!(1, hooks);
        }
    }

}