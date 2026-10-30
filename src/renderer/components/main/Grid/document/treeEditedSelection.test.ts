import { beforeEach, describe, expect, it, vi } from 'vitest';

// 노브를 트리 편집기로 옮긴 상태
vi.mock('@src/types/elementKinds', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@src/types/elementKinds')
  >();
  return { ...actual, TREE_EDITED_KINDS: new Set(['knob']) };
});

import { useKeyStore } from '@stores/data/useKeyStore';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

const key = { type: 'key' as const, id: 'k1', index: 0 };
const knob = { type: 'knob' as const, id: 'n1', index: 0 };

describe('옛 선택으로 들어온 트리로 옮긴 옛 종류', () => {
  beforeEach(() => {
    useKeyStore.setState({ selectedKeyType: '4key' });
    useGridSelectionStore.getState().clearSelection();
    useDocumentSelectionStore.getState().clear();
  });

  it('전체 목록은 노브 몫을 트리 선택으로 보내고 나머지는 옛 선택에 둔다', () => {
    useGridSelectionStore.getState().setSelectedElements([key, knob]);
    expect(useGridSelectionStore.getState().selectedElements).toEqual([key]);
    expect(useDocumentSelectionStore.getState()).toMatchObject({
      sceneId: '4key',
      selectedIds: ['n1'],
    });
  });

  it('하나 고르기는 트리 선택만, 넣고 빼기는 트리 선택에서 뒤집는다', () => {
    useGridSelectionStore.getState().setSelectedElements([key]);
    useGridSelectionStore.getState().toggleSelection(knob);
    expect(useGridSelectionStore.getState().selectedElements).toEqual([key]);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual(['n1']);
    useGridSelectionStore.getState().toggleSelection(knob);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([]);

    useGridSelectionStore.getState().selectElement(knob);
    expect(useGridSelectionStore.getState().selectedElements).toEqual([]);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual(['n1']);
  });
});
