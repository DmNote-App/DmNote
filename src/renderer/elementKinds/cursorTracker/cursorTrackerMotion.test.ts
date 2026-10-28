import { describe, expect, it } from 'vitest';

import {
  advanceCursorTracker,
  applyPointerSample,
  initialCursorTrackerState,
  isCursorTrackerSettled,
  resolveMonitor,
  type CursorTrackerOptions,
} from './cursorTrackerMotion';

const motion: CursorTrackerOptions = {
  mode: 'motion',
  width: 100,
  height: 60,
  sensitivity: 2,
  returnMs: 100,
  trailMs: 200,
  monitor: null,
};

const position: CursorTrackerOptions = {
  ...motion,
  mode: 'position',
  monitor: { x: 0, y: 0, width: 1000, height: 600 },
};

describe('커서 트래커 이동량 모드', () => {
  it('이동량 × 감도만큼 밀리고 경계에서 잘라낸다', () => {
    let state = initialCursorTrackerState(100, 60);
    state = applyPointerSample(state, { dx: 5, dy: -2 }, motion, 0);
    expect(state.dot).toEqual({ x: 60, y: 26 });
    state = applyPointerSample(state, { dx: 100, dy: 100 }, motion, 0);
    expect(state.dot).toEqual({ x: 100, y: 60 });
  });

  it('시간이 지나면 중앙으로 돌아오고 궤적이 사라지면 멈춘다', () => {
    let state = applyPointerSample(
      initialCursorTrackerState(100, 60),
      { dx: 10, dy: 0 },
      motion,
      0,
    );
    state = advanceCursorTracker(state, motion, 100);
    expect(state.offset.x).toBeCloseTo(20 * Math.exp(-3), 5);
    expect(isCursorTrackerSettled(state, motion)).toBe(false);
    state = advanceCursorTracker(state, motion, 1000);
    expect(state.dot).toEqual({ x: 50, y: 30 });
    expect(state.trail).toEqual([]);
    expect(isCursorTrackerSettled(state, motion)).toBe(true);
  });
});

describe('커서 트래커 화면 위치 모드', () => {
  it('모니터 영역을 패드에 대응한다', () => {
    const state = applyPointerSample(
      initialCursorTrackerState(100, 60),
      { dx: 0, dy: 0, x: 500, y: 150 },
      position,
      0,
    );
    expect(state.dot).toEqual({ x: 50, y: 15 });
  });

  it('영역 밖이면 점을 숨기고 돌아오면 궤적을 끊어 잇는다', () => {
    let state = initialCursorTrackerState(100, 60);
    state = applyPointerSample(
      state,
      { dx: 0, dy: 0, x: 100, y: 100 },
      position,
      0,
    );
    state = applyPointerSample(
      state,
      { dx: 0, dy: 0, x: -10, y: 100 },
      position,
      10,
    );
    expect(state.dot).toBeNull();
    state = applyPointerSample(
      state,
      { dx: 0, dy: 0, x: 900, y: 100 },
      position,
      20,
    );
    expect(state.trail.at(-1)?.broken).toBe(true);
    expect(state.trail[0]?.broken).toBeUndefined();
  });

  it('저장한 모니터가 없으면 주 모니터로 대체한다', () => {
    const monitors = [
      { id: 'a', primary: false, x: 0, y: 0, width: 1, height: 1 },
      { id: 'b', primary: true, x: 1, y: 0, width: 1, height: 1 },
    ];
    expect(resolveMonitor(monitors, 'a')?.id).toBe('a');
    expect(resolveMonitor(monitors, 'gone')?.id).toBe('b');
    expect(resolveMonitor(monitors, null)?.id).toBe('b');
  });
});
