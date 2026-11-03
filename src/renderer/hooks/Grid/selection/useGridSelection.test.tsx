import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Scene } from '@src/types/generated/elementDocument';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { takePastedKeyIds } from '@stores/grid/pastedKeyIds';
import { PASTE_OFFSET } from '../constants';
import { useGridSelection } from './useGridSelection';

const mocks = vi.hoisted(() => ({
  scene: { nodes: [] } as Scene,
  sendBridgeMessage: vi.fn(),
  rotateSession: vi.fn(),
  flushSession: vi.fn(),
}));

// 옛 선택은 트리에 노드가 없는 런타임 플러그인 요소 - 트리 노드가 있으면 트리 선택이 맡는다
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getScene: () => mocks.scene,
    getElement: () => undefined,
  }),
}));
vi.mock('@plugins/runtime/displayElement/instancesCommitQueue', () => ({
  rotatePluginInstancesEditSession: mocks.rotateSession,
  flushPluginInstancesEditSession: mocks.flushSession,
}));
vi.mock('@utils/plugin/bridgeMessages', () => ({
  sendBridgeMessageBestEffort: mocks.sendBridgeMessage,
}));

const plugin = (
  patch: Partial<PluginDisplayElementInternal> = {},
): PluginDisplayElementInternal => ({
  id: 'element',
  fullId: 'plugin-a::element',
  pluginId: 'plugin-a',
  html: '<div />',
  position: { x: 30, y: 40 },
  tabId: '4key',
  zIndex: 3,
  ...patch,
});

type SelectionApi = ReturnType<typeof useGridSelection>;

const Harness = ({ expose }: { expose: (api: SelectionApi) => void }) => {
  const selectedElements = useDocumentSelectionStore(
    (state) => state.selectedElements,
  );
  const api = useGridSelection({ selectedElements, selectedKeyType: '4key' });
  useEffect(() => {
    expose(api);
  }, [api, expose]);
  return null;
};

describe('옛 선택(플러그인 요소) 동작', () => {
  let host: HTMLDivElement;
  let root: Root;
  let api: SelectionApi;

  const select = (fullIds: string[]) =>
    act(() => {
      useDocumentSelectionStore
        .getState()
        .setSelectedElements(fullIds.map((id) => ({ type: 'plugin', id })));
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scene = { nodes: [] };
    usePluginDisplayElementStore.setState({
      elements: [plugin()],
      definitions: new Map(),
    });
    useDocumentSelectionStore.setState({ selectedElements: [] });
    useGridSelectionStore.setState({ clipboard: [] });
    takePastedKeyIds();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root.render(<Harness expose={(next) => (api = next)} />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('이동은 고른 플러그인 위치만 옮긴다', () => {
    select(['plugin-a::element']);
    act(() => api.moveSelectedElements(5, -5, false));
    expect(
      usePluginDisplayElementStore.getState().elements[0].position,
    ).toEqual({ x: 35, y: 35 });
  });

  it('복사·붙여넣기는 새 id·새 핸들러로 비켜 넣고 사본을 고르며 동작 id를 남긴다', async () => {
    mocks.scene = {
      nodes: [{ type: 'group', id: 'g1', name: 'G', children: [] }],
    } as Scene;
    usePluginDisplayElementStore.setState({
      elements: [plugin({ groupId: 'g1', _onClickId: 'handler-1' } as never)],
    });
    select(['plugin-a::element']);
    act(() => api.copySelectedElements());
    await act(() => api.pasteElements());

    const [original, copy] = usePluginDisplayElementStore.getState().elements;
    expect(copy.fullId).not.toBe(original.fullId);
    expect(copy.fullId).toBe(`plugin-a::${copy.id}`);
    expect(copy.position).toEqual({
      x: 30 + PASTE_OFFSET,
      y: 40 + PASTE_OFFSET,
    });
    expect(copy.zIndex).toBe(3);
    expect(copy.groupId).toBe('g1');
    expect((copy as { _onClickId?: string })._onClickId).not.toBe('handler-1');
    expect(useDocumentSelectionStore.getState().selectedElements).toEqual([
      { type: 'plugin', id: copy.fullId },
    ]);
    const gesture = mocks.rotateSession.mock.calls[0][1];
    expect(mocks.flushSession).toHaveBeenCalledWith('plugin-a');
    expect(takePastedKeyIds().gestureId).toBe(gesture);
  });

  it('지금 장면에 없는 그룹은 떼고 붙인다', async () => {
    usePluginDisplayElementStore.setState({
      elements: [plugin({ groupId: 'missing' })],
    });
    select(['plugin-a::element']);
    act(() => api.copySelectedElements());
    await act(() => api.pasteElements());
    expect(
      usePluginDisplayElementStore.getState().elements[1].groupId,
    ).toBeUndefined();
  });

  it('정의 상한을 넘으면 아무것도 붙이지 않는다', async () => {
    usePluginDisplayElementStore.setState({
      elements: [plugin({ definitionId: 'def' })],
      definitions: new Map([
        ['def', { id: 'def', pluginId: 'plugin-a', maxInstances: 1 }],
      ]) as never,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    select(['plugin-a::element']);
    act(() => api.copySelectedElements());
    await act(() => api.pasteElements());
    expect(usePluginDisplayElementStore.getState().elements).toHaveLength(1);
    expect(takePastedKeyIds().gestureId).toBeUndefined();
    warn.mockRestore();
  });
});
