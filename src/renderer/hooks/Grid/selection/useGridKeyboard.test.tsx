import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGraphItemStore } from '@stores/data/useGraphItemStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useKnobItemStore } from '@stores/data/useKnobItemStore';
import { useStatItemStore } from '@stores/data/useStatItemStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import type { SelectedElement } from '@stores/grid/useGridSelectionStore';

import { useGridKeyboard } from './useGridKeyboard';
import { useGridSelection } from './useGridSelection';
import { registerPopupLayer } from '@components/main/Modal/popupLayer';

import type { CanonicalKeyPosition } from '@src/types/editor';
import { flushFocusedEditor } from '@src/renderer/editor/runtime/lifecycle/lifecycleEditorFlush';
import { trackEditorWrite } from '@src/renderer/editor/runtime/lifecycle/editorWriteBarrier';
import {
  acquireHistoryEditorFlushLock,
  resetHistoryEditorFlushLock,
} from '@src/renderer/editor/runtime/lifecycle/historyEditorFlushLock';

const {
  commitPatchMock,
  rotateSessionMock,
  sendBridgeMessageMock,
  recordedGenerates,
} = vi.hoisted(() => ({
  commitPatchMock: vi.fn().mockResolvedValue(undefined),
  rotateSessionMock: vi.fn(),
  sendBridgeMessageMock: vi.fn(),
  recordedGenerates: [] as Array<(base: unknown) => unknown>,
}));

vi.mock(
  '@src/renderer/editor/runtime/coordinator/editorStateCoordinator',
  () => ({
    editorCoordinator: {
      commitPatch: commitPatchMock,
      getState: () => ({ lastAck: null }),
    },
  }),
);

vi.mock('@src/renderer/editor/runtime/operations/editorSemanticOps', () => ({
  // 게스처 버스트 검증 대상은 gestureId 운반 - 동기 recorder로 기록.
  // generate 클로저도 보관해 정산 의도가 어느 요소를 실었는지 검증 가능
  commitGeneratedSemanticOps: vi.fn(
    (
      generate: (base: unknown) => unknown,
      meta?: { gestureId?: string; onEnrolled?: () => void },
    ) => {
      meta?.onEnrolled?.();
      recordedGenerates.push(generate);
      commitPatchMock({ schemaVersion: 1 }, { gestureId: meta?.gestureId });
      return Promise.resolve({ document: null, opResults: [] });
    },
  ),
}));

vi.mock('@src/renderer/editor/runtime/intent/mixedElementIntent', () => ({
  // 옛 선택(플러그인 요소) 정산 - 동작 id 운반을 같은 recorder로 기록
  runMixedElementOpsIntent: vi.fn((options: { gestureId: string }) => {
    commitPatchMock({ schemaVersion: 1 }, { gestureId: options.gestureId });
    return Promise.resolve();
  }),
}));

vi.mock('@utils/plugin/bridgeMessages', () => ({
  sendBridgeMessageBestEffort: sendBridgeMessageMock,
}));

vi.mock('@plugins/runtime/displayElement/instancesCommitQueue', () => ({
  rotatePluginInstancesEditSession: rotateSessionMock,
  // 혼합 이동의 사전 staging이 실제 gestureTransaction을 타는 경로용 무상태 stub
  getStagedPluginInstancesGestureId: () => undefined,
  stagePluginInstancesGesture: vi.fn(),
  unstagePluginInstancesGesture: vi.fn(),
}));

vi.mock('@utils/core/platform', () => ({ isMac: () => false }));

const firstGestureId = '00000000-0000-4000-8000-000000000001';
const secondGestureId = '00000000-0000-4000-8000-000000000002';

const STABLE_IDS = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
];

const position = (index = 0): CanonicalKeyPosition =>
  ({
    id: STABLE_IDS[index],
    dx: 0,
    dy: 0,
    width: 40,
    height: 40,
  } as CanonicalKeyPosition);

interface HarnessProps {
  selectedIndex?: number;
  continuousInputStrategy?: 'sync' | 'frame';
}

const PLUGIN_IDS = ['plugin-a::p0', 'plugin-a::p1'];

const pluginAt = (index: number) =>
  ({
    id: `p${index}`,
    fullId: PLUGIN_IDS[index],
    pluginId: 'plugin-a',
    html: '<div />',
    position: { x: 0, y: 0 },
    tabId: '4key',
  } as never);

// 옛 선택은 플러그인 요소만 담는다 (옛 종류는 트리 선택)
const Harness = ({
  selectedIndex = 0,
  continuousInputStrategy = 'sync',
}: HarnessProps) => {
  const selectedElements: SelectedElement[] = [
    { type: 'plugin' as const, id: PLUGIN_IDS[selectedIndex] },
  ];
  // 정산 라우팅은 선택 스토어를 읽는다 - 하네스 선택과 동기화
  useGridSelectionStore.setState({ selectedElements });
  const { moveSelectedElements } = useGridSelection({
    selectedElements,
    selectedKeyType: '4key',
  });

  useGridKeyboard({
    selectedElements,
    moveSelectedElements,
    deleteSelectedElements: vi.fn(),
    clearSelection: vi.fn(),
    copySelectedElements: vi.fn(),
    pasteElements: vi.fn(),
    continuousInputStrategy,
  });

  return null;
};

interface BlockingHarnessProps {
  move: () => void;
  remove: () => void;
  clear: () => void;
  copy: () => void;
  paste: () => void;
  continuousInputStrategy?: 'sync' | 'frame';
}

const BlockingHarness = ({
  move,
  remove,
  clear,
  copy,
  paste,
  continuousInputStrategy = 'sync',
}: BlockingHarnessProps) => {
  useGridKeyboard({
    selectedElements: [
      { type: 'key', id: STABLE_IDS[0], index: 0 },
      { type: 'key', id: STABLE_IDS[1], index: 1 },
    ],
    moveSelectedElements: move,
    deleteSelectedElements: remove,
    clearSelection: clear,
    copySelectedElements: copy,
    pasteElements: paste,
    continuousInputStrategy,
  });
  return null;
};

describe('useGridKeyboard arrow history burst', () => {
  let host: HTMLDivElement;
  let root: Root;
  let randomUUIDMock: ReturnType<typeof vi.spyOn>;
  const layerCleanups: Array<() => void> = [];

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    resetHistoryEditorFlushLock();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    commitPatchMock.mockClear();
    rotateSessionMock.mockClear();
    sendBridgeMessageMock.mockClear();
    recordedGenerates.length = 0;
    randomUUIDMock = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(firstGestureId)
      .mockReturnValueOnce(secondGestureId);

    useKeyStore.setState({
      selectedKeyType: '4key',
      canonicalPositions: { '4key': [position(0), position(1)] },
    });
    useStatItemStore.setState({ positions: {} });
    useGraphItemStore.setState({ positions: {} });
    useKnobItemStore.setState({ positions: {} });
    usePluginDisplayElementStore.setState({
      elements: [pluginAt(0), pluginAt(1)],
    });
    useGridSelectionStore.setState({ clipboard: [{} as never] });

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<Harness />);
    });
  });

  afterEach(async () => {
    await act(async () =>
      layerCleanups
        .splice(0)
        .reverse()
        .forEach((cleanup) => cleanup()),
    );
    await act(async () => root.unmount());
    useGridSelectionStore.setState({ clipboard: [] });
    host.remove();
    document
      .querySelectorAll('[data-dmn-modal-backdrop="true"]')
      .forEach((element) => element.remove());
    randomUUIDMock.mockRestore();
    resetHistoryEditorFlushLock();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  const pressArrow = (key: string) => {
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  };

  const pluginPosition = (index: number) =>
    usePluginDisplayElementStore
      .getState()
      .elements.find((element) => element.fullId === PLUGIN_IDS[index])!
      .position;

  const committedGestureIds = () =>
    commitPatchMock.mock.calls.map((call) => call[1]?.gestureId);

  it('500ms 안의 연속 이동을 같은 history gesture로 묶는다', () => {
    pressArrow('ArrowRight');
    vi.advanceTimersByTime(500);
    pressArrow('ArrowRight');

    expect(committedGestureIds()).toEqual([firstGestureId, firstGestureId]);
    expect(randomUUIDMock).toHaveBeenCalledOnce();
  });

  it('500ms를 넘긴 이동은 새 history gesture로 분리한다', () => {
    pressArrow('ArrowRight');
    vi.advanceTimersByTime(501);
    pressArrow('ArrowRight');

    expect(committedGestureIds()).toEqual([firstGestureId, secondGestureId]);
    expect(randomUUIDMock).toHaveBeenCalledTimes(2);
  });

  it('방향이 섞여도 500ms burst 안에서는 같은 gesture를 사용한다', () => {
    pressArrow('ArrowLeft');
    vi.advanceTimersByTime(100);
    pressArrow('ArrowUp');
    vi.advanceTimersByTime(100);
    pressArrow('ArrowDown');

    expect(committedGestureIds()).toEqual([
      firstGestureId,
      firstGestureId,
      firstGestureId,
    ]);
    expect(randomUUIDMock).toHaveBeenCalledOnce();
  });

  it('500ms 안이어도 선택 대상이 바뀌면 새 history gesture를 사용한다', async () => {
    pressArrow('ArrowRight');
    vi.advanceTimersByTime(100);
    await act(async () => {
      root.render(<Harness selectedIndex={1} />);
    });
    pressArrow('ArrowRight');

    expect(committedGestureIds()).toEqual([firstGestureId, secondGestureId]);
    expect(randomUUIDMock).toHaveBeenCalledTimes(2);
  });

  it('플러그인 방향키 이동은 플러그인 세션에 같은 gesture를 전달한다', () => {
    pressArrow('ArrowRight');

    expect(committedGestureIds()).toEqual([firstGestureId]);
    expect(rotateSessionMock).toHaveBeenCalledWith('plugin-a', firstGestureId);
  });

  it('같은 프레임의 방향키 burst를 누적해 한 번만 이동한다', async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      callbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
    await act(async () => {
      root.render(<Harness continuousInputStrategy="frame" />);
    });

    pressArrow('ArrowRight');
    pressArrow('ArrowRight');
    pressArrow('ArrowDown');
    expect(commitPatchMock).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);

    act(() => {
      const callback = [...callbacks.values()][0];
      callbacks.clear();
      callback(performance.now());
    });
    expect(commitPatchMock).toHaveBeenCalledOnce();
    expect(pluginPosition(0)).toEqual({ x: 2, y: 1 });
    vi.unstubAllGlobals();
  });

  it('pending 중 선택이 바뀌어도 flush는 옛 대상 이동을 wire에 커밋한다', async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      callbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
    await act(async () => {
      root.render(<Harness continuousInputStrategy="frame" />);
    });

    pressArrow('ArrowRight');
    expect(commitPatchMock).not.toHaveBeenCalled();

    // flush 전에 선택이 A → B로 넘어간다 - cleanup flush가 옛 클로저로 실행
    await act(async () => {
      root.render(
        <Harness continuousInputStrategy="frame" selectedIndex={1} />,
      );
    });

    expect(commitPatchMock).toHaveBeenCalledOnce();
    expect(committedGestureIds()).toEqual([firstGestureId]);
    // 정산은 이동을 적용한 옛 대상(A) - 현재 선택(B)은 움직이지 않는다
    expect(pluginPosition(0)).toEqual({ x: 1, y: 0 });
    expect(pluginPosition(1)).toEqual({ x: 0, y: 0 });
    vi.unstubAllGlobals();
  });

  it.each(['종료 후 언마운트', '히스토리 후 늦은 프레임'] as const)(
    '%s 전에 멈춘 화살표 예약을 한 번 정산한다',
    async (boundary) => {
      const callbacks = new Map<number, FrameRequestCallback>();
      vi.stubGlobal(
        'requestAnimationFrame',
        (callback: FrameRequestCallback) => {
          callbacks.set(1, callback);
          return 1;
        },
      );
      vi.stubGlobal('cancelAnimationFrame', (id: number) =>
        callbacks.delete(id),
      );
      await act(async () =>
        root.render(<Harness continuousInputStrategy="frame" />),
      );
      pressArrow('ArrowRight');
      pressArrow('ArrowRight');
      expect(commitPatchMock).not.toHaveBeenCalled();
      const delayedCallbacks = [...callbacks.values()];
      if (boundary === '히스토리 후 늦은 프레임') {
        acquireHistoryEditorFlushLock('arrow-history');
      }
      let settlement!: Promise<boolean>;
      await act(async () => {
        settlement = flushFocusedEditor();
        await vi.advanceTimersByTimeAsync(0);
        expect(await settlement).toBe(true);
      });
      const commitsAtAck = commitPatchMock.mock.calls.length;
      const framesAtAck = callbacks.size;
      const positionAtAck = pluginPosition(0).x;
      if (boundary === '히스토리 후 늦은 프레임') {
        act(() => {
          usePluginDisplayElementStore
            .getState()
            .updateElement(PLUGIN_IDS[0], { position: { x: 40, y: 0 } });
          delayedCallbacks.forEach((callback) => callback(performance.now()));
        });
      } else {
        await act(async () => root.render(null));
      }
      expect({
        commitsAtAck,
        framesAtAck,
        positionAtAck,
        commitsAfterBoundary: commitPatchMock.mock.calls.length,
        positionAfterBoundary: pluginPosition(0).x,
      }).toEqual({
        commitsAtAck: 1,
        framesAtAck: 0,
        positionAtAck: 2,
        commitsAfterBoundary: 1,
        positionAfterBoundary: boundary === '히스토리 후 늦은 프레임' ? 40 : 2,
      });
    },
  );

  it('화살표 정산이 시작한 저장 응답을 기다리고 실패하면 정산을 거절한다', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    let reject!: (error: Error) => void;
    const write = new Promise<void>((_resolve, no) => {
      reject = no;
    });
    const move = vi.fn(() => {
      void trackEditorWrite(write).catch(() => {});
    });
    const handlers = {
      remove: vi.fn(),
      clear: vi.fn(),
      copy: vi.fn(),
      paste: vi.fn(),
    };
    await act(async () =>
      root.render(
        <BlockingHarness
          {...handlers}
          move={move}
          continuousInputStrategy="frame"
        />,
      ),
    );
    pressArrow('ArrowRight');
    let settled = false;
    let result!: Promise<boolean>;
    await act(async () => {
      result = flushFocusedEditor().then((value) => {
        settled = true;
        return value;
      });
      await vi.advanceTimersByTimeAsync(0);
    });
    const commitsBeforeResponse = move.mock.calls.length;
    const settledBeforeResponse = settled;
    await act(async () => {
      reject(new Error('arrow save failed'));
      await result;
    });
    expect(commitsBeforeResponse).toBe(1);
    expect(settledBeforeResponse).toBe(false);
    expect(await result).toBe(false);
  });

  it('모드 변경 cleanup은 이전 모드 콜백으로 정산하고 새 모드에 중복 전달하지 않는다', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const oldModeMove = vi.fn();
    const newModeMove = vi.fn();
    const handlers = {
      remove: vi.fn(),
      clear: vi.fn(),
      copy: vi.fn(),
      paste: vi.fn(),
    };
    await act(async () =>
      root.render(
        <BlockingHarness
          {...handlers}
          move={oldModeMove}
          continuousInputStrategy="frame"
        />,
      ),
    );
    pressArrow('ArrowRight');
    await act(async () => {
      useKeyStore.setState({ selectedKeyType: '8key' });
      root.render(
        <BlockingHarness
          {...handlers}
          move={newModeMove}
          continuousInputStrategy="frame"
        />,
      );
    });
    await act(async () => {
      const result = flushFocusedEditor();
      await vi.advanceTimersByTimeAsync(0);
      expect(await result).toBe(true);
    });
    act(() =>
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' })),
    );
    expect(oldModeMove).toHaveBeenCalledExactlyOnceWith(1, 0, firstGestureId);
    expect(newModeMove).not.toHaveBeenCalled();
    expect(useKeyStore.getState().selectedKeyType).toBe('8key');
  });

  it('방향키를 떼면 대기 이동을 프레임 전에 flush한다', async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.set(1, callback);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
    await act(async () => {
      root.render(<Harness continuousInputStrategy="frame" />);
    });

    pressArrow('ArrowLeft');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft' }));
    });
    expect(commitPatchMock).toHaveBeenCalledOnce();
    expect(callbacks).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('포커스된 위젯이 소비한 방향키로 선택 요소를 움직이지 않는다', () => {
    const widget = document.createElement('button');
    widget.addEventListener('keydown', (event) => event.preventDefault());
    document.body.appendChild(widget);

    act(() => {
      widget.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(commitPatchMock).not.toHaveBeenCalled();
    widget.remove();
  });

  it('활성 모달 동안 모든 배경 편집 키를 차단하고 종료 후 복원한다', async () => {
    const handlers = {
      move: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      copy: vi.fn(),
      paste: vi.fn(),
    };
    await act(async () => root.render(<BlockingHarness {...handlers} />));

    const modal = document.createElement('div');
    modal.dataset.dmnModalBackdrop = 'true';
    document.body.appendChild(modal);
    let unregister = () => {};
    await act(async () => {
      unregister = registerPopupLayer(modal);
      layerCleanups.push(unregister);
    });

    const press = (init: KeyboardEventInit) =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      );
    press({ key: 'g', code: 'KeyG', ctrlKey: true });
    press({ key: 'g', code: 'KeyG', ctrlKey: true, shiftKey: true });
    press({ key: 'c', code: 'KeyC', ctrlKey: true });
    press({ key: 'v', code: 'KeyV', ctrlKey: true });
    press({ key: 'ArrowRight', code: 'ArrowRight' });
    press({ key: 'Backspace', code: 'Backspace' });
    press({ key: 'Escape', code: 'Escape' });
    press({ key: ']', code: 'BracketRight' });
    press({ key: '[', code: 'BracketLeft' });

    Object.values(handlers).forEach((handler) =>
      expect(handler).not.toHaveBeenCalled(),
    );

    await act(async () => unregister());
    press({ key: 'Backspace', code: 'Backspace' });
    expect(handlers.remove).toHaveBeenCalledOnce();
  });

  it('모달 직전에 예약된 방향키 프레임도 폐기한다', async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.set(1, callback);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
    const move = vi.fn();
    await act(async () =>
      root.render(
        <BlockingHarness
          move={move}
          remove={vi.fn()}
          clear={vi.fn()}
          copy={vi.fn()}
          paste={vi.fn()}
          continuousInputStrategy="frame"
        />,
      ),
    );

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(callbacks).toHaveLength(1);

    const modal = document.createElement('div');
    modal.dataset.dmnModalBackdrop = 'true';
    document.body.appendChild(modal);
    await act(async () => {
      layerCleanups.push(registerPopupLayer(modal));
    });
    act(() => {
      const callback = [...callbacks.values()][0];
      callbacks.clear();
      callback(performance.now());
    });

    expect(move).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

const AfterKeyHarness = ({
  remove,
  after,
}: {
  remove: () => void;
  after: (event: KeyboardEvent) => void;
}) => {
  useGridKeyboard({
    selectedElements: [
      { type: 'key', id: STABLE_IDS[0], index: 0 },
      { type: 'key', id: STABLE_IDS[1], index: 1 },
    ],
    moveSelectedElements: vi.fn(),
    deleteSelectedElements: remove,
    clearSelection: vi.fn(),
    copySelectedElements: vi.fn(),
    pasteElements: vi.fn(),
    continuousInputStrategy: 'sync',
    afterKeyDown: after,
  });
  return null;
};

describe('useGridKeyboard 함께 고른 다른 선택', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  const press = (init: KeyboardEventInit) =>
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      );
    });

  it('옛 종류 처리가 끝난 뒤 같은 이벤트로 다른 선택 처리기를 부른다', () => {
    const order: string[] = [];
    const remove = vi.fn(() => order.push('legacy'));
    const after = vi.fn((event: KeyboardEvent) => {
      order.push(event.defaultPrevented ? 'after:handled' : 'after');
    });
    act(() => root.render(<AfterKeyHarness remove={remove} after={after} />));
    press({ key: 'Delete' });
    expect(order).toEqual(['legacy', 'after:handled']);
    // 옛 종류가 처리하지 않는 키도 넘긴다
    press({ key: 'x' });
    expect(after).toHaveBeenCalledTimes(2);
  });
});
