//! 마우스 포인터 수집 - 하드웨어 이동량과 전역 커서 좌표를 모아 일정 간격으로 묶어 보낸다
//! - 이동량: macOS HID X·Y 원본 값, Windows Raw Input 상대 이동 (화면 끝에서도 멈추지 않는다)
//! - 좌표: macOS 전역 좌표(포인트), Windows GetCursorPos
//! - 하드웨어 이동량이 들어오지 않는 장치(트랙패드 등)는 좌표 차이로 이동량을 채운다

use std::{
    sync::mpsc::{self, Receiver, RecvTimeoutError, Sender},
    thread,
    time::{Duration, Instant},
};

use anyhow::{Context, Result};

use crate::ipc::{PointerMessage, PointerSample};

use super::{DaemonOutput, OutputSender};

// 묶어 보내는 간격 (약 120Hz) - 노브의 축 묶음 전송과 같은 방식
pub(super) const POINTER_FLUSH_INTERVAL: Duration = Duration::from_millis(8);
// 이 시간 안에 하드웨어 이동량이 있었으면 좌표 차이로 이동량을 채우지 않는다
const HARDWARE_DELTA_GRACE: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) enum PointerInput {
    Delta { dx: f64, dy: f64 },
    Position { x: f64, y: f64 },
}

#[derive(Clone)]
pub(super) struct PointerSender(Sender<(Instant, PointerInput)>);

impl PointerSender {
    pub(super) fn send(&self, input: PointerInput) {
        let _ = self.0.send((Instant::now(), input));
    }
}

/// 한 묶음 동안 쌓은 값
#[derive(Debug, Default)]
pub(super) struct PointerAccumulator {
    dx: f64,
    dy: f64,
    position: Option<(f64, f64)>,
    last_position: Option<(f64, f64)>,
    last_hardware_delta: Option<Instant>,
    dirty: bool,
}

impl PointerAccumulator {
    pub(super) fn record(&mut self, at: Instant, input: PointerInput) {
        match input {
            PointerInput::Delta { dx, dy } => {
                self.dx += dx;
                self.dy += dy;
                self.last_hardware_delta = Some(at);
            }
            PointerInput::Position { x, y } => {
                let hardware_recent = self
                    .last_hardware_delta
                    .is_some_and(|last| at.duration_since(last) < HARDWARE_DELTA_GRACE);
                if let (false, Some((px, py))) = (hardware_recent, self.last_position) {
                    self.dx += x - px;
                    self.dy += y - py;
                }
                self.last_position = Some((x, y));
                self.position = Some((x, y));
            }
        }
        self.dirty = true;
    }

    /// 보낼 것이 있으면 묶음 하나를 꺼낸다
    pub(super) fn take(&mut self) -> Option<PointerSample> {
        if !self.dirty {
            return None;
        }
        self.dirty = false;
        let sample = PointerSample {
            dx: self.dx,
            dy: self.dy,
            x: self.position.map(|(x, _)| x),
            y: self.position.map(|(_, y)| y),
        };
        self.dx = 0.0;
        self.dy = 0.0;
        self.position = None;
        Some(sample)
    }
}

fn run_pointer_engine(receiver: Receiver<(Instant, PointerInput)>, output: OutputSender) {
    let mut accumulator = PointerAccumulator::default();
    let mut next_flush = Instant::now() + POINTER_FLUSH_INTERVAL;
    loop {
        let wait = next_flush.saturating_duration_since(Instant::now());
        match receiver.recv_timeout(wait) {
            Ok((at, input)) => accumulator.record(at, input),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        if Instant::now() >= next_flush {
            if let Some(pointer) = accumulator.take() {
                output.send(DaemonOutput::Pointer(PointerMessage { pointer }));
            }
            next_flush = Instant::now() + POINTER_FLUSH_INTERVAL;
        }
    }
}

pub(super) fn spawn_pointer_engine(output: OutputSender) -> Result<PointerSender> {
    let (sender, receiver) = mpsc::channel();
    thread::Builder::new()
        .name("keyboard-pointer".into())
        .spawn(move || run_pointer_engine(receiver, output))
        .context("failed to start pointer engine")?;
    Ok(PointerSender(sender))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 하드웨어_이동량을_묶음마다_더해_보낸다() {
        let mut accumulator = PointerAccumulator::default();
        let now = Instant::now();
        accumulator.record(now, PointerInput::Delta { dx: 2.0, dy: -1.0 });
        accumulator.record(now, PointerInput::Delta { dx: 3.0, dy: 4.0 });
        accumulator.record(now, PointerInput::Position { x: 100.0, y: 50.0 });
        assert_eq!(
            accumulator.take(),
            Some(PointerSample {
                dx: 5.0,
                dy: 3.0,
                x: Some(100.0),
                y: Some(50.0)
            })
        );
        assert_eq!(accumulator.take(), None, "새 입력이 없으면 보내지 않는다");
    }

    #[test]
    fn 하드웨어_이동량이_없는_장치는_좌표_차이로_채운다() {
        let mut accumulator = PointerAccumulator::default();
        let start = Instant::now();
        accumulator.record(start, PointerInput::Position { x: 10.0, y: 10.0 });
        accumulator.take();
        accumulator.record(start, PointerInput::Position { x: 13.0, y: 6.0 });
        assert_eq!(
            accumulator.take(),
            Some(PointerSample {
                dx: 3.0,
                dy: -4.0,
                x: Some(13.0),
                y: Some(6.0)
            })
        );

        // 하드웨어 이동량이 막 들어왔으면 좌표 차이를 더하지 않는다
        accumulator.record(start, PointerInput::Delta { dx: 1.0, dy: 1.0 });
        accumulator.record(start, PointerInput::Position { x: 50.0, y: 50.0 });
        assert_eq!(
            accumulator.take(),
            Some(PointerSample {
                dx: 1.0,
                dy: 1.0,
                x: Some(50.0),
                y: Some(50.0)
            })
        );
        accumulator.record(
            start + Duration::from_millis(200),
            PointerInput::Position { x: 52.0, y: 50.0 },
        );
        assert_eq!(accumulator.take().map(|sample| sample.dx), Some(2.0));
    }
}
