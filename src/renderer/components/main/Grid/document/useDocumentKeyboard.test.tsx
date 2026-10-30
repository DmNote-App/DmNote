import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useKeyStore } from '@stores/data/useKeyStore';
import { markGridKeyHandled } from '@stores/grid/gridKeyHandled';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useDocumentKeyboard } from './useDocumentKeyboard';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  remove: vi.fn(() => Promise.resolve(null)),
  move: vi.fn(() => Promise.resolve(null)),
  group: vi.fn(() => Promise.resolve(null)),
  ungroup: vi.fn(() => Promise.resolve(null)),
  step: vi.fn(() => Promise.resolve(null)),
  copy: vi.fn(() => true),
  paste: vi.fn(() => Promise.resolve()),
  clipboard: [] as unknown[],
}));

vi.mock('./documentClipboard', () => ({
  copyDocumentSelection: mocks.copy,
  pasteDocumentClipboard: mocks.paste,
  useDocumentClipboardStore: {
    getState: () => ({ nodes: mocks.clipboard }),
  },
}));

vi.mock('@utils/core/platform', () => ({ isMac: () => true }));

vi.mock('@contexts/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./documentEditActions', () => ({
  removeDocumentElements: mocks.remove,
  moveDocumentElements: mocks.move,
  groupDocumentElements: mocks.group,
  ungroupDocumentElements: mocks.ungroup,
  stepDocumentElements: mocks.step,
}));

// t* = 트리에만 있는 종류, n* = 트리로 옮긴 옛 종류(노브)
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) => ({
      kind: id.startsWith('n') ? 'knob' : 'cursor',
      frame: { x: 10, y: 20, width: 5, height: 5, rotation: 0 },
    }),
  }),
}));

const Harness = () => {
  const handleKeyDown = useDocumentKeyboard();
  React.useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
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
    mocks.move.mockClear();
    mocks.copy.mockClear();
    mocks.paste.mockClear();
    mocks.clipboard = [];
  });

  afterEach(() => {
    act(() => root.unmount());
    useDocumentSelectionStore.getState().clear();
  });

  it('화살표는 1px, Shift는 10px 옮기고 여러 개는 한 커밋으로 옮긴다', () => {
    useDocumentSelectionStore.getState().select('4key', 't1');
    press('ArrowRight');
    press('ArrowUp', { shiftKey: true });
    expect(mocks.move).toHaveBeenNthCalledWith(
      1,
      '4key',
      [{ id: 't1', x: 11, y: 20 }],
      { gestureId: expect.any(String) },
    );
    expect(mocks.move).toHaveBeenNthCalledWith(
      2,
      '4key',
      [{ id: 't1', x: 10, y: 10 }],
      { gestureId: expect.any(String) },
    );
    // 연달아 누른 이동은 한 되돌리기 단계
    const gestures = mocks.move.mock.calls.map(
      (call) => (call as unknown[])[2] as { gestureId: string },
    );
    expect(gestures[1].gestureId).toBe(gestures[0].gestureId);
    useDocumentSelectionStore.getState().setSelection('4key', ['t1', 't2']);
    press('ArrowLeft');
    expect(mocks.move).toHaveBeenNthCalledWith(
      3,
      '4key',
      [
        { id: 't1', x: 9, y: 20 },
        { id: 't2', x: 9, y: 20 },
      ],
      // 선택이 바뀌면 새 단계
      { gestureId: expect.not.stringMatching(gestures[0].gestureId) },
    );
  });

  it('옛 종류 방향키와 섞이면 같은 거리·같은 되돌리기 단계로 옮긴다', () => {
    useDocumentSelectionStore.getState().select('4key', 't1');
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        shiftKey: true,
        cancelable: true,
      });
      event.preventDefault();
      markGridKeyHandled(event, 'legacy-arrow');
      window.dispatchEvent(event);
    });
    expect(mocks.move).toHaveBeenLastCalledWith(
      '4key',
      [{ id: 't1', x: 11, y: 20 }],
      { gestureId: 'legacy-arrow' },
    );
  });

  it('Cmd+C는 고른 트리 요소를 복사하고 Cmd+V는 트리 클립보드가 있을 때만 지금 탭에 붙인다', () => {
    press('v', { metaKey: true });
    expect(mocks.paste).not.toHaveBeenCalled();
    useDocumentSelectionStore.getState().select('4key', 't1');
    press('c', { metaKey: true });
    expect(mocks.copy).toHaveBeenCalledWith({ keepLegacyClipboard: false });
    useDocumentSelectionStore.getState().clear();
    mocks.clipboard = [{ id: 't1' }];
    useKeyStore.setState({ selectedKeyType: '5key' });
    press('v', { metaKey: true });
    expect(mocks.paste).toHaveBeenCalledWith('5key', { keepOther: false });
  });

  it('Cmd+G는 고른 트리 요소를 묶고 Shift+Cmd+G는 푼다', () => {
    useDocumentSelectionStore.getState().setSelection('4key', ['t1', 't2']);
    press('g', { metaKey: true, code: 'KeyG' });
    expect(mocks.group).toHaveBeenCalledWith(
      '4key',
      ['t1', 't2'],
      'layerGroup.newGroup',
    );
    press('G', { metaKey: true, shiftKey: true, code: 'KeyG' });
    expect(mocks.ungroup).toHaveBeenCalledWith('4key', ['t1', 't2']);
  });

  it('트리로 옮긴 옛 종류가 섞이면 Cmd+G를 옛 종류 키보드에 맡긴다', () => {
    mocks.group.mockClear();
    useDocumentSelectionStore.getState().setSelection('4key', ['n1', 'n2']);
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'g',
        code: 'KeyG',
        metaKey: true,
        cancelable: true,
      });
      event.preventDefault();
      markGridKeyHandled(event);
      window.dispatchEvent(event);
    });
    press('g', { metaKey: true, code: 'KeyG' });
    expect(mocks.group).not.toHaveBeenCalled();
  });

  it('옛 종류 키보드가 지웠으면 트리에만 있는 종류만 지운다', () => {
    useDocumentSelectionStore.getState().setSelection('4key', ['n1', 't1']);
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'Delete',
        cancelable: true,
      });
      event.preventDefault();
      markGridKeyHandled(event);
      window.dispatchEvent(event);
    });
    expect(mocks.remove).toHaveBeenCalledWith('4key', ['t1']);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([]);
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

  it('옛 종류 키보드가 처리한 편집 키(섞인 선택)는 트리 요소에도 같은 동작을 한다', () => {
    useDocumentSelectionStore.getState().select('4key', 't1');
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'Delete',
        cancelable: true,
      });
      // 옛 종류 키보드가 먼저 처리한 상황
      event.preventDefault();
      markGridKeyHandled(event);
      window.dispatchEvent(event);
    });
    expect(mocks.remove).toHaveBeenCalledWith('4key', ['t1']);
  });

  it('다른 층이 소비한 키는 양보한다', () => {
    useDocumentSelectionStore.getState().select('4key', 't1');
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'Delete',
        cancelable: true,
      });
      event.preventDefault();
      window.dispatchEvent(event);
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('] [는 고른 트리 요소를 한 칸 앞·뒤로 옮긴다', () => {
    useDocumentSelectionStore.getState().setSelection('4key', ['t1']);
    press(']');
    expect(mocks.step).toHaveBeenLastCalledWith('4key', ['t1'], 'forward');
    press('[');
    expect(mocks.step).toHaveBeenLastCalledWith('4key', ['t1'], 'backward');
  });
});
