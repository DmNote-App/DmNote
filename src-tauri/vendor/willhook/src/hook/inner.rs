pub(super) mod raw;
pub(super) mod channels;
pub(super) mod low_level;

use crate::hook::{
    event::*,
    inner::{raw::RawHook, channels::HookChannels}
};

use std::{
    thread::JoinHandle,
    sync::{Arc, Condvar, Mutex}
};

use once_cell::sync::Lazy;

use winapi::{shared::{
    ntdef::NULL,
    minwindef::*,
    windef::*
}};
use winapi::um::{
        processthreadsapi::GetCurrentThreadId,
    winuser::{
    HOOKPROC, LPMSG,
    SetWindowsHookExA, UnhookWindowsHookEx, GetMessageA, PostThreadMessageA,
    WM_QUIT,
    WH_KEYBOARD_LL, WH_MOUSE_LL,
    }
};

pub struct GlobalHooks {
    keyboard: Option<InnerHook>,
    mouse: Option<InnerHook>,
}

impl GlobalHooks {
    pub fn is_any_hook_present(&self) -> bool {
        self.keyboard.is_some() || self.mouse.is_some()
    }

    pub fn setup_mouse_hook(&mut self) {
        use crate::hook::inner::low_level::mouse_procedure;
        self.mouse = Some(InnerHook::new(WH_MOUSE_LL, Some(mouse_procedure)));
    }

    pub fn setup_keyboard_hook(&mut self) {
        use crate::hook::inner::low_level::keyboard_procedure;
        self.keyboard = Some(InnerHook::new(WH_KEYBOARD_LL, Some(keyboard_procedure)));
    }

    pub fn drop_hooks(&mut self) {
        self.keyboard = None;
        self.mouse = None;
    }
}

pub(super) static GLOBAL_CHANNEL: Lazy<HookChannels> = Lazy::new(|| HookChannels::new());
pub(super) static GLOBAL_HOOK: Mutex<GlobalHooks> = Mutex::new(GlobalHooks{keyboard: None, mouse: None});

pub struct InnerHook {
    hook_handle: Arc<Mutex<RawHook>>,
    thread_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl Drop for InnerHook {
    fn drop(&mut self) {
        let (winapi_handle, thread_id) = if let Ok(inner) = self.hook_handle.lock() {
            ((*inner).raw_handle, (*inner).thread_id)
        } else {
            // The hook thread panicked, apparently.
            return;
        };

        if winapi_handle == NULL as HHOOK || thread_id == NULL as DWORD {
            // This handle is not associated with the valid raw hook.
            return;
        }

        unsafe {
            // Non-null value indicates success. Something wen't wrong while unhooking.
            // This is "theoretical" scenario. Don't kill the hook thread, maybe OS won't blow up.
            if 0 == UnhookWindowsHookEx(winapi_handle) {
                return;
            }

            // Again as long as OS is keeping it's side of the deal, this should never happen.
            // But just in case... we won't try to join with the thread, if anything bad DOES happen.
            if 0 == PostThreadMessageA(thread_id, WM_QUIT, NULL as WPARAM, NULL as LPARAM) {
                return;
            }
        }

        // Below ridiculous chain of calls is "necessary" to move a value out of a mutex.
        // See : https://stackoverflow.com/questions/30573188/cannot-move-data-out-of-a-mutex
        if let Ok(mut lock) = self.thread_handle.lock() {
            if let Some(jh) = lock.take() {
                let _ignore_error = jh.join();
            }
        }
    }
}

impl InnerHook {
    pub fn new(hook_id: INT, handler: HOOKPROC) -> InnerHook {
        // The raw hook data that will be set by the background thread
        let raw_hook = Arc::new(Mutex::new(RawHook::new()));
        let deferred_handle = raw_hook.clone();

        // Used to notify the "owner" of the hook that thread started
        let is_started = Arc::new((Mutex::new(false), Condvar::new()));
        let set_started = is_started.clone();

        // Start a new thread and in that thread:
        // - install the hook
        // - set the raw hook data
        // - notify the owner thread that raw hook data are available
        // - wait for the message to quit
        let install_hook = Arc::new(Mutex::new(Some(std::thread::spawn(move || {
            let hhook;
            unsafe {
                hhook = SetWindowsHookExA(hook_id, handler, NULL as HINSTANCE, NULL as DWORD);
            }

            // Set the HHOOK and ThreadID so that the "owner" thread can later kill hook and join with it
            if hhook != NULL as HHOOK {
                if let Ok(mut exclusive) = deferred_handle.lock() {
                    exclusive.raw_handle = hhook;
                    exclusive.thread_id = unsafe { GetCurrentThreadId() };
                }
            }

            // Notify the "owner" thread that the hook is started
            {
                let (start_lock, start_cvar) = &*set_started;
                let mut started = start_lock.lock().unwrap();
                *started = true;
                start_cvar.notify_one();
            }

            // This call keeps the hook alive until the InnerHook is dropped.
            // GetMessageA waits for a message to this thread, blocking thread from quiting.
            // InnerHook's Drop implementation sends the message to this thread making GetMessageA return the value.
            // At the moment the message is received, the underlying low-level Windows hook is already "unhooked",
            // so we simply quit and let the InnerHook's Drop implementation join with this thread.
            let mut msg = std::mem::MaybeUninit::uninit();
            unsafe {
                GetMessageA(
                    msg.as_mut_ptr() as LPMSG,
                    -1isize as HWND,  // -1 => Wait only for message to this thread specifically
                    NULL as UINT,
                    NULL as UINT,
                );
            }
        }))));

        {
            // Wait for the hook to start and set the value.
            let (start_lock, start_cvar) = &*is_started;
            let mut started = start_lock.lock().unwrap();
            while !*started {
                started = start_cvar.wait(started).unwrap();
            }
        }

        InnerHook {
            hook_handle: raw_hook,
            thread_handle: install_hook,
        }
    }

    pub fn try_recv() -> Result<InputEvent, std::sync::mpsc::TryRecvError> {
        GLOBAL_CHANNEL.try_recv()
    }
}
