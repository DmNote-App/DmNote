// 커서 트래커 점·궤적 계산 - 그리기와 떼어 둔 순수 계산
// A(motion): 하드웨어 이동량 × 감도만큼 밀렸다가 중앙으로 돌아온다. x·y 같은 배율, 경계에서 잘라낸다
// B(position): 모니터 영역을 패드에 대응한다. 영역 밖이면 점을 숨기고 궤적을 끊는다

export interface PointerSampleInput {
  dx: number;
  dy: number;
  x?: number;
  y?: number;
}

export interface MonitorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TrailPoint {
  x: number;
  y: number;
  at: number;
  // 앞 점과 이어 그리지 않는다 (영역 밖에서 돌아옴)
  broken?: boolean;
}

export interface CursorTrackerState {
  // 패드 안 점 위치 (패드 왼쪽 위 기준 px). 숨김이면 null
  dot: { x: number; y: number } | null;
  trail: TrailPoint[];
  // A 모드 중앙 기준 밀린 거리
  offset: { x: number; y: number };
  lastAt: number;
}

export interface CursorTrackerOptions {
  mode: 'motion' | 'position';
  width: number;
  height: number;
  sensitivity: number;
  returnMs: number;
  trailMs: number;
  monitor: MonitorRect | null;
}

export const initialCursorTrackerState = (
  width: number,
  height: number,
  at = 0,
): CursorTrackerState => ({
  dot: { x: width / 2, y: height / 2 },
  trail: [],
  offset: { x: 0, y: 0 },
  lastAt: at,
});

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const pruneTrail = (trail: TrailPoint[], at: number, trailMs: number) => {
  const from = trail.findIndex((point) => at - point.at <= trailMs);
  return from === -1 ? [] : from === 0 ? trail : trail.slice(from);
};

// 복귀: returnMs 동안 남은 거리의 대부분(약 95%)을 줄인다
const decay = (elapsed: number, returnMs: number) =>
  returnMs <= 0 ? 0 : Math.exp((-3 * elapsed) / returnMs);

const motionDot = (
  offset: { x: number; y: number },
  options: CursorTrackerOptions,
) => ({
  x: options.width / 2 + offset.x,
  y: options.height / 2 + offset.y,
});

const clampOffset = (
  offset: { x: number; y: number },
  options: CursorTrackerOptions,
) => ({
  x: clamp(offset.x, -options.width / 2, options.width / 2),
  y: clamp(offset.y, -options.height / 2, options.height / 2),
});

/** 포인터 묶음 하나를 반영한다 */
export const applyPointerSample = (
  state: CursorTrackerState,
  sample: PointerSampleInput,
  options: CursorTrackerOptions,
  at: number,
): CursorTrackerState => {
  if (options.mode === 'motion') {
    const settled = advanceCursorTracker(state, options, at);
    const offset = clampOffset(
      {
        x: settled.offset.x + sample.dx * options.sensitivity,
        y: settled.offset.y + sample.dy * options.sensitivity,
      },
      options,
    );
    const dot = motionDot(offset, options);
    return {
      dot,
      offset,
      trail: [...settled.trail, { ...dot, at }],
      lastAt: at,
    };
  }
  const trail = pruneTrail(state.trail, at, options.trailMs);
  if (sample.x === undefined || sample.y === undefined || !options.monitor) {
    return { ...state, trail, lastAt: at };
  }
  const { monitor } = options;
  const u = (sample.x - monitor.x) / monitor.width;
  const v = (sample.y - monitor.y) / monitor.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) {
    return { ...state, dot: null, trail, lastAt: at };
  }
  const dot = { x: u * options.width, y: v * options.height };
  return {
    ...state,
    dot,
    trail: [...trail, { ...dot, at, broken: state.dot === null || undefined }],
    lastAt: at,
  };
};

/** 시간만 흐름 - 중앙 복귀와 오래된 궤적 정리 */
export const advanceCursorTracker = (
  state: CursorTrackerState,
  options: CursorTrackerOptions,
  at: number,
): CursorTrackerState => {
  const trail = pruneTrail(state.trail, at, options.trailMs);
  if (options.mode !== 'motion') return { ...state, trail, lastAt: at };
  const factor = decay(Math.max(0, at - state.lastAt), options.returnMs);
  const offset = { x: state.offset.x * factor, y: state.offset.y * factor };
  const near = Math.abs(offset.x) < 0.05 && Math.abs(offset.y) < 0.05;
  const resting = near ? { x: 0, y: 0 } : offset;
  return {
    dot: motionDot(resting, options),
    offset: resting,
    trail,
    lastAt: at,
  };
};

/** 더 그릴 것이 없으면 true - 그리기 루프를 멈춘다 */
export const isCursorTrackerSettled = (
  state: CursorTrackerState,
  options: CursorTrackerOptions,
) =>
  state.trail.length === 0 &&
  (options.mode !== 'motion' || (state.offset.x === 0 && state.offset.y === 0));

/** 모니터 목록에서 고른 모니터 - 없으면 주 모니터로 대체 */
export const resolveMonitor = <
  M extends MonitorRect & { id: string; primary: boolean },
>(
  monitors: readonly M[],
  id: string | null,
): M | null =>
  monitors.find((monitor) => monitor.id === id) ??
  monitors.find((monitor) => monitor.primary) ??
  monitors[0] ??
  null;
