import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Scene } from '@src/types/generated/elementDocument';

const mocks = vi.hoisted(() => ({
  move: vi.fn(() => Promise.resolve(null)),
  others: vi.fn((_exclude: string[]) => []),
}));

const scene: Scene = {
  nodes: [
    {
      type: 'element',
      id: 't1',
      kind: 'cursorTracker',
      frame: { x: 0, y: 0, width: 40, height: 40, rotation: 0 },
    },
  ],
};

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  loadElementDocumentStore: () => Promise.resolve(),
  useElementDocumentScene: () => scene,
  getElementDocumentStore: () => ({
    getScene: () => scene,
    getElement: () => scene.nodes[0],
  }),
}));
vi.mock('@contexts/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@hooks/Grid/drag/useSmartGuidesElements', () => ({
  getOtherElementBounds: mocks.others,
}));
vi.mock('./documentEditActions', () => ({
  moveDocumentElements: mocks.move,
  removeDocumentElements: vi.fn(),
}));

import { keepOtherSelection } from '@stores/grid/keepOtherSelection';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useCommittedApplyStore } from '@stores/data/useCommittedApplyStore';
import { usePropertiesPanelStore } from '@stores/grid/usePropertiesPanelStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import DocumentGridLayer from './DocumentGridLayer';
import { useDocumentFramePreviewStore } from './useDocumentFramePreviewStore';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

const pointer = (type: string, x: number, y: number) =>
  new PointerEvent(type, {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
    pointerId: 1,
  });

const render = (
  mixedDrag?: Parameters<typeof DocumentGridLayer>[0]['mixedDrag'],
) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <DocumentGridLayer
        sceneId="4key"
        activeTool="move"
        placement="bottom"
        zoom={1}
        onElementContextMenu={() => undefined}
        mixedDrag={mixedDrag}
      />,
    );
  });
  const box = container.querySelector<HTMLElement>('[data-element-id="t1"]')!;
  box.setPointerCapture = () => undefined;
  box.hasPointerCapture = () => false;
  box.releasePointerCapture = () => undefined;
  return { box, unmount: () => act(() => root.unmount()) };
};

describe('트리 요소에서 시작한 끌기', () => {
  beforeEach(() => {
    mocks.move.mockClear();
    mocks.others.mockClear();
    useGridSelectionStore.getState().clearSelection();
    useDocumentSelectionStore.getState().clear();
  });

  it('옛 종류 요소와 함께 골랐으면 옛 끌기 수명 주기로 증분 이동하고 커밋한다', () => {
    useDocumentSelectionStore.getState().setSelection('4key', ['t1']);
    // 보조키로 함께 고른 상태
    keepOtherSelection(() =>
      useGridSelectionStore.setState({
        selectedElements: [{ type: 'key', id: 'k1', index: 0 }],
      }),
    );
    const end = vi.fn();
    const mixedDrag = {
      begin: vi.fn(() => end),
      move: vi.fn(),
      commit: vi.fn(),
    };
    const { box, unmount } = render(mixedDrag);
    act(() => {
      box.dispatchEvent(pointer('pointerdown', 0, 0));
      box.dispatchEvent(pointer('pointermove', 10, 0));
      box.dispatchEvent(pointer('pointermove', 15, 5));
      box.dispatchEvent(pointer('pointerup', 15, 5));
    });
    expect(mixedDrag.begin).toHaveBeenCalledTimes(1);
    const total = mixedDrag.move.mock.calls.reduce(
      (sum, [dx, dy]) => ({ x: sum.x + dx, y: sum.y + dy }),
      { x: 0, y: 0 },
    );
    expect(total).toEqual({ x: 15, y: 5 });
    expect(mixedDrag.commit).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith(true);
    // 함께 움직이는 옛 요소에는 맞추지 않는다
    expect(mocks.others).toHaveBeenCalledWith(['t1', 'k1']);
    expect(mocks.move).not.toHaveBeenCalled();
    unmount();
  });

  it('트리 요소만 골랐으면 트리 미리보기로 옮기고 직접 커밋한다', async () => {
    const mixedDrag = { begin: vi.fn(), move: vi.fn(), commit: vi.fn() };
    const { box, unmount } = render(mixedDrag);
    act(() => {
      box.dispatchEvent(pointer('pointerdown', 0, 0));
      box.dispatchEvent(pointer('pointermove', 10, 0));
      box.dispatchEvent(pointer('pointerup', 10, 0));
    });
    expect(mixedDrag.begin).not.toHaveBeenCalled();
    expect(mocks.move).toHaveBeenCalledWith('4key', [
      { id: 't1', x: 10, y: 0 },
    ]);
    unmount();
  });

  it('끄는 동안 상자에 편집 중 표시를 단다 (전환 효과 끄기)', () => {
    const { box, unmount } = render();
    expect(box.getAttribute('data-editing')).toBeNull();
    act(() => {
      box.dispatchEvent(pointer('pointerdown', 0, 0));
      box.dispatchEvent(pointer('pointermove', 10, 0));
    });
    expect(box.getAttribute('data-editing')).toBe('true');
    act(() => {
      box.dispatchEvent(pointer('pointerup', 10, 0));
    });
    unmount();
  });

  it('더블클릭은 속성 패널을 속성 모드로 연다', () => {
    usePropertiesPanelStore.getState().setCanvasPanelOpen(false);
    usePropertiesPanelStore.getState().setCanvasPanelMode('layer');
    const { box, unmount } = render();
    act(() => {
      box.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, button: 0 }),
      );
    });
    expect(usePropertiesPanelStore.getState()).toMatchObject({
      isCanvasPanelOpen: true,
      canvasPanelMode: 'property',
    });
    unmount();
  });

  it('끄는 중 되돌리기가 끼어들면 옮긴 것을 버린다', () => {
    useDocumentSelectionStore.getState().setSelection('4key', ['t1']);
    keepOtherSelection(() =>
      useGridSelectionStore.setState({
        selectedElements: [{ type: 'key', id: 'k1', index: 0 }],
      }),
    );
    const end = vi.fn();
    const mixedDrag = {
      begin: vi.fn(() => end),
      move: vi.fn(),
      commit: vi.fn(),
    };
    const { box, unmount } = render(mixedDrag);
    act(() => {
      box.dispatchEvent(pointer('pointerdown', 0, 0));
      box.dispatchEvent(pointer('pointermove', 10, 0));
      useCommittedApplyStore.setState((state) => ({
        historyTick: state.historyTick + 1,
      }));
      box.dispatchEvent(pointer('pointerup', 10, 0));
    });
    expect(mixedDrag.commit).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledWith(false);
    expect(useGridSelectionStore.getState().isDraggingOrResizing).toBe(false);
    unmount();
  });

  it('트리 요소만 끄는 중 되돌리기가 끼어들면 미리보기만 지운다', () => {
    const { box, unmount } = render();
    act(() => {
      box.dispatchEvent(pointer('pointerdown', 0, 0));
      box.dispatchEvent(pointer('pointermove', 10, 0));
      useCommittedApplyStore.setState((state) => ({
        historyTick: state.historyTick + 1,
      }));
      box.dispatchEvent(pointer('pointerup', 10, 0));
    });
    expect(mocks.move).not.toHaveBeenCalled();
    expect(useDocumentFramePreviewStore.getState().frames).toEqual({});
    unmount();
  });
});

describe('트리 요소 Shift 클릭 범위 선택', () => {
  beforeEach(() => {
    useGridSelectionStore.getState().clearSelection();
    useGridSelectionStore.getState().setLastSelectedKeyBounds(null);
    useDocumentSelectionStore.getState().clear();
    usePluginDisplayElementStore.setState({
      elements: [
        {
          fullId: 'p:between',
          position: { x: 60, y: 0 },
          measuredSize: { width: 10, height: 10 },
        },
      ] as never,
    });
  });

  it('마지막으로 누른 요소(플러그인 요소 포함) 영역부터 범위 안의 트리 요소와 플러그인 요소를 고른다', () => {
    useGridSelectionStore
      .getState()
      .setLastSelectedKeyBounds({ x: 100, y: 0, width: 10, height: 10 });
    const { box, unmount } = render();
    act(() => {
      box.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          shiftKey: true,
          pointerId: 1,
        }),
      );
      box.dispatchEvent(pointer('pointerup', 0, 0));
    });
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual(['t1']);
    expect(useGridSelectionStore.getState().selectedElements).toEqual([
      { type: 'plugin', id: 'p:between' },
    ]);
    unmount();
  });

  it('그냥 누르면 그 요소를 다음 범위 선택의 기준으로 남긴다', () => {
    const { box, unmount } = render();
    act(() => {
      box.dispatchEvent(pointer('pointerdown', 0, 0));
      box.dispatchEvent(pointer('pointerup', 0, 0));
    });
    expect(useGridSelectionStore.getState().lastSelectedKeyBounds).toEqual({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
    });
    unmount();
  });
});
