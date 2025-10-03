pub(super) mod inner;
pub mod event;

use crate::hook::inner::InnerHook;

use self::event::InputEvent;

/// Handle to a low-level Windows hook for keyboard and/or mouse events, regardless of application focus.
/// For more details see the [HookBuilder]. When the handle goes out of scope, then the low-level hook is removed.
/// 
/// Example
/// ```rust
/// # fn main() {
/// # use willhook::hook::HookBuilder;
/// {
///     // create low-level hook and return the handle
///     let hook = HookBuilder::new().with_mouse().build().unwrap();
/// }
/// // hook handle goes out of scope,
/// // underlying low-level hook(s) are unhooked from Windows
/// # }
/// ```
pub struct Hook {}

impl Hook {
    /// Tries to receive an event from the low-level hook(s) running in the background thread(s).
    /// If there are no events at the moment, will return Err(std::sync::mpsc::Empty):
    /// 
    /// ```rust
    /// # fn main() {
    /// # use willhook::hook::HookBuilder;
    /// # use std::sync::mpsc::TryRecvError;
    /// // create low-level hook and store handle in `hook`
    /// let hook = HookBuilder::new().with_mouse().build().unwrap();
    /// // This example definitely can't receive any user input, so the try_recv will fail:
    /// assert!(hook.try_recv().is_err());
    /// assert_eq!(hook.try_recv().err(), Some(TryRecvError::Empty));
    /// # }
    /// ```
    /// 
    /// Hook::try_recv() should be treated as a foundation for more complex processing. 
    /// For example if one would be intereted in only unique key presses
    /// with timestamps (regardless of how long the key press lasts):
    /// 
    /// ``` rust
    /// # fn main() {
    /// # use willhook::hook::event::*;
    /// # let hook = willhook::mouse_hook().unwrap();
    /// use std::sync::mpsc::channel;
    /// use std::time::Instant;
    /// let (event_sender, _event_receiver) = channel();
    /// while let Ok(event) = hook.try_recv() {
    ///     // Process only "press ups" to find unique key presses,
    ///     // because if a user holds a key, then Windows can emit multiple "key down" events
    ///     if let InputEvent::Keyboard(event) = event {
    ///         match event.pressed {
    ///             KeyPress::Up(is_system) => { event_sender.send( (event, Instant::now() )); },
    ///             _ => continue,
    ///         }
    ///     }
    /// }
    /// # }
    /// ```
    pub fn try_recv(&self) -> Result<InputEvent, std::sync::mpsc::TryRecvError> {
        InnerHook::try_recv()
    }
}

impl Drop for Hook {
    fn drop(&mut self) {
        use crate::hook::inner::{GLOBAL_HOOK, GLOBAL_CHANNEL};
        let mut global_hook = GLOBAL_HOOK.lock().unwrap();
        global_hook.drop_hooks();
        GLOBAL_CHANNEL.drain();
    }
}

/// The only way to build a hook is to use HookBuilder.
/// It is possible to choose what types of hooks are active.
/// Currently only "mouse" and "keyboard" hooks are supported (due to Windows API restrictions).
/// 
/// # Build hook for both mouse and keyboard:
/// ```rust
/// use willhook::hook::HookBuilder;
/// fn main() {
///     let hook = HookBuilder::new()
///                 .with_mouse()
///                 .with_keyboard()
///                 .build();
///     assert!(hook.is_some());
/// }
/// ```
/// 
/// # Limitations
/// 
/// At least one hook type has to be specified, otherwise build will fail:
/// ```rust
/// # fn main() {
/// # use willhook::hook::HookBuilder;
/// let bad_hook = HookBuilder::new().build();
/// assert!(bad_hook.is_none());
/// # }
/// ```
/// There can be only one hook at the moment, even if we try to create different type:
/// 
/// ```rust
/// # fn main() {
/// # use willhook::hook::HookBuilder;
/// let hook = HookBuilder::new()
///             .with_mouse()
///             .build();
/// 
/// assert!(hook.is_some());
/// // Building second hook while the first one is still in scope will fail.
/// // Even if that second hook is keyboard hook:
/// let another_hook = HookBuilder::new().with_keyboard().build();
/// assert!(another_hook.is_none());
/// # }
/// ```
/// 
/// Only after the old hook is dropped, the new one can be created:
/// 
/// ```rust
/// # fn main() {
/// # use willhook::hook::HookBuilder;
/// let hook = HookBuilder::new()
///             .with_mouse()
///             .build();
/// 
/// assert!(hook.is_some());
/// // It could go out of scope as well, but let's drop it explicitly:
/// drop(hook);
/// // Since there is no "active" hook at the moment, now we can create another:
/// let another_hook = HookBuilder::new().with_keyboard().build();
/// assert!(another_hook.is_some());
/// # }
/// ```
pub struct HookBuilder {
    mouse: bool,
    keyboard: bool,
}

impl HookBuilder {
    pub fn new() -> Self {
        Self {
            mouse: false,
            keyboard: false,
        }
    }

    /// Instructs builder to spawn a new mouse hook in background thread on HookBuilder::build().
    pub fn with_mouse(mut self) -> Self {
        self.mouse = true;
        self
    }

    /// Instructs builder to spawn a new keyboard hook in background thread on HookBuilder::build().
    pub fn with_keyboard(mut self) -> Self {
        self.keyboard = true;
        self
    }

    /// Builds the requested hooks and returns common handle for them.
    /// If any hooks are active, then the build fails.
    pub fn build(self) -> Option<Hook> {
        // No hook was requested - do not default, just return None
        if !self.keyboard && !self.mouse {
            return None
        }
        
        use crate::hook::inner::GLOBAL_HOOK;
        // This lock ensures that during the time of building, no other builder is active.
        // If different threads attempt to construct the hook handle, 
        // they may race for underlying static globals holding the actuall inner hooks.
        // To prevent this, simple mutex is used so that only one instance of HookBuilder::build() is running at the moment.
        // In "normal" use case one would create a hook at the start of the program, or at least in one thread.
        // But the goal of this crate was to be failproof, so here comes the lock:
        let mut global_hooks = GLOBAL_HOOK.lock().unwrap();

        if global_hooks.is_any_hook_present() {
            return None
        }

        if self.keyboard {
            global_hooks.setup_keyboard_hook();
        }
        if self.mouse {
            global_hooks.setup_mouse_hook();
        }
        
        return Some(Hook{})
    }
}
