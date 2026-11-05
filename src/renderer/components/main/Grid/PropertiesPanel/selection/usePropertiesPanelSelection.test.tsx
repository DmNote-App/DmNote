// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const KNOB = '00000000-0000-4000-8000-0000000000k1';

const tree = vi.hoisted(() => ({
  // 그룹 판정용 - 노브 하나 더와 트리에만 있는 종류(커서 트래커)
  extra: [
    {
      type: 'element',
      id: '00000000-0000-4000-8000-0000000000k2',
      kind: 'knob',
      frame: { x: 80, y: 0, width: 60, height: 60, rotation: 0 },
      values: {},
    },
    {
      type: 'element',
      id: '00000000-0000-4000-8000-0000000000c1',
      kind: 'cursorTracker',
      frame: { x: 160, y: 0, width: 120, height: 120, rotation: 0 },
      values: {},
    },
  ],
  element: {
    type: 'element',
    id: '00000000-0000-4000-8000-0000000000k1',
    kind: 'knob',
    frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
    // 트리로 보낸 편집이 낙관 반영된 값
    values: { sensitivity: 3, reverse: false },
  },
}));

const scene = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  useElementDocumentScene: () =>
    (scene.value ??= { nodes: [tree.element] }) as never,
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) =>
      [tree.element, ...tree.extra].find((element) => element.id === id),
  }),
}));

import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import { previewOverlay } from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { usePropertiesPanelSelection } from './usePropertiesPanelSelection';

const KNOB2 = '00000000-0000-4000-8000-0000000000k2';
const TRACKER = '00000000-0000-4000-8000-0000000000c1';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('속성 패널 단일 요소 값', () => {
  it('트리 편집기가 맡는 요소는 트리 값 + 편집 미리보기를 읽는다', () => {
    useKeyStore.setState({ selectedKeyType: '4key' });
    useDocumentSelectionStore.setState({
      selectedElements: [{ type: 'knob', id: KNOB, index: 0 }],
    });
    const onRender =
      vi.fn<(value: ReturnType<typeof usePropertiesPanelSelection>) => void>();
    const Probe = () => {
      onRender(usePropertiesPanelSelection());
      return null;
    };
    const latest = () => onRender.mock.lastCall![0];
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe />));
    expect(latest().singleKnobPosition?.sensitivity).toBe(3);

    act(() => {
      previewOverlay.applyLocalPatchByIds(
        '11111111-1111-4111-8111-111111111111',
        '4key',
        [KNOB],
        { sensitivity: 4 },
        'knobPosition',
      );
    });
    expect(latest().singleKnobPosition?.sensitivity).toBe(4);
    act(() => {
      previewOverlay.clearAll();
      root.unmount();
    });
  });

  it('트리 선택을 합친 선택 목록은 다시 그려도 같은 참조다 - 선택 바뀜 effect(피커·하위 페이지 닫기)가 렌더마다 돌지 않게', () => {
    useKeyStore.setState({ selectedKeyType: '4key' });
    useDocumentSelectionStore.setState({
      sceneId: '4key',
      selectedIds: [KNOB],
      selectedElements: [],
    });
    const onRender = vi.fn<(selected: unknown) => void>();
    const Probe = ({ tick }: { tick: number }) => {
      onRender(usePropertiesPanelSelection().selectedElements);
      return <span data-tick={tick} />;
    };
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe tick={0} />));
    act(() => root.render(<Probe tick={1} />));
    act(() => root.render(<Probe tick={2} />));
    const seen = onRender.mock.calls.map(([selected]) => selected);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.at(-1)).toEqual([{ type: 'knob', id: KNOB, index: 0 }]);
    expect(new Set(seen).size).toBe(1);
    act(() => root.unmount());
  });

  it('트리를 고쳐 장면이 바뀌어도 같은 선택이면 같은 참조다 - 고친 뒤 열린 피커·하위 페이지가 닫히지 않게', () => {
    useKeyStore.setState({ selectedKeyType: '4key' });
    useDocumentSelectionStore.setState({
      sceneId: '4key',
      selectedIds: [KNOB],
      selectedElements: [],
    });
    const onRender = vi.fn<(selected: unknown) => void>();
    const Probe = ({ tick }: { tick: number }) => {
      onRender(usePropertiesPanelSelection().selectedElements);
      return <span data-tick={tick} />;
    };
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe tick={0} />));
    // 고른 노브의 값을 고친 뒤 - 장면은 새 객체
    scene.value = {
      nodes: [{ ...tree.element, values: { sensitivity: 4, reverse: false } }],
    };
    act(() => root.render(<Probe tick={1} />));
    const seen = onRender.mock.calls.map(([selected]) => selected);
    expect(seen.at(-1)).toEqual([{ type: 'knob', id: KNOB, index: 0 }]);
    expect(new Set(seen).size).toBe(1);

    // 선택이 바뀌면 새 참조
    act(() => useDocumentSelectionStore.setState({ selectedIds: [] }));
    expect(onRender.mock.calls.at(-1)?.[0]).toEqual([]);
    expect(onRender.mock.calls.at(-1)?.[0]).not.toBe(seen.at(-1));
    act(() => root.unmount());
  });
});

describe('트리에만 있는 종류가 섞인 일괄의 그룹', () => {
  const groupInfoOf = (nodes: unknown[], selectedIds: string[]) => {
    scene.value = { nodes };
    useKeyStore.setState({ selectedKeyType: '4key' });
    useDocumentSelectionStore.setState({
      sceneId: '4key',
      selectedIds,
      selectedElements: [],
    });
    const onRender = vi.fn<(info: unknown) => void>();
    const Probe = () => {
      onRender(usePropertiesPanelSelection().selectedGroupInfo);
      return null;
    };
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe />));
    act(() => root.unmount());
    scene.value = null;
    return onRender.mock.lastCall![0];
  };
  const [knob2, tracker] = tree.extra;
  const group = (children: unknown[]) => ({
    type: 'group',
    id: 'g1',
    name: '묶음',
    hidden: false,
    children,
  });

  it('노브와 커서 트래커로 된 그룹을 통째로 고르면 그 그룹이다', () => {
    expect(
      groupInfoOf([group([tree.element, tracker])], [KNOB, TRACKER]),
    ).toEqual({ id: 'g1', name: '묶음', memberCount: 2 });
  });

  it('노브 그룹에 그룹 밖 커서 트래커를 더 고르면 그룹 하나 전체가 아니다', () => {
    expect(
      groupInfoOf(
        [group([tree.element, knob2]), tracker],
        [KNOB, KNOB2, TRACKER],
      ),
    ).toBeNull();
  });
});
