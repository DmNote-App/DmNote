import { beforeEach, describe, expect, it, vi } from 'vitest';

// 지금 탭 트리에 노드가 있는 플러그인 요소 - p::tree
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) =>
      id === 'p::tree'
        ? { id, kind: 'plugin:p' }
        : id === 'k1'
        ? { id, kind: 'key' }
        : undefined,
  }),
}));

import { useKeyStore } from '@stores/data/useKeyStore';
import { keepOtherSelection } from './keepOtherSelection';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

const tree = { type: 'plugin' as const, id: 'p::tree' };
const runtime = { type: 'plugin' as const, id: 'p::runtime' };
const state = () => useDocumentSelectionStore.getState();

describe('트리에 노드가 있는 플러그인 요소는 트리 선택이 맡는다', () => {
  beforeEach(() => {
    useKeyStore.setState({ selectedKeyType: '4key' });
    state().clearSelection();
    state().clear();
  });

  it('옛 선택 모양으로 골라도 트리 요소 선택에 든다 - 트리에 없는 런타임 요소만 옛 선택에', () => {
    state().selectElement(tree);
    expect(state().selectedIds).toEqual(['p::tree']);
    expect(state().selectedElements).toEqual([]);

    state().selectElement(runtime);
    expect(state().selectedIds).toEqual([]);
    expect(state().selectedElements).toEqual([runtime]);
  });

  it('넣고 빼기·한꺼번에 고르기도 트리 몫으로 나눈다', () => {
    state().setSelection('4key', ['k1']);
    keepOtherSelection(() => state().toggleSelection(tree));
    expect(state().selectedIds).toEqual(['k1', 'p::tree']);
    keepOtherSelection(() => state().toggleSelection(tree));
    expect(state().selectedIds).toEqual(['k1']);

    state().replaceSelection('4key', ['k1'], [tree, runtime]);
    expect(state().selectedIds).toEqual(['k1', 'p::tree']);
    expect(state().selectedElements).toEqual([runtime]);
    expect(state().isSelected('p::tree')).toBe(true);
    expect(state().isSelected('p::runtime')).toBe(true);
  });

  it('setSelectedElements도 트리 몫은 트리 선택으로 바로 바꾼다', () => {
    state().setSelection('4key', ['k1']);
    state().setSelectedElements([tree]);
    expect(state().selectedIds).toEqual(['p::tree']);
    expect(state().selectedElements).toEqual([]);
  });
});
