import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useDocumentKeyboard } from './useDocumentKeyboard';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  remove: vi.fn(() => Promise.resolve(null)),
  setFrame: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('./documentEditActions', () => ({
  removeDocumentElements: mocks.remove,
  setDocumentFrame: mocks.setFrame,
}));

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: () => ({
      frame: { x: 10, y: 20, width: 5, height: 5, rotation: 0 },
    }),
  }),
}));

const Harness = () => {
  useDocumentKeyboard();
  return null;
};

const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }));
  });

describe('트리 요소 키보드', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    root = createRoot(container);
    act(() => root.render(<Harness />));
    mocks.remove.mockClear();
    mocks.setFrame.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    useDocumentSelectionStore.getState().clear();
  });

  it('화살표는 1px, Shift는 10px 옮긴다', () => {
    useDocumentSelectionStore.getState().select('4key', 't1');
    press('ArrowRight');
    press('ArrowUp', { shiftKey: true });
    expect(mocks.setFrame).toHaveBeenNthCalledWith(1, '4key', 't1', {
      x: 11,
      y: 20,
    });
    expect(mocks.setFrame).toHaveBeenNthCalledWith(2, '4key', 't1', {
      x: 10,
      y: 10,
    });
  });

  it('Delete는 지우고 선택을 푼다', () => {
    useDocumentSelectionStore.getState().select('4key', 't1');
    press('Delete');
    expect(mocks.remove).toHaveBeenCalledWith('4key', ['t1']);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([]);
  });

  it('선택이 없으면 아무것도 하지 않는다', () => {
    press('Delete');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('옛 종류 요소를 고르면 트리 요소 선택이 풀린다', () => {
    useDocumentSelectionStore.getState().select('4key', 't1');
    act(() => {
      useGridSelectionStore
        .getState()
        .setSelectedElements([{ type: 'key', id: 'k1', index: 0 }]);
    });
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([]);
    act(() => useGridSelectionStore.getState().clearSelection());
  });
});
