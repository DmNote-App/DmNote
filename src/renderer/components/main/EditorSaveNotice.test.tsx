import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorSaveNotice from './EditorSaveNotice';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => {
  let held = 0;
  const listeners = new Set<() => void>();
  const setHeld = (next: number) => {
    held = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    setHeld,
    settle: vi.fn(),
    store: {
      getHeldCount: () => held,
      subscribeHeld: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
});
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  loadElementDocumentStore: async () => mocks.store,
}));
vi.mock('@src/renderer/editor/runtime/lifecycle/lifecycleEditorFlush', () => ({
  flushFocusedEditor: mocks.settle,
}));
vi.mock('@contexts/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@stores/data/useHistoryStatusStore', () => ({
  useHistoryStatusStore: (selector: (state: { busy: boolean }) => unknown) =>
    selector({ busy: false }),
}));

describe('보류한 트리 편집 안내', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    mocks.setHeld(0);
    mocks.settle.mockReset().mockResolvedValue(true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('보류한 편집이 있을 때만 보이고, 다시 저장은 포커스 입력 확정(보류분 다시 보내기 포함)을 부른다', async () => {
    await act(async () => root.render(<EditorSaveNotice />));
    expect(container.querySelector('[role="status"]')).toBeNull();

    act(() => mocks.setHeld(2));
    expect(container.textContent).toContain('editorSave.pendingFailure');

    mocks.settle.mockImplementation(async () => {
      mocks.setHeld(0);
      return true;
    });
    const button = container.querySelector('button')!;
    await act(async () => button.click());
    expect(mocks.settle).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
