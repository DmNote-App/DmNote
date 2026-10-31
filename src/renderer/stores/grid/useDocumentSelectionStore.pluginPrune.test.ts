import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  pruneStalePluginSelection,
  useDocumentSelectionStore,
} from './useDocumentSelectionStore';

// 키를 옛 종류 대표로 쓴다
vi.mock('@src/types/elementKinds', async (importOriginal) =>
  (await import('@src/renderer/__tests__/legacyKeyKinds')).keepKeyLegacy(
    importOriginal,
  ),
);

describe('죽은 플러그인 선택 prune', () => {
  beforeEach(() => {
    useDocumentSelectionStore.setState({ selectedElements: [] });
  });

  it('죽은 plugin fullId 선택만 제거된다', () => {
    useDocumentSelectionStore.getState().setSelectedElements([
      { type: 'plugin', id: 'plugin-a:dead' },
      { type: 'plugin', id: 'plugin-a:alive' },
      { type: 'key', id: '11111111-1111-4111-8111-111111111111', index: 0 },
    ]);

    pruneStalePluginSelection(new Set(['plugin-a:alive']));

    const selected = useDocumentSelectionStore.getState().selectedElements;
    expect(selected).toEqual([
      { type: 'plugin', id: 'plugin-a:alive' },
      { type: 'key', id: '11111111-1111-4111-8111-111111111111', index: 0 },
    ]);
  });

  it('모든 선택이 살아 있으면 선택 참조를 보존한다', () => {
    useDocumentSelectionStore.getState().setSelectedElements([
      { type: 'plugin', id: 'plugin-a:alive' },
      { type: 'key', id: '11111111-1111-4111-8111-111111111111', index: 0 },
    ]);
    const reference = useDocumentSelectionStore.getState().selectedElements;

    pruneStalePluginSelection(new Set(['plugin-a:alive']));

    expect(useDocumentSelectionStore.getState().selectedElements).toBe(
      reference,
    );
  });

  it('빈 선택이면 아무것도 하지 않는다', () => {
    const reference = useDocumentSelectionStore.getState().selectedElements;

    pruneStalePluginSelection(new Set());

    expect(useDocumentSelectionStore.getState().selectedElements).toBe(
      reference,
    );
  });
});
