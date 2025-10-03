//! # Consider this crate as work-in-progress.
//!
//! # What this crate provides
//! 
//! This Windows-only crate provides safe and correct means to listen for keyboard and mouse events regardless of application focus.
//! The application can be CLI or with a Window.
//! 
//! Under the hood the crate leverages the **WI**ndows **L**ow-**L**evel **HOOK**s.
//! You can read more about that topic on [MSDN](https://learn.microsoft.com/en-us/windows/win32/winmsg/about-hooks?redirectedfrom=MSDN).
//!
//! The crate was created for learning-purposes mostly and for my hobby project, but we will see where it goes.
//! 
//! The design goals for this crate are to be: correct, misuse-proof and fail-proof.
//! Having that in mind, the implementation follows best effort to avoid any panic.
//! In the worst case, it should just return incomplete input event (e.g. with missing keyboard key code).
//! 
//! ### What this crate does NOT provide
//! 
//! This crate is intended for "read-only" access to hooks. It does not support injecting input events or altering them.
//! If you are looking for that kind of functionality, you can give [mki](https://crates.io/crates/mki) a try.
//! In comparison, the mki crate supports also Linux, but does not cleanup the low-level hooks (by [unhooking them](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-unhookwindowshookex)) and threads behind them (by [joinging with them](https://doc.rust-lang.org/std/thread/struct.JoinHandle.html#method.join)).
//! This *may* not be an issue for you. The addition of "injecting" and "altering" input events to [willhook] is a possibility, although it is not top priority.
//! 
//! # Warning: The current state
//! 
//! Currently it supports mouse and keyboard actions to some extent, see [hook::event] module for details.
//! There are sparse tests, which will grow over time, but keep in mind that the crate is "young".
//! Note: the tests should be run with `cargo test -- --test-threads=1` - you can try to figure out why. :-)
//! *It is highly recommended to at least quickly review the code before using this crate for anything more then hobby projects, at least at the current state.*
//! 
//! TODO:
//! - finish implementation of mouse move and mouse wheel
//! - document unsafe code
//! - write more tests
//! - limit the "pub" between private modules (between "implementation", the public API is well defined I think)
//! - maybe do some "target based" compilation, so that this crate can be included in linux projects also?
//! 
//! # How it works
//! 
//! In short, there are a few handy functions to request a hook: [keyboard_hook], [mouse_hook] and [willhook].
//! When called they:
//! - start background thread(s) for each low-level hook, and in that thread(s):
//!     - register a mouse and/or keyboard low-level hook(s)
//!     - start Windows message queue and wait for the message to end execution
//! - create, if were not created already, the channels for passing events to "client" thread
//! - return the handle to the underlying low-level hooks as [hook::Hook]
//! 
//! When the [hook::Hook] goes out of scope, the underlying resources supporting low-level hooks are dropped:
//! - each of the underlying low-level hooks is unhooked from the Windows Kernel
//! - each of the background threads is properly joined
//! - all pending events are dropped (background channels are drained)
//! 
//! When the [hook::Hook] is active (in scope / not dropped). 
//! Then one can receive recorded [hook::event::InputEvent]s via [hook::Hook::try_recv].
//! It works similiarly to [std::sync::mpsc::Receiver::try_recv].
//! 

pub mod hook;

pub use hook::Hook;
use hook::HookBuilder;

/// Return the Keyboard Hook handle. For more details see [Hook] and [HookBuilder]
pub fn keyboard_hook() -> Option<Hook> {
    HookBuilder::new().with_keyboard().build()
}

/// Return the Mouse Hook handle. For more details see [Hook] and [HookBuilder]
pub fn mouse_hook() -> Option<Hook> {
    HookBuilder::new().with_mouse().build()
}

/// Return the handle for both mouse and keyboard hook. For more details see [Hook] and [HookBuilder]
pub fn willhook() -> Option<Hook> {
    HookBuilder::new().with_keyboard().with_mouse().build()
}
