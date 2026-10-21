import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAxisSignal } from '@stores/signals/axisSignals';
import { axisEventBus, type AxisPayload } from './axisEventBus';

const mocks = vi.hoisted(() => ({
  handler: null as null | ((event: { payload: AxisPayload }) => void),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(
    async (
      _event: string,
      handler: (event: { payload: AxisPayload }) => void,
    ) => {
      mocks.handler = handler;
      return () => {};
    },
  ),
}));

const FULL = 2880;

const emit = (axisId: string, value: number) => {
  mocks.handler?.({ payload: { axisId, value, full: FULL } });
};

describe('axisEventBus 기준값', () => {
  beforeEach(async () => {
    await axisEventBus.initialize();
    axisEventBus.resetBaselines();
  });

  it('첫 값은 기준으로만 쓰고 이후 wrap 최단경로 델타를 누적한다', () => {
    const axis = getAxisSignal('WHEEL:TEST-A');
    const start = axis.value;

    emit('WHEEL:TEST-A', 0);
    expect(axis.value).toBe(start);
    emit('WHEEL:TEST-A', 120);
    emit('WHEEL:TEST-A', FULL - 120);
    expect(axis.value - start).toBeCloseTo(-120 / FULL);
  });

  it('기준값 폐기 뒤 첫 값은 이전 값과 이어 계산하지 않는다', () => {
    const axis = getAxisSignal('WHEEL:TEST-B');
    emit('WHEEL:TEST-B', 1200);
    const before = axis.value;

    // 데몬 재시작으로 0부터 다시 시작한 축
    axisEventBus.resetBaselines();
    emit('WHEEL:TEST-B', 0);
    expect(axis.value).toBe(before);
    emit('WHEEL:TEST-B', 120);
    expect(axis.value - before).toBeCloseTo(120 / FULL);
  });
});
