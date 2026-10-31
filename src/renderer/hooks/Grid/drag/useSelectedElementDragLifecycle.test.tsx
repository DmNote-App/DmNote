// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { useSelectedElementDragLifecycle } from './useSelectedElementDragLifecycle';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const GESTURE_ID = '00000000-0000-4000-8000-000000000301';

describe('useSelectedElementDragLifecycle', () => {
  let host: HTMLDivElement;
  let root: Root;
  let controller: ReturnType<typeof useSelectedElementDragLifecycle>;
  const freezeSelection = vi.fn();
  const syncSelection = vi.fn();
  const moveSelection = vi.fn();
  const companion = { move: vi.fn(), commit: vi.fn(), rollback: vi.fn() };

  const Harness = () => {
    const value = useSelectedElementDragLifecycle({
      freezeSelectionForGesture: freezeSelection,
      syncSelectedElementsToOverlay: syncSelection,
      moveSelectedElements: moveSelection,
      createCompanionReceipt: () => companion,
    });
    useEffect(() => {
      controller = value;
    });
    return null;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => GESTURE_ID });
    useDocumentSelectionStore.getState().setSelectedElements([
      { type: 'plugin', id: 'plugin:first' },
      { type: 'plugin', id: 'plugin:second' },
    ]);
    usePluginDisplayElementStore.setState({
      elements: [
        {
          fullId: 'plugin:first',
          pluginId: 'example',
        } as PluginDisplayElementInternal,
        {
          fullId: 'plugin:second',
          pluginId: 'example',
        } as PluginDisplayElementInternal,
        {
          fullId: 'plugin:unselected',
          pluginId: 'other',
        } as PluginDisplayElementInternal,
      ],
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('선택을 동결하고, 끝낼 때 같은 동작 id로 정산한다', () => {
    let cleanup: (() => void) | undefined;
    act(() => {
      cleanup = controller.beginSelectedElementsDrag();
    });

    expect(freezeSelection).toHaveBeenCalledTimes(1);
    controller.commitSelectedElementsDrag();
    expect(syncSelection).toHaveBeenCalledWith(GESTURE_ID);

    cleanup?.();
    controller.commitSelectedElementsDrag();
    expect(syncSelection).toHaveBeenLastCalledWith(undefined);
  });

  it('드래그 이동은 선택 이동으로 위임하고, 취소는 플러그인을 시작 위치로 되돌린다', () => {
    usePluginDisplayElementStore.setState({
      elements: [
        {
          fullId: 'plugin:first',
          pluginId: 'example',
          position: { x: 1, y: 2 },
        } as PluginDisplayElementInternal,
      ],
    });
    moveSelection.mockImplementation((dx: number, dy: number) => {
      const store = usePluginDisplayElementStore.getState();
      store.setElements(
        store.elements.map((element) => ({
          ...element,
          position: {
            x: element.position.x + dx,
            y: element.position.y + dy,
          },
        })),
      );
    });
    let cleanup: ((commit?: boolean) => void) | undefined;
    act(() => {
      cleanup = controller.beginSelectedElementsDrag();
    });

    controller.moveSelectedElementsDrag(5, -3);
    expect(moveSelection).toHaveBeenCalledWith(5, -3);
    expect(
      usePluginDisplayElementStore.getState().elements[0].position,
    ).toEqual({ x: 6, y: -1 });

    cleanup?.(false);
    expect(
      usePluginDisplayElementStore.getState().elements[0].position,
    ).toEqual({ x: 1, y: 2 });
    moveSelection.mockReset();
  });

  it('함께 고른 트리 요소 영수증도 옮기고 커밋하며, 취소하면 되돌린다', () => {
    let cleanup: ((commit?: boolean) => void) | undefined;
    act(() => {
      cleanup = controller.beginSelectedElementsDrag();
    });
    controller.moveSelectedElementsDrag(3, 4);
    expect(companion.move).toHaveBeenCalledWith(3, 4);
    controller.commitSelectedElementsDrag();
    expect(companion.commit).toHaveBeenCalledTimes(1);
    cleanup?.(true);
    expect(companion.rollback).not.toHaveBeenCalled();

    act(() => {
      cleanup = controller.beginSelectedElementsDrag();
    });
    cleanup?.(false);
    expect(companion.rollback).toHaveBeenCalledTimes(1);
  });
});
