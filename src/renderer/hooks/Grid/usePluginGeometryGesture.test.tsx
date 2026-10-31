/**
 * 플러그인 요소 기하 입력(X/Y/W/H) 게스처 계약 테스트
 * - preview는 스토어만 바꾼다(자동 저장 없이 - 트리에 있는 요소)
 * - commit은 마지막 값을 반영하고 같은 동작 id의 트리 틀 커밋을 한 번 보낸다
 * - cancel은 스냅샷(measuredSize 부재 포함)을 복원하고 멱등이다
 */

import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';

import {
  createPluginGeometryGestureController,
  usePluginGeometryGesture,
  type PluginGeometryTarget,
} from './usePluginGeometryGesture';

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  commitFrames: vi.fn((_scene: string, _ids: string[], _gestureId?: string) =>
    Promise.resolve(),
  ),
}));

vi.mock('@plugins/runtime/displayElement/pluginTreeGeometry', () => ({
  applyPluginElementEdit: (
    _scene: string,
    ids: ReadonlySet<string>,
    change: (ids: ReadonlySet<string>) => void,
  ) => change(ids),
  commitPluginFrames: (scene: string, ids: string[], gestureId?: string) => {
    mocks.order.push('commit');
    return mocks.commitFrames(scene, ids, gestureId);
  },
}));

vi.mock('@utils/plugin/bridgeMessages', () => ({
  sendBridgeMessageBestEffort: vi.fn(),
}));

const PLUGIN_ID = 'plugin-a';
const FULL_ID = 'plugin-a:element';
const OTHER_FULL_ID = 'plugin-a:other';

const pluginElement = (
  overrides: Partial<PluginDisplayElementInternal> = {},
): PluginDisplayElementInternal => ({
  id: 'element',
  fullId: FULL_ID,
  pluginId: PLUGIN_ID,
  definitionId: PLUGIN_ID,
  html: '<div />',
  position: { x: 30, y: 40 },
  estimatedSize: { width: 200, height: 150 },
  tabId: '4key',
  ...overrides,
});

const target: PluginGeometryTarget = { fullId: FULL_ID, pluginId: PLUGIN_ID };

const findElement = (fullId: string) =>
  usePluginDisplayElementStore
    .getState()
    .elements.find((element) => element.fullId === fullId);

describe('createPluginGeometryGestureController', () => {
  let unsubscribeStore: () => void;

  beforeEach(() => {
    mocks.order.length = 0;
    mocks.commitFrames.mockClear();
    useKeyStore.setState({ selectedKeyType: '4key' });
    usePluginDisplayElementStore.setState({ elements: [pluginElement()] });
    useGridSelectionStore
      .getState()
      .setSelectedElements([{ type: 'plugin', id: FULL_ID }]);
    unsubscribeStore = usePluginDisplayElementStore.subscribe(() => {
      mocks.order.push('update');
    });
  });

  afterEach(() => {
    unsubscribeStore();
  });

  it('preview는 스토어만 갱신하고 저장하지 않는다', () => {
    const gesture = createPluginGeometryGestureController();

    gesture.preview(target, 'x', 35);
    gesture.preview(target, 'x', 41);

    expect(mocks.order).toEqual(['update', 'update']);
    expect(findElement(FULL_ID)?.position).toEqual({ x: 41, y: 40 });
  });

  it('commit은 마지막 값을 반영한 뒤 같은 동작 id로 트리 틀 커밋을 한 번 보낸다', () => {
    const gesture = createPluginGeometryGestureController();

    gesture.preview(target, 'y', 45);
    gesture.commit(target, 'y', 50);

    expect(mocks.order).toEqual(['update', 'update', 'commit']);
    const [scene, ids, gestureId] = mocks.commitFrames.mock.calls[0];
    expect(scene).toBe('4key');
    expect(ids).toEqual([FULL_ID]);
    expect(typeof gestureId).toBe('string');
    expect(findElement(FULL_ID)?.position).toEqual({ x: 30, y: 50 });

    // 다음 입력은 새 동작
    gesture.commit(target, 'y', 60);
    expect(mocks.commitFrames.mock.calls[1][2]).not.toBe(gestureId);
  });

  it('preview 없이 온 commit도 저장을 한 번 보낸다', () => {
    const gesture = createPluginGeometryGestureController();

    gesture.commit(target, 'width', 120);

    expect(mocks.order).toEqual(['update', 'commit']);
    expect(findElement(FULL_ID)?.measuredSize).toEqual({
      width: 120,
      height: 150,
    });
  });

  it('cancel은 measuredSize 부재까지 스냅샷으로 복원하고 저장하지 않는다', () => {
    const gesture = createPluginGeometryGestureController();

    gesture.preview(target, 'width', 120);
    gesture.preview(target, 'x', 99);
    mocks.order.length = 0;

    gesture.cancel();

    expect(mocks.order).toEqual(['update']);
    const restored = findElement(FULL_ID);
    expect(restored?.position).toEqual({ x: 30, y: 40 });
    expect(restored?.measuredSize).toBeUndefined();
  });

  it('cancel은 멱등이다 - 세션이 없으면 아무것도 건드리지 않는다', () => {
    const gesture = createPluginGeometryGestureController();

    gesture.cancel();
    gesture.preview(target, 'height', 80);
    gesture.cancel();
    mocks.order.length = 0;

    gesture.cancel();

    expect(mocks.order).toEqual([]);
    expect(mocks.commitFrames).not.toHaveBeenCalled();
  });

  it('선택에서 빠진 요소의 지각 preview는 세션을 열지 않는다', () => {
    const gesture = createPluginGeometryGestureController();
    useGridSelectionStore.getState().setSelectedElements([]);

    gesture.preview(target, 'x', 77);

    expect(mocks.order).toEqual([]);
    expect(findElement(FULL_ID)?.position).toEqual({ x: 30, y: 40 });
  });

  it('다른 요소로 preview가 오면 이전 세션을 취소 복원한 뒤 새로 연다', () => {
    const gesture = createPluginGeometryGestureController();
    usePluginDisplayElementStore.setState({
      elements: [
        pluginElement(),
        pluginElement({
          id: 'other',
          fullId: OTHER_FULL_ID,
          position: { x: 5, y: 6 },
        }),
      ],
    });
    useGridSelectionStore.getState().setSelectedElements([
      { type: 'plugin', id: FULL_ID },
      { type: 'plugin', id: OTHER_FULL_ID },
    ]);
    gesture.preview(target, 'x', 99);
    mocks.order.length = 0;

    gesture.preview({ fullId: OTHER_FULL_ID, pluginId: PLUGIN_ID }, 'x', 15);

    expect(mocks.order).toEqual(['update', 'update']);
    expect(findElement(FULL_ID)?.position).toEqual({ x: 30, y: 40 });
    expect(findElement(OTHER_FULL_ID)?.position).toEqual({ x: 15, y: 6 });
  });
});

describe('usePluginGeometryGesture', () => {
  let host: HTMLDivElement;
  let root: Root;

  interface HarnessProps {
    target: PluginGeometryTarget | null;
    expose: (api: ReturnType<typeof usePluginGeometryGesture>) => void;
  }

  const Harness = ({ target, expose }: HarnessProps) => {
    const api = usePluginGeometryGesture(target);
    useEffect(() => expose(api));
    return null;
  };

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    mocks.order.length = 0;
    mocks.commitFrames.mockClear();
    useKeyStore.setState({ selectedKeyType: '4key' });
    usePluginDisplayElementStore.setState({
      elements: [
        pluginElement(),
        pluginElement({
          id: 'other',
          fullId: OTHER_FULL_ID,
          position: { x: 5, y: 6 },
        }),
      ],
    });
    useGridSelectionStore
      .getState()
      .setSelectedElements([{ type: 'plugin', id: FULL_ID }]);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('대상이 바뀌면 열려 있던 세션을 취소 복원한다', () => {
    let api: ReturnType<typeof usePluginGeometryGesture> | null = null;
    const expose = (next: typeof api) => {
      api = next;
    };
    act(() => {
      root.render(<Harness target={target} expose={expose} />);
    });
    act(() => {
      api?.preview('x', 88);
    });
    expect(findElement(FULL_ID)?.position.x).toBe(88);

    act(() => {
      root.render(
        <Harness
          target={{ fullId: OTHER_FULL_ID, pluginId: PLUGIN_ID }}
          expose={expose}
        />,
      );
    });

    expect(findElement(FULL_ID)?.position).toEqual({ x: 30, y: 40 });
    expect(mocks.commitFrames).not.toHaveBeenCalled();
  });

  it('언마운트되면 열려 있던 세션을 취소 복원한다', () => {
    let api: ReturnType<typeof usePluginGeometryGesture> | null = null;
    const expose = (next: typeof api) => {
      api = next;
    };
    act(() => {
      root.render(<Harness target={target} expose={expose} />);
    });
    act(() => {
      api?.preview('width', 300);
    });
    expect(findElement(FULL_ID)?.measuredSize?.width).toBe(300);

    act(() => root.unmount());
    root = createRoot(host);

    expect(findElement(FULL_ID)?.measuredSize).toBeUndefined();
    expect(mocks.commitFrames).not.toHaveBeenCalled();
  });

  it('대상이 없으면 preview·commit은 무시된다', () => {
    let api: ReturnType<typeof usePluginGeometryGesture> | null = null;
    const expose = (next: typeof api) => {
      api = next;
    };
    act(() => {
      root.render(<Harness target={null} expose={expose} />);
    });
    act(() => {
      api?.preview('x', 1);
      api?.commit('x', 2);
    });

    expect(mocks.commitFrames).not.toHaveBeenCalled();
    expect(findElement(FULL_ID)?.position).toEqual({ x: 30, y: 40 });
  });
});
