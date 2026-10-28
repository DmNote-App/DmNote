//! macOS 휠 어댑터: IOHIDManager로 마우스의 HID 휠 원본 값만 추출해 공용 엔진에 전달
//! - CGEvent 스크롤 값은 가속·자연스러운 스크롤 반전이 적용돼 칸 수로 쓸 수 없음
//! - 트랙패드는 Wheel·AC Pan 요소가 없어 매칭되지 않음
//! - 판정·환산은 wheel.rs, 여기서는 네이티브 호출과 원본 값 수집만

use std::{
    cell::{Cell, RefCell},
    collections::HashMap,
    ffi::c_void,
    thread,
    time::Duration,
};

use core_foundation::{
    array::{CFArray, CFArrayGetCount, CFArrayGetValueAtIndex, CFArrayRef},
    base::{kCFAllocatorDefault, CFAllocatorRef, CFIndex, CFRelease, TCFType},
    date::CFAbsoluteTimeGetCurrent,
    dictionary::{CFDictionary, CFDictionaryRef},
    number::CFNumber,
    runloop::{
        kCFRunLoopDefaultMode, CFRunLoop, CFRunLoopRef, CFRunLoopTimer, CFRunLoopTimerContext,
        CFRunLoopTimerRef,
    },
    string::{CFString, CFStringRef},
};

use super::pointer::{PointerInput, PointerSender};
use super::wheel::{
    HidResolutionMultiplier, WheelSample, WheelSender, HID_PAGE_CONSUMER, HID_PAGE_GENERIC_DESKTOP,
    HID_USAGE_AC_PAN, HID_USAGE_WHEEL,
};

type IOReturn = i32;
type IOOptionBits = u32;
type IOHIDManagerRef = *mut c_void;
type IOHIDDeviceRef = *mut c_void;
type IOHIDElementRef = *mut c_void;
type IOHIDValueRef = *mut c_void;
type IOHIDDeviceCallback = extern "C" fn(
    context: *mut c_void,
    result: IOReturn,
    sender: *mut c_void,
    device: IOHIDDeviceRef,
);
type IOHIDValueCallback = extern "C" fn(
    context: *mut c_void,
    result: IOReturn,
    sender: *mut c_void,
    value: IOHIDValueRef,
);

const K_IO_RETURN_SUCCESS: IOReturn = 0;
/// 입력 감시 권한 없음 (TCC 대상 장치 열기 실패)
const K_IO_RETURN_NOT_PERMITTED: IOReturn = 0xe000_02e2_u32 as i32;
const K_IOHID_REQUEST_TYPE_LISTEN_EVENT: u32 = 1;
const K_IOHID_ACCESS_TYPE_GRANTED: u32 = 0;
const K_IOHID_OPTIONS_TYPE_NONE: IOOptionBits = 0;
const K_IOHID_ELEMENT_TYPE_FEATURE: u32 = 257;
const K_IOHID_ELEMENT_COLLECTION_TYPE_LOGICAL: u32 = 0x02;
const HID_USAGE_MOUSE: u32 = 0x02;
const HID_USAGE_POINTER: u32 = 0x01;
const HID_USAGE_RESOLUTION_MULTIPLIER: u32 = 0x48;
// 포인터 상대 이동 (커서 트래커 이동량 모드)
const HID_USAGE_X: u32 = 0x30;
const HID_USAGE_Y: u32 = 0x31;
/// manager 생성 실패 시 재시도 간격
const HID_REOPEN_INTERVAL: Duration = Duration::from_secs(2);
/// 권한 거부 뒤 허용 여부 확인 간격(초)
const HID_ACCESS_POLL_SECONDS: f64 = 2.0;

#[link(name = "IOKit", kind = "framework")]
extern "C" {
    fn IOHIDManagerCreate(allocator: CFAllocatorRef, options: IOOptionBits) -> IOHIDManagerRef;
    fn IOHIDManagerSetDeviceMatchingMultiple(manager: IOHIDManagerRef, multiple: CFArrayRef);
    fn IOHIDManagerSetInputValueMatchingMultiple(manager: IOHIDManagerRef, multiple: CFArrayRef);
    fn IOHIDManagerRegisterDeviceMatchingCallback(
        manager: IOHIDManagerRef,
        callback: IOHIDDeviceCallback,
        context: *mut c_void,
    );
    fn IOHIDManagerRegisterDeviceRemovalCallback(
        manager: IOHIDManagerRef,
        callback: IOHIDDeviceCallback,
        context: *mut c_void,
    );
    fn IOHIDManagerRegisterInputValueCallback(
        manager: IOHIDManagerRef,
        callback: IOHIDValueCallback,
        context: *mut c_void,
    );
    fn IOHIDManagerScheduleWithRunLoop(
        manager: IOHIDManagerRef,
        run_loop: CFRunLoopRef,
        run_loop_mode: CFStringRef,
    );
    fn IOHIDManagerOpen(manager: IOHIDManagerRef, options: IOOptionBits) -> IOReturn;
    fn IOHIDManagerClose(manager: IOHIDManagerRef, options: IOOptionBits) -> IOReturn;
    fn IOHIDDeviceCopyMatchingElements(
        device: IOHIDDeviceRef,
        matching: CFDictionaryRef,
        options: IOOptionBits,
    ) -> CFArrayRef;
    fn IOHIDDeviceGetValue(
        device: IOHIDDeviceRef,
        element: IOHIDElementRef,
        value: *mut IOHIDValueRef,
    ) -> IOReturn;
    fn IOHIDValueGetElement(value: IOHIDValueRef) -> IOHIDElementRef;
    fn IOHIDValueGetIntegerValue(value: IOHIDValueRef) -> CFIndex;
    fn IOHIDElementGetDevice(element: IOHIDElementRef) -> IOHIDDeviceRef;
    fn IOHIDElementGetCookie(element: IOHIDElementRef) -> u32;
    fn IOHIDElementGetType(element: IOHIDElementRef) -> u32;
    fn IOHIDElementGetUsagePage(element: IOHIDElementRef) -> u32;
    fn IOHIDElementGetUsage(element: IOHIDElementRef) -> u32;
    fn IOHIDElementGetParent(element: IOHIDElementRef) -> IOHIDElementRef;
    fn IOHIDElementGetCollectionType(element: IOHIDElementRef) -> u32;
    fn IOHIDElementGetReportID(element: IOHIDElementRef) -> u32;
    fn IOHIDElementGetLogicalMin(element: IOHIDElementRef) -> CFIndex;
    fn IOHIDElementGetLogicalMax(element: IOHIDElementRef) -> CFIndex;
    fn IOHIDElementGetPhysicalMin(element: IOHIDElementRef) -> CFIndex;
    fn IOHIDElementGetPhysicalMax(element: IOHIDElementRef) -> CFIndex;
    fn IOHIDElementGetUnitExponent(element: IOHIDElementRef) -> u32;
    fn IOHIDCheckAccess(request_type: u32) -> u32;
}

/// 장치 포인터 + 요소 쿠키 → 해당 휠 요소에 적용되는 배율 Feature
type MultiplierCache = HashMap<(usize, u32), Option<HidResolutionMultiplier>>;

/// 콜백 컨텍스트 (manager 스레드 전용)
struct HidContext {
    wheel: WheelSender,
    pointer: PointerSender,
    multipliers: RefCell<MultiplierCache>,
    /// 권한 거부를 본 시점의 접근 상태. 허용으로 바뀌면 manager 재구성
    denied_access: Cell<Option<u32>>,
}

impl HidContext {
    /// 장치 객체가 TCC 판정을 캐시하므로 허용 뒤에는 새 manager가 필요
    fn note_permission_denied(&self) {
        if self.denied_access.get().is_none() {
            let access = unsafe { IOHIDCheckAccess(K_IOHID_REQUEST_TYPE_LISTEN_EVENT) };
            eprintln!("[Wheel] HID open not permitted (access={access})");
            self.denied_access.set(Some(access));
        }
    }

    fn permission_recovered(&self) -> bool {
        self.denied_access.get().is_some_and(|at_denial| {
            at_denial != K_IOHID_ACCESS_TYPE_GRANTED
                && unsafe { IOHIDCheckAccess(K_IOHID_REQUEST_TYPE_LISTEN_EVENT) }
                    == K_IOHID_ACCESS_TYPE_GRANTED
        })
    }
}

fn is_wheel_usage(usage_page: u32, usage: u32) -> bool {
    matches!(
        (usage_page, usage),
        (HID_PAGE_GENERIC_DESKTOP, HID_USAGE_WHEEL) | (HID_PAGE_CONSUMER, HID_USAGE_AC_PAN)
    )
}

fn usage_dictionary(
    page_key: &str,
    page: u32,
    usage_key: &str,
    usage: u32,
) -> CFDictionary<CFString, CFNumber> {
    CFDictionary::from_CFType_pairs(&[
        (CFString::new(page_key), CFNumber::from(page as i32)),
        (CFString::new(usage_key), CFNumber::from(usage as i32)),
    ])
}

/// Copy 규칙으로 받은 요소 배열을 빌려 쓰고 해제 (요소 포인터는 배열이 살아 있는 동안만 사용)
unsafe fn with_elements<R>(
    elements: CFArrayRef,
    use_elements: impl FnOnce(&[IOHIDElementRef]) -> R,
) -> Option<R> {
    if elements.is_null() {
        return None;
    }
    let list: Vec<IOHIDElementRef> = (0..CFArrayGetCount(elements))
        .map(|index| CFArrayGetValueAtIndex(elements, index) as IOHIDElementRef)
        .collect();
    let result = use_elements(&list);
    CFRelease(elements as *const c_void);
    Some(result)
}

unsafe fn nearest_logical_collection(element: IOHIDElementRef) -> IOHIDElementRef {
    let mut ancestor = IOHIDElementGetParent(element);
    while !ancestor.is_null() {
        if IOHIDElementGetCollectionType(ancestor) == K_IOHID_ELEMENT_COLLECTION_TYPE_LOGICAL {
            return ancestor;
        }
        ancestor = IOHIDElementGetParent(ancestor);
    }
    std::ptr::null_mut()
}

/// 배율 적용 범위: Feature가 속한 Logical Collection, 없으면 같은 report (HUT Resolution Multiplier)
unsafe fn multiplier_applies(feature: IOHIDElementRef, wheel: IOHIDElementRef) -> bool {
    let scope = nearest_logical_collection(feature);
    if scope.is_null() {
        return IOHIDElementGetReportID(feature) == IOHIDElementGetReportID(wheel);
    }
    let mut ancestor = IOHIDElementGetParent(wheel);
    while !ancestor.is_null() {
        if ancestor == scope {
            return true;
        }
        ancestor = IOHIDElementGetParent(ancestor);
    }
    false
}

unsafe fn read_multiplier(
    device: IOHIDDeviceRef,
    feature: IOHIDElementRef,
) -> Option<HidResolutionMultiplier> {
    let mut value: IOHIDValueRef = std::ptr::null_mut();
    let result = IOHIDDeviceGetValue(device, feature, &mut value);
    if result != K_IO_RETURN_SUCCESS || value.is_null() {
        // HID 초기 배율(1)로 처리
        eprintln!("[Wheel] resolution multiplier read failed: {result:#x}");
        return None;
    }
    Some(HidResolutionMultiplier {
        value: IOHIDValueGetIntegerValue(value) as i64,
        logical_min: IOHIDElementGetLogicalMin(feature) as i64,
        logical_max: IOHIDElementGetLogicalMax(feature) as i64,
        physical_min: IOHIDElementGetPhysicalMin(feature) as i64,
        physical_max: IOHIDElementGetPhysicalMax(feature) as i64,
        unit_exponent: IOHIDElementGetUnitExponent(feature),
    })
}

/// 장치 연결: 휠 요소별 배율 Feature 원본값을 한 번 읽어 캐시
extern "C" fn on_device_matched(
    context: *mut c_void,
    result: IOReturn,
    _sender: *mut c_void,
    device: IOHIDDeviceRef,
) {
    let context = unsafe { &*(context as *const HidContext) };
    if result == K_IO_RETURN_NOT_PERMITTED {
        context.note_permission_denied();
        return;
    }
    let entries = unsafe {
        let elements =
            IOHIDDeviceCopyMatchingElements(device, std::ptr::null(), K_IOHID_OPTIONS_TYPE_NONE);
        with_elements(elements, |elements| {
            let is_feature = |element: IOHIDElementRef| {
                IOHIDElementGetUsagePage(element) == HID_PAGE_GENERIC_DESKTOP
                    && IOHIDElementGetUsage(element) == HID_USAGE_RESOLUTION_MULTIPLIER
                    && IOHIDElementGetType(element) == K_IOHID_ELEMENT_TYPE_FEATURE
            };
            let features: Vec<IOHIDElementRef> = elements
                .iter()
                .copied()
                .filter(|e| is_feature(*e))
                .collect();
            elements
                .iter()
                .copied()
                .filter(|element| {
                    is_wheel_usage(
                        IOHIDElementGetUsagePage(*element),
                        IOHIDElementGetUsage(*element),
                    )
                })
                .map(|wheel| {
                    let multiplier = features
                        .iter()
                        .find(|feature| multiplier_applies(**feature, wheel))
                        .and_then(|feature| read_multiplier(device, *feature));
                    (IOHIDElementGetCookie(wheel), multiplier)
                })
                .collect::<Vec<_>>()
        })
    };

    let mut multipliers = context.multipliers.borrow_mut();
    for (cookie, multiplier) in entries.unwrap_or_default() {
        multipliers.insert((device as usize, cookie), multiplier);
    }
}

extern "C" fn on_device_removed(
    context: *mut c_void,
    _result: IOReturn,
    _sender: *mut c_void,
    device: IOHIDDeviceRef,
) {
    let context = unsafe { &*(context as *const HidContext) };
    context
        .multipliers
        .borrow_mut()
        .retain(|(owner, _), _| *owner != device as usize);
}

extern "C" fn on_input_value(
    context: *mut c_void,
    _result: IOReturn,
    _sender: *mut c_void,
    value: IOHIDValueRef,
) {
    let captured = super::InputCapture::now();
    let context = unsafe { &*(context as *const HidContext) };
    let (usage_page, usage, raw, key) = unsafe {
        let element = IOHIDValueGetElement(value);
        let device = IOHIDElementGetDevice(element);
        (
            IOHIDElementGetUsagePage(element),
            IOHIDElementGetUsage(element),
            IOHIDValueGetIntegerValue(value) as i64,
            (device as usize, IOHIDElementGetCookie(element)),
        )
    };
    if raw == 0 {
        return;
    }
    // 하드웨어 이동량 - 커서 가속·화면 끝 멈춤이 적용되기 전 값
    if usage_page == HID_PAGE_GENERIC_DESKTOP && (usage == HID_USAGE_X || usage == HID_USAGE_Y) {
        let delta = raw as f64;
        context.pointer.send(if usage == HID_USAGE_X {
            PointerInput::Delta { dx: delta, dy: 0.0 }
        } else {
            PointerInput::Delta { dx: 0.0, dy: delta }
        });
        return;
    }
    if !is_wheel_usage(usage_page, usage) {
        return;
    }
    let multiplier = context.multipliers.borrow().get(&key).copied().flatten();
    context.wheel.send(
        captured,
        WheelSample::MacHidValue {
            usage_page,
            usage,
            value: raw,
            multiplier,
        },
    );
}

/// manager 생성·매칭·스케줄·열기. 생성 실패만 None (장치별 실패는 콜백·집계 결과로 기록)
unsafe fn open_manager(context: *mut c_void) -> Option<IOHIDManagerRef> {
    let manager = IOHIDManagerCreate(kCFAllocatorDefault, K_IOHID_OPTIONS_TYPE_NONE);
    if manager.is_null() {
        return None;
    }
    let devices = CFArray::from_CFTypes(&[
        usage_dictionary(
            "DeviceUsagePage",
            HID_PAGE_GENERIC_DESKTOP,
            "DeviceUsage",
            HID_USAGE_MOUSE,
        ),
        usage_dictionary(
            "DeviceUsagePage",
            HID_PAGE_GENERIC_DESKTOP,
            "DeviceUsage",
            HID_USAGE_POINTER,
        ),
    ]);
    let values = CFArray::from_CFTypes(&[
        usage_dictionary(
            "UsagePage",
            HID_PAGE_GENERIC_DESKTOP,
            "Usage",
            HID_USAGE_WHEEL,
        ),
        usage_dictionary("UsagePage", HID_PAGE_CONSUMER, "Usage", HID_USAGE_AC_PAN),
        usage_dictionary("UsagePage", HID_PAGE_GENERIC_DESKTOP, "Usage", HID_USAGE_X),
        usage_dictionary("UsagePage", HID_PAGE_GENERIC_DESKTOP, "Usage", HID_USAGE_Y),
    ]);
    IOHIDManagerSetDeviceMatchingMultiple(manager, devices.as_concrete_TypeRef());
    IOHIDManagerSetInputValueMatchingMultiple(manager, values.as_concrete_TypeRef());
    IOHIDManagerRegisterDeviceMatchingCallback(manager, on_device_matched, context);
    IOHIDManagerRegisterDeviceRemovalCallback(manager, on_device_removed, context);
    IOHIDManagerRegisterInputValueCallback(manager, on_input_value, context);
    IOHIDManagerScheduleWithRunLoop(
        manager,
        CFRunLoop::get_current().as_concrete_TypeRef(),
        kCFRunLoopDefaultMode,
    );
    // 집계 결과는 첫 실패만 담음 - 권한 거부는 장치 매칭 콜백에서도 기록
    let result = IOHIDManagerOpen(manager, K_IOHID_OPTIONS_TYPE_NONE);
    if result == K_IO_RETURN_NOT_PERMITTED {
        (*(context as *const HidContext)).note_permission_denied();
    } else if result != K_IO_RETURN_SUCCESS {
        // 일부 장치만 실패(다른 프로그램 독점 등) - 열린 장치는 계속 수집
        eprintln!("[Wheel] IOHIDManagerOpen partial failure: {result:#x}");
    }
    Some(manager)
}

/// 권한 거부 뒤 허용되면 런루프를 멈춰 manager 재구성
extern "C" fn on_access_poll(_timer: CFRunLoopTimerRef, info: *mut c_void) {
    let context = unsafe { &*(info as *const HidContext) };
    if context.permission_recovered() {
        CFRunLoop::get_current().stop();
    }
}

/// HID 휠 수집 스레드 시작. 이 스레드의 CFRunLoop에서 모든 콜백 처리
pub(super) fn start_hid_wheel_capture(wheel: WheelSender, pointer: PointerSender) {
    let spawned = thread::Builder::new()
        .name("keyboard-wheel-hid".into())
        .spawn(move || {
            // context는 데몬 수명 동안 유지
            let context_ptr = Box::into_raw(Box::new(HidContext {
                wheel,
                pointer,
                multipliers: RefCell::new(HashMap::new()),
                denied_access: Cell::new(None),
            })) as *mut c_void;
            let context = unsafe { &*(context_ptr as *const HidContext) };
            loop {
                context.multipliers.borrow_mut().clear();
                context.denied_access.set(None);
                let Some(manager) = (unsafe { open_manager(context_ptr) }) else {
                    thread::sleep(HID_REOPEN_INTERVAL);
                    continue;
                };

                let run_loop = CFRunLoop::get_current();
                let mut timer_context = CFRunLoopTimerContext {
                    version: 0,
                    info: context_ptr,
                    retain: None,
                    release: None,
                    copyDescription: None,
                };
                let timer = CFRunLoopTimer::new(
                    unsafe { CFAbsoluteTimeGetCurrent() } + HID_ACCESS_POLL_SECONDS,
                    HID_ACCESS_POLL_SECONDS,
                    0,
                    0,
                    on_access_poll,
                    &mut timer_context,
                );
                unsafe { run_loop.add_timer(&timer, kCFRunLoopDefaultMode) };
                CFRunLoop::run_current();

                // 권한 회복: Close가 스케줄도 제거, 새 manager로 장치 TCC 재판정
                unsafe { run_loop.remove_timer(&timer, kCFRunLoopDefaultMode) };
                unsafe {
                    IOHIDManagerClose(manager, K_IOHID_OPTIONS_TYPE_NONE);
                    CFRelease(manager as *const c_void);
                }
                eprintln!("[Wheel] input monitoring granted, reopening HID manager");
            }
        });
    if let Err(err) = spawned {
        // 휠만 비활성, 키보드·마우스 버튼 입력은 계속
        eprintln!("[Wheel] HID capture thread failed: {err}");
    }
}
