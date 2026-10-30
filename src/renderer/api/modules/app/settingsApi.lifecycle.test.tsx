// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Checkbox from '@components/main/common/checkbox/Checkbox';
import { flushFocusedEditor } from '@src/renderer/editor/runtime/lifecycle/lifecycleEditorFlush';
import { settingsApi } from './settingsApi';
import { acknowledgeLifecycleAfterEditorFlush } from './appApi';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('설정 저장과 lifecycle 응답', () => {
  let root: Root;
  let iframe: HTMLIFrameElement;
  let host: HTMLDivElement;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    mocks.invoke.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    iframe = document.createElement('iframe');
    document.body.append(iframe);
    const child = iframe.contentWindow!;
    child.requestAnimationFrame = () => 1;
    child.cancelAnimationFrame = () => {};
    host = child.document.createElement('div');
    child.document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    iframe.remove();
    vi.restoreAllMocks();
  });

  const arrangeWrite = () => {
    const write = deferred<unknown>();
    mocks.invoke.mockImplementation((command) =>
      command === 'settings_update' ? write.promise : Promise.resolve(),
    );
    return write;
  };

  it.each(['success', 'failure'] as const)(
    '프레임이 멈춘 토글의 저장 %s를 정산한 뒤에만 ack를 결정한다',
    async (outcome) => {
      const write = arrangeWrite();
      act(() =>
        root.render(
          <Checkbox
            checked={false}
            commitStrategy="after-paint"
            onChange={() => {
              void settingsApi.update({ noteEffect: true }).catch(() => {});
            }}
          />,
        ),
      );
      act(() => host.querySelector<HTMLElement>('[role="switch"]')!.click());
      expect(mocks.invoke).not.toHaveBeenCalled();
      let completed = false;
      let settlement!: Promise<boolean>;
      await act(async () => {
        settlement = (async () => {
          const committed = await flushFocusedEditor();
          if (committed)
            await acknowledgeLifecycleAfterEditorFlush('close-test');
          completed = true;
          return committed;
        })();
        await nextTurn();
        await nextTurn();
      });
      expect(mocks.invoke).toHaveBeenCalledWith('settings_update', {
        patch: { noteEffect: true },
      });
      const completedBeforeWrite = completed;
      await act(async () => {
        if (outcome === 'success') write.resolve({ noteEffect: true });
        else write.reject(new Error('settings rejected'));
        await settlement;
      });
      expect(completedBeforeWrite).toBe(false);
      await expect(settlement).resolves.toBe(outcome === 'success');
      expect(
        mocks.invoke.mock.calls.filter(
          ([command]) => command === 'app_quit_after_editor_flush',
        ),
      ).toHaveLength(outcome === 'success' ? 1 : 0);
    },
  );

  it('정산 직전 시작한 설정 저장의 빠른 실패를 놓치지 않는다', async () => {
    const write = arrangeWrite();
    const saving = settingsApi.update({ noteEffect: true }).catch(() => {});
    const settlement = flushFocusedEditor();
    write.reject(new Error('already pending settings failed'));

    await saving;
    await expect(settlement).resolves.toBe(false);
  });

  it('ack 진입 전에 시작된 저장도 추적한다', async () => {
    const write = arrangeWrite();
    const saving = settingsApi.update({ noteEffect: true }).catch(() => {});
    const ack = acknowledgeLifecycleAfterEditorFlush('already-saving');
    const acknowledged = ack.then(
      () => true,
      () => false,
    );
    write.reject(new Error('in-flight settings failed'));

    await saving;
    await expect(acknowledged).resolves.toBe(false);
    expect(
      mocks.invoke.mock.calls.filter(
        ([command]) => command === 'app_quit_after_editor_flush',
      ),
    ).toHaveLength(0);
  });
});
