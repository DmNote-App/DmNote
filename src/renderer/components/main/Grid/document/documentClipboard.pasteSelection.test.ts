import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  // 트리 스토어 화면에 있는 요소 (낙관 반영·되감기를 흉내)
  existing: new Set<string>(),
  release: null as null | ((result: unknown) => void),
}));

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getScene: () => ({ nodes: [] }),
    getElement: (_scene: string, id: string) =>
      mocks.existing.has(id) ? { id } : undefined,
  }),
}));
vi.mock('./documentEditActions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./documentEditActions')>()),
  editDocument: (ops: Array<{ op: string; node?: { id: string } }>) => {
    for (const op of ops) {
      if (op.op === 'insert' && op.node) mocks.existing.add(op.node.id);
    }
    return new Promise((resolve) => {
      mocks.release = resolve;
    });
  },
}));

import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import {
  pasteDocumentClipboard,
  useDocumentClipboardStore,
} from './documentClipboard';

const tracker = {
  type: 'element' as const,
  id: 't1',
  kind: 'cursorTracker',
  frame: { x: 0, y: 0, width: 120, height: 120, rotation: 0 },
};

describe('붙여넣기 뒤 선택', () => {
  beforeEach(() => {
    mocks.existing = new Set(['t1']);
    mocks.release = null;
    useDocumentSelectionStore.getState().replaceSelection('4key', ['t1'], []);
    useDocumentClipboardStore.getState().set([tracker], {
      mode: '4key',
      triggerCanonicals: {},
    });
  });

  it('응답을 기다리지 않고 붙인 사본을 고른다 - 그 사이 Delete가 원본을 지우지 않게', async () => {
    const pasted = pasteDocumentClipboard('4key');
    const selected = useDocumentSelectionStore.getState().selectedIds;
    expect(selected).toHaveLength(1);
    expect(selected[0]).not.toBe('t1');
    mocks.release!({ status: 'committed' });
    await pasted;
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual(selected);
  });

  it('붙이지 못해 화면에서 빠진 사본은 선택에서도 뺀다', async () => {
    const pasted = pasteDocumentClipboard('4key');
    const [copy] = useDocumentSelectionStore.getState().selectedIds;
    mocks.existing.delete(copy);
    mocks.release!({ status: 'rejected', code: 'VIOLATION' });
    await pasted;
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([]);
  });
});
