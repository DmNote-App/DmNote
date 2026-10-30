import { beforeEach, describe, expect, it } from 'vitest';

import {
  pruneStalePluginSelection,
  useGridSelectionStore,
} from '@stores/grid/useGridSelectionStore';
import { keepOtherSelection } from '@stores/grid/keepOtherSelection';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

const key = { type: 'key' as const, id: 'k1', index: 0 };

describe('옛 종류 선택과 트리 요소 선택', () => {
  beforeEach(() => {
    useGridSelectionStore.getState().clearSelection();
    useDocumentSelectionStore.getState().clear();
  });

  it('바꿔 고르면 다른 쪽 선택을 비운다', () => {
    useDocumentSelectionStore.getState().setSelection('4key', ['t1']);
    useGridSelectionStore.getState().setSelectedElements([key]);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([]);

    useDocumentSelectionStore.getState().select('4key', 't1');
    expect(useGridSelectionStore.getState().selectedElements).toEqual([]);
  });

  it('넣고 빼기는 다른 쪽 선택을 지킨다', () => {
    useDocumentSelectionStore.getState().setSelection('4key', ['t1']);
    keepOtherSelection(() =>
      useGridSelectionStore.getState().toggleSelection(key),
    );
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual(['t1']);
    expect(useGridSelectionStore.getState().selectedElements).toEqual([key]);

    keepOtherSelection(() =>
      useDocumentSelectionStore.getState().setSelection('4key', ['t1', 't2']),
    );
    expect(useGridSelectionStore.getState().selectedElements).toEqual([key]);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([
      't1',
      't2',
    ]);
  });

  it('넣고 빼기가 끝나면 다시 바꿔 고르기로 돌아간다', () => {
    keepOtherSelection(() => undefined);
    useDocumentSelectionStore.getState().setSelection('4key', ['t1']);
    useGridSelectionStore.getState().setSelectedElements([key]);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([]);
  });

  it('같은 옛 종류 선택을 다시 골라도(더블클릭 편집 진입 등) 바꿔 고르기다', () => {
    useGridSelectionStore.getState().setSelectedElements([key]);
    keepOtherSelection(() =>
      useDocumentSelectionStore.getState().setSelection('4key', ['t1']),
    );
    useGridSelectionStore.getState().setSelectedElements([key]);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([]);
  });

  it('사라진 플러그인 선택을 걷어내는 고쳐 맞추기는 트리 요소 선택을 지킨다', () => {
    const plugin = { type: 'plugin' as const, id: 'demo::gone' };
    useGridSelectionStore.getState().setSelectedElements([key, plugin]);
    keepOtherSelection(() =>
      useDocumentSelectionStore.getState().setSelection('4key', ['t1']),
    );
    pruneStalePluginSelection(new Set());
    expect(useGridSelectionStore.getState().selectedElements).toEqual([key]);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual(['t1']);
  });
});
