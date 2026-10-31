import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPluginInstanceSaveBarrier } from './instanceLifecycle';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('plugin instance save barrier', () => {
  it('복원 중 외부 변경만 완료 직후 1회 저장 대상으로 남긴다', () => {
    const barrier = createPluginInstanceSaveBarrier();

    barrier.runRestoreMutation(() => {
      expect(barrier.shouldSave()).toBe(false);
    });
    expect(barrier.finishRestoration()).toBe(false);

    const barrierWithExternalChange = createPluginInstanceSaveBarrier();
    expect(barrierWithExternalChange.shouldSave()).toBe(false);
    expect(barrierWithExternalChange.finishRestoration()).toBe(true);
    expect(barrierWithExternalChange.finishRestoration()).toBe(false);
    expect(barrierWithExternalChange.shouldSave()).toBe(true);
  });

  it('복원 중 첫 외부 변경에서만 pending 추적을 시작한다', () => {
    const onPendingExternalChange = vi.fn();
    const barrier = createPluginInstanceSaveBarrier(onPendingExternalChange);

    expect(barrier.shouldSave()).toBe(false);
    expect(barrier.shouldSave()).toBe(false);
    barrier.runRestoreMutation(() => {
      expect(barrier.shouldSave()).toBe(false);
    });

    expect(onPendingExternalChange).toHaveBeenCalledOnce();
    expect(barrier.cancelRestoration()).toBe(true);
    expect(barrier.cancelRestoration()).toBe(false);
  });

  it('복원 실패 뒤에는 불완전한 메모리 스냅샷 저장을 계속 차단한다', () => {
    const onPendingExternalChange = vi.fn();
    const barrier = createPluginInstanceSaveBarrier(onPendingExternalChange);

    expect(barrier.shouldSave()).toBe(false);
    barrier.failRestoration();

    expect(barrier.shouldSave()).toBe(false);
    expect(onPendingExternalChange).toHaveBeenCalledOnce();
  });
});
