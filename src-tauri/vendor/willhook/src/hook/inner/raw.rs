use winapi::shared::minwindef::DWORD;
use winapi::shared::windef::HHOOK;
use winapi::shared::ntdef::NULL;

pub struct RawHook {
    pub raw_handle: HHOOK,
    pub thread_id: DWORD,
}

impl RawHook {
    pub fn new() -> RawHook {
        RawHook {
            raw_handle: NULL as HHOOK,
            thread_id: NULL as DWORD,
        }
    }
}

unsafe impl Send for RawHook {}
unsafe impl Sync for RawHook {}
