import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Scene } from '@src/types/generated/elementDocument';

// 트리 요소 여럿을 고른 선택 윤곽 - 옛 종류 다중 선택(GridSelectionOverlays·GroupResizeHandles)과 같은 모양

const element = (
  id: string,
  x: number,
  y: number,
  rotation = 0,
): Scene['nodes'][number] => ({
  type: 'element',
  id,
  kind: 'cursorTracker',
  frame: { x, y, width: 40, height: 40, rotation },
});

const state = vi.hoisted(() => ({
  scene: { nodes: [] } as Scene,
}));

const elementOf = (id: string) =>
  state.scene.nodes.find((node) => node.id === id) as
    | Extract<Scene['nodes'][number], { type: 'element' }>
    | undefined;

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  useElementDocumentScene: () => state.scene,
  useDocumentElement: (_sceneId: string, id: string) => elementOf(id),
  getElementDocumentStore: () => ({
    getScene: () => state.scene,
    getElement: (_sceneId: string, id: string) => elementOf(id),
  }),
  subscribeElementDocument: () => () => {},
}));

import DocumentSelectionOverlay from './DocumentSelectionOverlay';
import { useDocumentFramePreviewStore } from '@stores/grid/useDocumentFramePreviewStore';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('트리 요소 선택 윤곽', () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = (ids: string[]) => {
    act(() => {
      useDocumentSelectionStore.getState().setSelection('4key', ids);
    });
    act(() => {
      root.render(
        <DocumentSelectionOverlay
          sceneId="4key"
          zoom={1}
          panX={10}
          panY={20}
        />,
      );
    });
  };

  const outlineOf = (id: string) =>
    host.querySelector<HTMLElement>(
      `[data-grid-selection-element-id="${id}"]`,
    )!;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useDocumentFramePreviewStore.setState({ frames: {} });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    act(() => useDocumentSelectionStore.getState().clearSelection());
  });

  it('여럿을 고르면 바깥 묶음 윤곽을 두르고 개별 윤곽은 그 변과 겹친 쪽을 생략한다', () => {
    state.scene = { nodes: [element('a', 0, 0), element('b', 60, 0)] };
    render(['a', 'b']);

    const group = host.querySelector<HTMLElement>(
      '[data-group-resize-outline]',
    );
    expect(group).not.toBeNull();
    // 묶음 틀(0,0 100×40)의 바깥쪽에 선 두께만큼 - 개별 윤곽과 같은 배치
    expect(group!.style.left).toBe('9px');
    expect(group!.style.top).toBe('19px');
    expect(group!.style.width).toBe('102px');
    expect(group!.style.height).toBe('42px');
    expect(group!.style.borderRadius).toBe('6px');

    const a = outlineOf('a');
    expect(a.style.borderRadius).toBe('0px');
    // 왼쪽·위·아래는 묶음 틀 위 - 묶음 윤곽이 그린다
    expect(a.style.borderLeftColor).toBe('transparent');
    expect(a.style.borderTopColor).toBe('transparent');
    expect(a.style.borderBottomColor).toBe('transparent');
    expect(a.style.borderRightColor).not.toBe('transparent');
    const b = outlineOf('b');
    expect(b.style.borderLeftColor).not.toBe('transparent');
    expect(b.style.borderRightColor).toBe('transparent');
  });

  it('하나만 고르면 묶음 윤곽 없이 그 요소의 둥근 윤곽만 그린다', () => {
    state.scene = { nodes: [element('a', 0, 0), element('b', 60, 0)] };
    render(['a']);

    expect(host.querySelector('[data-group-resize-outline]')).toBeNull();
    const a = outlineOf('a');
    expect(a.style.borderRadius).toBe('4px');
    expect(a.style.borderTopColor).not.toBe('transparent');
  });

  it('회전한 요소가 섞이면 공통 틀이 없어 묶음 윤곽 없이 개별 윤곽을 모두 그린다', () => {
    state.scene = { nodes: [element('a', 0, 0), element('b', 60, 0, 30)] };
    render(['a', 'b']);

    expect(host.querySelector('[data-group-resize-outline]')).toBeNull();
    const a = outlineOf('a');
    expect(a.style.borderLeftColor).not.toBe('transparent');
    expect(a.style.borderTopColor).not.toBe('transparent');
  });

  it('묶음 크기 조절 미리보기 중에는 미리보기 틀을 두른다', () => {
    state.scene = { nodes: [element('a', 0, 0), element('b', 60, 0)] };
    act(() => {
      useDocumentFramePreviewStore.setState({
        frames: {
          a: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
          b: { x: 90, y: 0, width: 60, height: 60, rotation: 0 },
        },
      });
    });
    render(['a', 'b']);

    const group = host.querySelector<HTMLElement>(
      '[data-group-resize-outline]',
    );
    expect(group!.style.width).toBe('152px');
    expect(group!.style.height).toBe('62px');
  });
});
