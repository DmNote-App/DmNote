import { beforeEach, describe, expect, it, vi } from 'vitest';

// 노브를 트리 편집기로 옮긴 상태
vi.mock('@src/types/elementKinds', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@src/types/elementKinds')
  >();
  return { ...actual, TREE_EDITED_KINDS: new Set(['knob']) };
});

// n* = 노브, t* = 트리에만 있는 종류
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) => ({
      id,
      kind: id.startsWith('n') ? 'knob' : 'cursor',
    }),
  }),
}));
vi.mock('@src/renderer/editor/model/elementStores', () => ({
  readAuthorityPositions: () => ({ '4key': [{ id: 'n1' }, { id: 'n2' }] }),
}));

import { useKeyStore } from '@stores/data/useKeyStore';
import { keepOtherSelection } from '@stores/grid/keepOtherSelection';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { combinedSelection, treeOnlySelectedIds } from './treeEditedSelection';
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

  it('선택 해제는 트리 선택도 비운다 - 이어서 넣으면 그것만 고른다', () => {
    useDocumentSelectionStore.getState().setSelection('4key', ['n1', 't1']);
    useGridSelectionStore.getState().clearSelection();
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([]);

    // 레이어 패널 우클릭·더블클릭 - 비운 뒤 그 행만
    useGridSelectionStore.getState().toggleSelection(knob);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual(['n1']);
  });

  it('넣고 빼기 안의 바꿔 고르기는 노브 몫만 바꾸고 트리에만 있는 종류를 지킨다', () => {
    useDocumentSelectionStore.getState().setSelection('4key', ['t1', 'n1']);
    keepOtherSelection(() =>
      useGridSelectionStore
        .getState()
        .setSelectedElements([key, { ...knob, id: 'n2', index: 1 }]),
    );
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([
      't1',
      'n2',
    ]);
    expect(useGridSelectionStore.getState().selectedElements).toEqual([key]);
  });

  it('바꿔 고르기는 트리에만 있는 종류 선택도 비운다', () => {
    useDocumentSelectionStore.getState().setSelection('4key', ['t1']);
    useGridSelectionStore.getState().setSelectedElements([knob]);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual(['n1']);
  });

  it('합친 선택은 옛 선택 뒤에 노브를 옛 선택 모양으로 붙인다', () => {
    useGridSelectionStore.getState().setSelectedElements([key]);
    keepOtherSelection(() =>
      useDocumentSelectionStore.getState().setSelection('4key', ['t1', 'n2']),
    );
    expect(combinedSelection('4key')).toEqual([
      key,
      { type: 'knob', id: 'n2', index: 1 },
    ]);
    expect(treeOnlySelectedIds('4key')).toEqual(['t1']);
    expect(combinedSelection('5key')).toEqual([key]);
  });
});
