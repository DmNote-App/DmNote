//! 마우스 휠 공용 엔진
//! - 플랫폼 어댑터는 원본 표본만 전달, 정규화·칸 판정·탭 합성·가상 축은 여기서만 처리
//! - 칸마다 짧은 탭(Down → TAP 후 Up), 다음 칸이 먼저 오면 즉시 Up 후 Down
//! - 가상 축은 기존 HidAxisMessage로 발행 (axisEventBus의 wrap 최단경로 계약 준수)

use std::{
    io,
    sync::mpsc::{self, RecvTimeoutError, Sender},
    thread,
    time::{Duration, Instant},
};

use super::{DaemonOutput, HoldTracker, InputCapture, OutputSender, AXIS_THROTTLE_MS};
use crate::ipc::{HidAxisMessage, HookKeyState, HookMessage, InputDeviceKind};

/// 휠 한 칸 단위 (Windows WHEEL_DELTA와 동일)
const WHEEL_NOTCH_UNITS: f64 = 120.0;
/// 고해상도 누적의 부동소수 오차 허용치
const WHEEL_UNIT_EPSILON: f64 = 1e-6;
/// 합성 탭 눌림 시간
const WHEEL_TAP_MS: u64 = 50;
/// 가상 축 해상도: 가상 24칸 = 1회전
const WHEEL_AXIS_FULL: u32 = 24 * 120;
/// 한 축 메시지의 최대 이동량 (wrap 최단경로 복원 한계 full/2 미만 유지)
const WHEEL_AXIS_MAX_STEP: i64 = WHEEL_AXIS_FULL as i64 / 4;

#[cfg(any(target_os = "windows", test))]
const RI_MOUSE_WHEEL: u16 = 0x0400;
#[cfg(any(target_os = "windows", test))]
const RI_MOUSE_HWHEEL: u16 = 0x0800;
#[cfg(any(target_os = "macos", test))]
pub(super) const HID_PAGE_GENERIC_DESKTOP: u32 = 0x01;
#[cfg(any(target_os = "macos", test))]
pub(super) const HID_USAGE_WHEEL: u32 = 0x38;
#[cfg(any(target_os = "macos", test))]
pub(super) const HID_PAGE_CONSUMER: u32 = 0x0C;
#[cfg(any(target_os = "macos", test))]
pub(super) const HID_USAGE_AC_PAN: u32 = 0x238;

/// HID Resolution Multiplier Feature 원본값
#[cfg(any(target_os = "macos", test))]
#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct HidResolutionMultiplier {
    pub(super) value: i64,
    pub(super) logical_min: i64,
    pub(super) logical_max: i64,
    pub(super) physical_min: i64,
    pub(super) physical_max: i64,
    /// HID 4비트 지수 원본 (8..=15는 음수)
    pub(super) unit_exponent: u32,
}

/// 플랫폼 원본 표본
#[derive(Debug, Clone, Copy)]
pub(super) enum WheelSample {
    /// Windows RAWMOUSE usButtonFlags·usButtonData
    #[cfg(any(target_os = "windows", test))]
    WindowsRawMouse { button_flags: u16, button_data: u16 },
    /// macOS IOHID 입력 값과 해당 장치의 배율 Feature
    #[cfg(any(target_os = "macos", test))]
    MacHidValue {
        usage_page: u32,
        usage: u32,
        value: i64,
        multiplier: Option<HidResolutionMultiplier>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum WheelAxis {
    Vertical,
    Horizontal,
}

impl WheelAxis {
    fn index(self) -> usize {
        match self {
            Self::Vertical => 0,
            Self::Horizontal => 1,
        }
    }

    fn axis_id(self) -> &'static str {
        match self {
            Self::Vertical => "WHEEL:VERTICAL",
            Self::Horizontal => "WHEEL:HORIZONTAL",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum WheelDirection {
    Up,
    Down,
    Left,
    Right,
}

impl WheelDirection {
    const ALL: [Self; 4] = [Self::Up, Self::Down, Self::Left, Self::Right];

    fn from_axis(axis: WheelAxis, positive: bool) -> Self {
        match (axis, positive) {
            (WheelAxis::Vertical, true) => Self::Up,
            (WheelAxis::Vertical, false) => Self::Down,
            (WheelAxis::Horizontal, true) => Self::Right,
            (WheelAxis::Horizontal, false) => Self::Left,
        }
    }

    fn index(self) -> usize {
        match self {
            Self::Up => 0,
            Self::Down => 1,
            Self::Left => 2,
            Self::Right => 3,
        }
    }

    fn opposite(self) -> Self {
        match self {
            Self::Up => Self::Down,
            Self::Down => Self::Up,
            Self::Left => Self::Right,
            Self::Right => Self::Left,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Up => "WHEELUP",
            Self::Down => "WHEELDOWN",
            Self::Left => "WHEELLEFT",
            Self::Right => "WHEELRIGHT",
        }
    }

    fn physical_id(self) -> &'static str {
        match self {
            Self::Up => "mouse:wheel:up",
            Self::Down => "mouse:wheel:down",
            Self::Left => "mouse:wheel:left",
            Self::Right => "mouse:wheel:right",
        }
    }
}

/// RAWMOUSE 보고서에 휠 데이터가 있을 때만 표본으로 (이동 전용 보고서 제외)
#[cfg(any(target_os = "windows", test))]
pub(super) fn windows_wheel_sample(button_flags: u16, button_data: u16) -> Option<WheelSample> {
    (button_flags & (RI_MOUSE_WHEEL | RI_MOUSE_HWHEEL) != 0).then_some(
        WheelSample::WindowsRawMouse {
            button_flags,
            button_data,
        },
    )
}

/// HID 유효 배율. Feature 없음·비정상 값은 HID 초기 배율 1, 음수는 방향 반전 배율
#[cfg(any(target_os = "macos", test))]
fn effective_multiplier(feature: Option<HidResolutionMultiplier>) -> f64 {
    let Some(feature) = feature else {
        return 1.0;
    };
    if feature.logical_max <= feature.logical_min {
        return 1.0;
    }
    // 물리 범위 미지정(0..0)이면 논리 범위 사용
    let (physical_min, physical_max) = if feature.physical_min == 0 && feature.physical_max == 0 {
        (feature.logical_min, feature.logical_max)
    } else {
        (feature.physical_min, feature.physical_max)
    };
    let exponent = match feature.unit_exponent as i32 {
        raw @ 8..=15 => raw - 16,
        raw => raw,
    };
    let ratio = (feature.value - feature.logical_min) as f64
        / (feature.logical_max - feature.logical_min) as f64;
    let multiplier = (ratio * (physical_max - physical_min) as f64 + physical_min as f64)
        * 10_f64.powi(exponent);
    if multiplier.is_finite() && multiplier != 0.0 {
        multiplier
    } else {
        1.0
    }
}

/// 원본 표본 → (축, 물리 방향 기준 units). 세로 +는 사용자 반대쪽(위), 가로 +는 오른쪽
fn normalize(sample: WheelSample) -> Option<(WheelAxis, f64)> {
    let (axis, units) = match sample {
        #[cfg(any(target_os = "windows", test))]
        WheelSample::WindowsRawMouse {
            button_flags,
            button_data,
        } => {
            let units = f64::from(button_data as i16);
            if button_flags & RI_MOUSE_WHEEL != 0 {
                (WheelAxis::Vertical, units)
            } else if button_flags & RI_MOUSE_HWHEEL != 0 {
                (WheelAxis::Horizontal, units)
            } else {
                return None;
            }
        }
        #[cfg(any(target_os = "macos", test))]
        WheelSample::MacHidValue {
            usage_page,
            usage,
            value,
            multiplier,
        } => {
            let axis = match (usage_page, usage) {
                (HID_PAGE_GENERIC_DESKTOP, HID_USAGE_WHEEL) => WheelAxis::Vertical,
                (HID_PAGE_CONSUMER, HID_USAGE_AC_PAN) => WheelAxis::Horizontal,
                _ => return None,
            };
            let units = value as f64 * WHEEL_NOTCH_UNITS / effective_multiplier(multiplier);
            (axis, units)
        }
    };
    (units != 0.0).then_some((axis, units))
}

#[derive(Default)]
struct AxisState {
    /// 칸 판정 전 signed 잔여량
    residual: f64,
    /// 누적 목표 위치 (소수 보존)
    target: f64,
    /// 마지막으로 발행한 정수 위치
    emitted: i64,
    last_emit: Option<Instant>,
}

#[derive(Default)]
pub(super) struct WheelEngine {
    pressed: [Option<InputCapture>; 4],
    hold_tracker: HoldTracker<WheelDirection>,
    axes: [AxisState; 2],
    /// 마지막 에지의 논리 시각 (단조 증가 보정 기준)
    last_edge: Option<InputCapture>,
}

impl WheelEngine {
    pub(super) fn on_input(
        &mut self,
        captured: InputCapture,
        sample: WheelSample,
    ) -> Vec<DaemonOutput> {
        let mut outputs = self.on_tick(captured.instant);
        let Some((axis, units)) = normalize(sample) else {
            return outputs;
        };
        let captured = self.monotonic(captured);

        let state = &mut self.axes[axis.index()];
        state.residual += units;
        let notches = ((state.residual.abs() + WHEEL_UNIT_EPSILON) / WHEEL_NOTCH_UNITS).floor();
        let positive = state.residual > 0.0;
        state.residual -= notches * WHEEL_NOTCH_UNITS * state.residual.signum();
        state.target += units;

        let direction = WheelDirection::from_axis(axis, positive);
        for _ in 0..notches as u64 {
            self.pulse(direction, captured, &mut outputs);
        }

        let state = &self.axes[axis.index()];
        let throttle_passed = state.last_emit.is_none_or(|last| {
            captured.instant.saturating_duration_since(last)
                >= Duration::from_millis(AXIS_THROTTLE_MS)
        });
        if throttle_passed {
            self.flush_axis(axis, captured.instant, &mut outputs);
        }
        outputs
    }

    pub(super) fn on_tick(&mut self, now: Instant) -> Vec<DaemonOutput> {
        let mut outputs = Vec::new();
        let mut expired: Vec<(Instant, WheelDirection)> = WheelDirection::ALL
            .into_iter()
            .filter_map(|direction| {
                let deadline = self.release_deadline(direction)?;
                (deadline <= now).then_some((deadline, direction))
            })
            .collect();
        expired.sort_by_key(|(deadline, direction)| (*deadline, direction.index()));
        for (_, direction) in expired {
            let at = self.tap_release_at(direction);
            self.release(direction, at, &mut outputs);
        }

        for axis in [WheelAxis::Vertical, WheelAxis::Horizontal] {
            if self
                .axis_flush_deadline(axis)
                .is_some_and(|deadline| deadline <= now)
            {
                self.flush_axis(axis, now, &mut outputs);
            }
        }
        outputs
    }

    pub(super) fn next_deadline(&self) -> Option<Instant> {
        let releases = WheelDirection::ALL
            .into_iter()
            .filter_map(|direction| self.release_deadline(direction));
        let flushes = [WheelAxis::Vertical, WheelAxis::Horizontal]
            .into_iter()
            .filter_map(|axis| self.axis_flush_deadline(axis));
        releases.chain(flushes).min()
    }

    /// 입력 종료: 눌린 탭 해제, 남은 축 이동 발행
    pub(super) fn shutdown(&mut self, now: InputCapture) -> Vec<DaemonOutput> {
        let mut outputs = Vec::new();
        let now = self.monotonic(now);
        for direction in WheelDirection::ALL {
            if self.pressed[direction.index()].is_some() {
                self.release(direction, now, &mut outputs);
            }
        }
        for axis in [WheelAxis::Vertical, WheelAxis::Horizontal] {
            self.flush_axis(axis, now.instant, &mut outputs);
        }
        outputs
    }

    fn monotonic(&mut self, captured: InputCapture) -> InputCapture {
        let at = match self.last_edge {
            Some(last) if captured.instant < last.instant => last,
            _ => captured,
        };
        self.last_edge = Some(at);
        at
    }

    fn release_deadline(&self, direction: WheelDirection) -> Option<Instant> {
        self.pressed[direction.index()]
            .map(|down| down.instant + Duration::from_millis(WHEEL_TAP_MS))
    }

    fn tap_release_at(&self, direction: WheelDirection) -> InputCapture {
        let down = self.pressed[direction.index()].expect("released tap must be pressed");
        InputCapture {
            instant: down.instant + Duration::from_millis(WHEEL_TAP_MS),
            input_ts_ms: down.input_ts_ms.map(|ts| ts + WHEEL_TAP_MS as f64),
        }
    }

    /// 미발행 이동의 trailing flush 시한. 첫 이동은 on_input에서 즉시 발행하므로 last_emit 기준만
    fn axis_flush_deadline(&self, axis: WheelAxis) -> Option<Instant> {
        let state = &self.axes[axis.index()];
        if state.target.round() as i64 == state.emitted {
            return None;
        }
        state
            .last_emit
            .map(|last| last + Duration::from_millis(AXIS_THROTTLE_MS))
    }

    fn pulse(
        &mut self,
        direction: WheelDirection,
        at: InputCapture,
        outputs: &mut Vec<DaemonOutput>,
    ) {
        for held in [direction.opposite(), direction] {
            if self.pressed[held.index()].is_some() {
                self.release(held, at, outputs);
            }
        }
        let labels =
            self.hold_tracker
                .press(direction, at.instant, vec![direction.label().to_string()]);
        self.pressed[direction.index()] = Some(at);
        outputs.push(hook_output(direction, labels, HookKeyState::Down, None, at));
    }

    fn release(
        &mut self,
        direction: WheelDirection,
        at: InputCapture,
        outputs: &mut Vec<DaemonOutput>,
    ) {
        self.pressed[direction.index()] = None;
        let release =
            self.hold_tracker
                .release(direction, at.instant, vec![direction.label().to_string()]);
        if self.last_edge.is_none_or(|last| last.instant < at.instant) {
            self.last_edge = Some(at);
        }
        outputs.push(hook_output(
            direction,
            release.labels,
            HookKeyState::Up,
            release.hold_duration_ms,
            at,
        ));
    }

    /// 이동 전 기준값 → full/4 이하 단계로 이동값 발행
    fn flush_axis(&mut self, axis: WheelAxis, now: Instant, outputs: &mut Vec<DaemonOutput>) {
        let state = &mut self.axes[axis.index()];
        let target = state.target.round() as i64;
        let mut remaining = target - state.emitted;
        if remaining == 0 {
            return;
        }
        outputs.push(axis_output(axis, state.emitted));
        while remaining != 0 {
            let step = remaining.clamp(-WHEEL_AXIS_MAX_STEP, WHEEL_AXIS_MAX_STEP);
            state.emitted += step;
            remaining -= step;
            outputs.push(axis_output(axis, state.emitted));
        }
        state.last_emit = Some(now);
    }
}

fn hook_output(
    direction: WheelDirection,
    labels: Vec<String>,
    state: HookKeyState,
    hold_duration_ms: Option<f64>,
    at: InputCapture,
) -> DaemonOutput {
    DaemonOutput::Hook(HookMessage {
        device: InputDeviceKind::Mouse,
        labels,
        state,
        physical_id: Some(direction.physical_id().to_string()),
        vk_code: None,
        scan_code: None,
        flags: None,
        hold_duration_ms,
        input_ts_ms: at.input_ts_ms,
    })
}

fn axis_output(axis: WheelAxis, position: i64) -> DaemonOutput {
    DaemonOutput::Axis(HidAxisMessage {
        axis_id: axis.axis_id().to_string(),
        value: position.rem_euclid(i64::from(WHEEL_AXIS_FULL)) as u32,
        full: WHEEL_AXIS_FULL,
    })
}

/// 어댑터 → 엔진 스레드 입력 채널
#[derive(Clone)]
pub(super) struct WheelSender(Sender<(InputCapture, WheelSample)>);

impl WheelSender {
    pub(super) fn send(&self, captured: InputCapture, sample: WheelSample) {
        if self.0.send((captured, sample)).is_err() {
            eprintln!("keyboard daemon wheel channel closed");
            std::process::exit(1);
        }
    }
}

/// 데몬당 하나. 입력 채널이 모두 닫히면 남은 탭을 해제하고 종료
pub(super) fn spawn_wheel_engine(output: OutputSender) -> io::Result<WheelSender> {
    let (sender, receiver) = mpsc::channel::<(InputCapture, WheelSample)>();
    thread::Builder::new()
        .name("keyboard-wheel-engine".into())
        .spawn(move || {
            let mut engine = WheelEngine::default();
            loop {
                let received = match engine.next_deadline() {
                    Some(deadline) => {
                        receiver.recv_timeout(deadline.saturating_duration_since(Instant::now()))
                    }
                    None => receiver.recv().map_err(|_| RecvTimeoutError::Disconnected),
                };
                let (outputs, closed) = match received {
                    Ok((captured, sample)) => (engine.on_input(captured, sample), false),
                    Err(RecvTimeoutError::Timeout) => (engine.on_tick(Instant::now()), false),
                    Err(RecvTimeoutError::Disconnected) => {
                        (engine.shutdown(InputCapture::now()), true)
                    }
                };
                for item in outputs {
                    output.send(item);
                }
                if closed {
                    break;
                }
            }
        })?;
    Ok(WheelSender(sender))
}

#[cfg(test)]
mod tests {
    use std::{
        sync::mpsc,
        time::{Duration, Instant},
    };

    use super::{
        effective_multiplier, normalize, spawn_wheel_engine, windows_wheel_sample,
        HidResolutionMultiplier, WheelAxis, WheelEngine, WheelSample, HID_PAGE_CONSUMER,
        HID_PAGE_GENERIC_DESKTOP, HID_USAGE_AC_PAN, HID_USAGE_WHEEL, RI_MOUSE_HWHEEL,
        RI_MOUSE_WHEEL, WHEEL_AXIS_FULL, WHEEL_AXIS_MAX_STEP,
    };
    use crate::ipc::{HookKeyState, InputDeviceKind};
    use crate::keyboard::daemon::{DaemonOutput, InputCapture, OutputSender};

    #[derive(Debug, PartialEq)]
    enum Out {
        Down(String),
        Up(String, f64),
        Axis(String, u32),
    }

    fn down(label: &str) -> Out {
        Out::Down(label.to_string())
    }

    fn up(label: &str, hold_ms: f64) -> Out {
        Out::Up(label.to_string(), hold_ms)
    }

    fn axis(axis_id: &str, value: u32) -> Out {
        Out::Axis(axis_id.to_string(), value)
    }

    fn simplify(outputs: Vec<DaemonOutput>) -> Vec<Out> {
        outputs
            .into_iter()
            .map(|output| match output {
                DaemonOutput::Hook(message) => {
                    assert_eq!(message.device, InputDeviceKind::Mouse);
                    assert_eq!(message.labels.len(), 1);
                    let label = message.labels[0].clone();
                    match message.state {
                        HookKeyState::Down => {
                            assert_eq!(message.hold_duration_ms, None);
                            Out::Down(label)
                        }
                        HookKeyState::Up => Out::Up(label, message.hold_duration_ms.unwrap()),
                    }
                }
                DaemonOutput::Axis(message) => {
                    assert_eq!(message.full, WHEEL_AXIS_FULL);
                    Out::Axis(message.axis_id, message.value)
                }
                DaemonOutput::Command(command) => panic!("unexpected command {command:?}"),
                DaemonOutput::Pointer(message) => panic!("unexpected pointer {message:?}"),
            })
            .collect()
    }

    fn keys_only(outputs: Vec<DaemonOutput>) -> Vec<Out> {
        simplify(outputs)
            .into_iter()
            .filter(|out| !matches!(out, Out::Axis(..)))
            .collect()
    }

    fn axis_only(outputs: Vec<DaemonOutput>) -> Vec<Out> {
        simplify(outputs)
            .into_iter()
            .filter(|out| matches!(out, Out::Axis(..)))
            .collect()
    }

    struct Clock {
        base: Instant,
    }

    impl Clock {
        fn new() -> Self {
            Self {
                base: Instant::now(),
            }
        }

        fn at(&self, ms: u64) -> InputCapture {
            InputCapture {
                instant: self.base + Duration::from_millis(ms),
                input_ts_ms: Some(1_000.0 + ms as f64),
            }
        }

        fn instant(&self, ms: u64) -> Instant {
            self.base + Duration::from_millis(ms)
        }
    }

    fn vertical(units: i16) -> WheelSample {
        WheelSample::WindowsRawMouse {
            button_flags: RI_MOUSE_WHEEL,
            button_data: units as u16,
        }
    }

    fn horizontal(units: i16) -> WheelSample {
        WheelSample::WindowsRawMouse {
            button_flags: RI_MOUSE_HWHEEL,
            button_data: units as u16,
        }
    }

    fn mac_wheel(value: i64, multiplier: Option<HidResolutionMultiplier>) -> WheelSample {
        WheelSample::MacHidValue {
            usage_page: HID_PAGE_GENERIC_DESKTOP,
            usage: HID_USAGE_WHEEL,
            value,
            multiplier,
        }
    }

    fn feature(value: i64, physical_max: i64) -> HidResolutionMultiplier {
        HidResolutionMultiplier {
            value,
            logical_min: 0,
            logical_max: 1,
            physical_min: 1,
            physical_max,
            unit_exponent: 0,
        }
    }

    #[test]
    fn windows_wheel_flags_map_to_signed_axis_units() {
        assert_eq!(normalize(vertical(120)), Some((WheelAxis::Vertical, 120.0)));
        assert_eq!(
            normalize(vertical(-120)),
            Some((WheelAxis::Vertical, -120.0))
        );
        assert_eq!(
            normalize(horizontal(240)),
            Some((WheelAxis::Horizontal, 240.0))
        );
        assert_eq!(
            normalize(horizontal(-15)),
            Some((WheelAxis::Horizontal, -15.0))
        );
        // 버튼만 있는 보고서는 휠 아님
        assert_eq!(
            normalize(WheelSample::WindowsRawMouse {
                button_flags: 0x0001,
                button_data: 0,
            }),
            None
        );
    }

    #[test]
    fn windows_sample_is_created_only_for_wheel_reports() {
        assert!(windows_wheel_sample(0x0001, 0).is_none());
        assert!(windows_wheel_sample(0, 0).is_none());
        assert!(windows_wheel_sample(RI_MOUSE_WHEEL, 120).is_some());
        assert!(windows_wheel_sample(RI_MOUSE_HWHEEL | 0x0001, 120).is_some());
    }

    #[test]
    fn mac_hid_wheel_and_pan_map_to_notch_units() {
        assert_eq!(
            normalize(mac_wheel(1, None)),
            Some((WheelAxis::Vertical, 120.0))
        );
        assert_eq!(
            normalize(mac_wheel(-2, None)),
            Some((WheelAxis::Vertical, -240.0))
        );
        assert_eq!(
            normalize(WheelSample::MacHidValue {
                usage_page: HID_PAGE_CONSUMER,
                usage: HID_USAGE_AC_PAN,
                value: 1,
                multiplier: None,
            }),
            Some((WheelAxis::Horizontal, 120.0))
        );
        assert_eq!(normalize(mac_wheel(0, None)), None);
        // X축 등 다른 요소는 무시
        assert_eq!(
            normalize(WheelSample::MacHidValue {
                usage_page: HID_PAGE_GENERIC_DESKTOP,
                usage: 0x30,
                value: 5,
                multiplier: None,
            }),
            None
        );
    }

    #[test]
    fn resolution_multiplier_follows_current_feature_value() {
        assert_eq!(effective_multiplier(None), 1.0);
        // 초기값(논리 최소)은 물리 최소 배율
        assert_eq!(effective_multiplier(Some(feature(0, 8))), 1.0);
        assert_eq!(effective_multiplier(Some(feature(1, 8))), 8.0);
        assert_eq!(effective_multiplier(Some(feature(1, 16))), 16.0);
        // 물리 범위 미지정이면 논리 범위
        assert_eq!(
            effective_multiplier(Some(HidResolutionMultiplier {
                value: 4,
                logical_min: 1,
                logical_max: 8,
                physical_min: 0,
                physical_max: 0,
                unit_exponent: 0,
            })),
            4.0
        );
        // 4비트 음수 지수 (0xF = -1)
        assert_eq!(
            effective_multiplier(Some(HidResolutionMultiplier {
                value: 1,
                logical_min: 0,
                logical_max: 1,
                physical_min: 10,
                physical_max: 80,
                unit_exponent: 0xF,
            })),
            8.0
        );
        // 음수 배율은 방향 반전 (HUT Resolution Multiplier)
        assert_eq!(
            effective_multiplier(Some(HidResolutionMultiplier {
                value: 0,
                logical_min: 0,
                logical_max: 1,
                physical_min: -8,
                physical_max: -1,
                unit_exponent: 0,
            })),
            -8.0
        );
        // 비정상 범위는 기본 배율
        assert_eq!(
            effective_multiplier(Some(HidResolutionMultiplier {
                value: 1,
                logical_min: 1,
                logical_max: 1,
                physical_min: 1,
                physical_max: 8,
                unit_exponent: 0,
            })),
            1.0
        );
    }

    #[test]
    fn fractional_high_resolution_counts_keep_exact_notches() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();
        let multiplier = Some(feature(1, 16));

        let mut downs = 0;
        for ms in 0..32 {
            downs += keys_only(engine.on_input(clock.at(ms * 100), mac_wheel(1, multiplier)))
                .iter()
                .filter(|out| matches!(out, Out::Down(_)))
                .count();
        }
        assert_eq!(downs, 2);
    }

    #[test]
    fn negative_multiplier_inverts_direction_and_scales_notches() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();
        let inverted = Some(HidResolutionMultiplier {
            value: 0,
            logical_min: 0,
            logical_max: 1,
            physical_min: -8,
            physical_max: -1,
            unit_exponent: 0,
        });

        assert_eq!(
            keys_only(engine.on_input(clock.at(0), mac_wheel(-8, inverted))),
            vec![down("WHEELUP")]
        );
    }

    #[test]
    fn one_notch_is_a_tap_released_after_tap_duration() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();

        assert_eq!(
            keys_only(engine.on_input(clock.at(0), vertical(120))),
            vec![down("WHEELUP")]
        );
        assert_eq!(engine.next_deadline(), Some(clock.instant(50)));
        assert!(keys_only(engine.on_tick(clock.instant(49))).is_empty());
        assert_eq!(
            keys_only(engine.on_tick(clock.instant(50))),
            vec![up("WHEELUP", 50.0)]
        );
        assert_eq!(engine.next_deadline(), None);
    }

    #[test]
    fn deadline_up_uses_logical_edge_timestamp() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();
        engine.on_input(clock.at(0), vertical(120));

        let outputs = engine.on_tick(clock.instant(80));
        let up = outputs
            .iter()
            .find_map(|output| match output {
                DaemonOutput::Hook(message) if message.state == HookKeyState::Up => Some(message),
                _ => None,
            })
            .unwrap();
        assert_eq!(up.input_ts_ms, Some(1_050.0));
        assert_eq!(up.hold_duration_ms, Some(50.0));
        assert_eq!(up.physical_id.as_deref(), Some("mouse:wheel:up"));
    }

    #[test]
    fn high_resolution_deltas_accumulate_to_one_notch() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();

        for ms in 0..3 {
            assert!(keys_only(engine.on_input(clock.at(ms), vertical(30))).is_empty());
        }
        assert_eq!(
            keys_only(engine.on_input(clock.at(3), vertical(30))),
            vec![down("WHEELUP")]
        );
    }

    #[test]
    fn residual_survives_long_pause() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();

        assert!(keys_only(engine.on_input(clock.at(0), vertical(60))).is_empty());
        assert_eq!(
            keys_only(engine.on_input(clock.at(2_000), vertical(60))),
            vec![down("WHEELUP")]
        );
    }

    #[test]
    fn residual_is_signed_across_direction_changes() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();

        assert!(keys_only(engine.on_input(clock.at(0), vertical(60))).is_empty());
        assert!(keys_only(engine.on_input(clock.at(10), vertical(-60))).is_empty());
        assert!(keys_only(engine.on_input(clock.at(20), vertical(-60))).is_empty());
        assert_eq!(
            keys_only(engine.on_input(clock.at(30), vertical(-60))),
            vec![down("WHEELDOWN")]
        );
    }

    #[test]
    fn multi_notch_report_keeps_every_notch_with_up_before_down() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();

        assert_eq!(
            keys_only(engine.on_input(clock.at(0), vertical(-360))),
            vec![
                down("WHEELDOWN"),
                up("WHEELDOWN", 0.0),
                down("WHEELDOWN"),
                up("WHEELDOWN", 0.0),
                down("WHEELDOWN"),
            ]
        );
    }

    #[test]
    fn next_notch_before_deadline_releases_then_presses() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();
        engine.on_input(clock.at(0), vertical(120));

        assert_eq!(
            keys_only(engine.on_input(clock.at(10), vertical(120))),
            vec![up("WHEELUP", 10.0), down("WHEELUP")]
        );
        assert_eq!(engine.next_deadline(), Some(clock.instant(12)));
        engine.on_tick(clock.instant(12));
        assert_eq!(engine.next_deadline(), Some(clock.instant(60)));
    }

    #[test]
    fn expired_tap_is_released_before_late_input() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();
        engine.on_input(clock.at(0), vertical(120));

        // 시한 tick 없이 다음 입력이 와도 시한 Up이 먼저
        assert_eq!(
            keys_only(engine.on_input(clock.at(80), vertical(120))),
            vec![up("WHEELUP", 50.0), down("WHEELUP")]
        );
    }

    #[test]
    fn stale_capture_time_does_not_run_backwards() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();
        engine.on_input(clock.at(0), vertical(120));
        engine.on_tick(clock.instant(50));

        // 시한 Up(50ms) 뒤에 더 이른 캡처 시각의 입력이 도착
        let outputs = engine.on_input(clock.at(40), vertical(120));
        let down = outputs
            .iter()
            .find_map(|output| match output {
                DaemonOutput::Hook(message) if message.state == HookKeyState::Down => Some(message),
                _ => None,
            })
            .unwrap();
        assert_eq!(down.input_ts_ms, Some(1_050.0));
    }

    #[test]
    fn reversing_releases_opposite_direction_first() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();
        engine.on_input(clock.at(0), vertical(120));

        assert_eq!(
            keys_only(engine.on_input(clock.at(20), vertical(-120))),
            vec![up("WHEELUP", 20.0), down("WHEELDOWN")]
        );
    }

    #[test]
    fn horizontal_axis_uses_left_and_right_labels() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();

        assert_eq!(
            keys_only(engine.on_input(clock.at(0), horizontal(120))),
            vec![down("WHEELRIGHT")]
        );
        assert_eq!(
            keys_only(engine.on_input(clock.at(100), horizontal(-120))),
            vec![up("WHEELRIGHT", 50.0), down("WHEELLEFT")]
        );
    }

    #[test]
    fn shutdown_releases_pressed_taps() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();
        engine.on_input(clock.at(0), vertical(120));
        engine.on_input(clock.at(1), horizontal(-120));

        assert_eq!(
            keys_only(engine.shutdown(clock.at(5))),
            vec![up("WHEELUP", 5.0), up("WHEELLEFT", 4.0)]
        );
        assert_eq!(engine.next_deadline(), None);
    }

    #[test]
    fn axis_batch_sends_baseline_before_moved_value() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();

        assert_eq!(
            axis_only(engine.on_input(clock.at(0), vertical(120))),
            vec![axis("WHEEL:VERTICAL", 0), axis("WHEEL:VERTICAL", 120)]
        );
        assert_eq!(
            axis_only(engine.on_input(clock.at(1_000), vertical(-240))),
            vec![axis("WHEEL:VERTICAL", 120), axis("WHEEL:VERTICAL", 2_760)]
        );
    }

    #[test]
    fn axis_is_throttled_with_trailing_flush() {
        let clock = Clock::new();
        let mut engine = WheelEngine::default();
        engine.on_input(clock.at(0), vertical(120));

        assert!(axis_only(engine.on_input(clock.at(5), vertical(120))).is_empty());
        assert_eq!(engine.next_deadline(), Some(clock.instant(12)));
        assert_eq!(
            axis_only(engine.on_tick(clock.instant(12))),
            vec![axis("WHEEL:VERTICAL", 120), axis("WHEEL:VERTICAL", 240)]
        );
    }

    // axisEventBus.ts의 wrap 최단경로 복원 공식
    fn shortest_delta(last: u32, value: u32, full: u32) -> i64 {
        let (last, value, full) = (i64::from(last), i64::from(value), i64::from(full));
        let half = full / 2;
        ((value - last + half) % full + full) % full - half
    }

    #[test]
    fn large_axis_moves_are_split_to_stay_recoverable() {
        let clock = Clock::new();

        for units in [3_000_i16, -7_000] {
            let mut engine = WheelEngine::default();
            let values: Vec<u32> = axis_only(engine.on_input(clock.at(0), vertical(units)))
                .into_iter()
                .map(|out| match out {
                    Out::Axis(_, value) => value,
                    other => panic!("{other:?}"),
                })
                .collect();
            let recovered: i64 = values
                .windows(2)
                .map(|pair| {
                    let delta = shortest_delta(pair[0], pair[1], WHEEL_AXIS_FULL);
                    assert!(delta.abs() <= WHEEL_AXIS_MAX_STEP);
                    delta
                })
                .sum();
            assert_eq!(recovered, i64::from(units));
        }
    }

    #[test]
    fn worker_emits_tap_and_release_through_output_channel() {
        let (sender, receiver) = mpsc::channel();
        let wheel = spawn_wheel_engine(OutputSender(sender)).unwrap();
        wheel.send(InputCapture::now(), vertical(120));

        let mut keys = Vec::new();
        while keys.len() < 2 {
            match receiver.recv_timeout(Duration::from_secs(1)).unwrap() {
                DaemonOutput::Hook(message) => keys.push(message.state),
                DaemonOutput::Axis(_) | DaemonOutput::Pointer(_) => {}
                DaemonOutput::Command(command) => panic!("unexpected command {command:?}"),
            }
        }
        assert_eq!(keys, vec![HookKeyState::Down, HookKeyState::Up]);
    }

    #[test]
    fn worker_releases_pressed_tap_when_input_closes() {
        let (sender, receiver) = mpsc::channel();
        let wheel = spawn_wheel_engine(OutputSender(sender)).unwrap();
        wheel.send(InputCapture::now(), vertical(-120));
        drop(wheel);

        let states: Vec<HookKeyState> = receiver
            .iter()
            .filter_map(|output| match output {
                DaemonOutput::Hook(message) => Some(message.state),
                _ => None,
            })
            .collect();
        assert_eq!(states, vec![HookKeyState::Down, HookKeyState::Up]);
    }
}
