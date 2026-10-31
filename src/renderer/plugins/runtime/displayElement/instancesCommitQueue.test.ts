import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearPluginInstancesEditSessions,
  registerPluginInstancesEditSessionFlush,
  rotatePluginInstancesEditSession,
  touchPluginInstancesEditSession,
} from './instancesCommitQueue';

describe('plugin instances edit session', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    clearPluginInstancesEditSessions();
    vi.useRealTimers();
  });

  it('같은 플러그인의 연속 저장은 창 경계에서도 한 편집 세션을 사용한다', async () => {
    vi.useFakeTimers();

    const first = touchPluginInstancesEditSession('plugin-a');
    expect(touchPluginInstancesEditSession('plugin-a')).toBe(first);
    expect(touchPluginInstancesEditSession('plugin-b')).not.toBe(first);

    await vi.advanceTimersByTimeAsync(1199);
    expect(touchPluginInstancesEditSession('plugin-a')).toBe(first);

    await vi.advanceTimersByTimeAsync(1201);
    expect(touchPluginInstancesEditSession('plugin-a')).not.toBe(first);
  });

  it('추가, 삭제, 붙여넣기 경계는 직전 세션과 각각 분리된다', () => {
    const previous = touchPluginInstancesEditSession('plugin-discrete');
    const addGesture = rotatePluginInstancesEditSession('plugin-discrete');
    const deleteGesture = rotatePluginInstancesEditSession('plugin-discrete');
    const pasteGesture = rotatePluginInstancesEditSession('plugin-discrete');

    expect(
      new Set([previous, addGesture, deleteGesture, pasteGesture]).size,
    ).toBe(4);
  });

  it('경계에서 등록된 입구로 밀린 쓰기를 먼저 보낸다', () => {
    const flush = vi.fn();
    cleanups.push(registerPluginInstancesEditSessionFlush('plugin-f', flush));
    touchPluginInstancesEditSession('plugin-f');
    rotatePluginInstancesEditSession('plugin-f');
    expect(flush).toHaveBeenCalledOnce();
  });
});
