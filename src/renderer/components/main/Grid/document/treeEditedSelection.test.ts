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
      // 옛 순번은 트리에 실린 값
      legacy: { index: Number(id.slice(1)) - 1 },
    }),
  }),
  useElementDocumentScene: () => undefined,
  subscribeElementDocument: () => () => undefined,
}));

import { useKeyStore } from '@stores/data/useKeyStore';
import { keepOtherSelection } from '@stores/grid/keepOtherSelection';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { panelSelectionOf, useInPanelSelection } from './treeEditedSelection';
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

  it('패널 선택은 트리 선택이 모두 노브이고 플러그인이 없을 때만 노브를 합친다', () => {
    expect(panelSelectionOf([key], '4key', ['n1'])).toEqual([
      key,
      { type: 'knob', id: 'n1', index: 0 },
    ]);
    // 트리에만 있는 종류가 섞이면 옛 선택만
    expect(panelSelectionOf([key], '4key', ['n1', 't1'])).toEqual([key]);
    // 플러그인이 섞이면 옛 선택만
    const plugin = { type: 'plugin' as const, id: 'p:1' };
    expect(panelSelectionOf([plugin], '4key', ['n1'])).toEqual([plugin]);
  });
});

describe('요소 하나의 패널 선택 여부', () => {
  beforeEach(() => {
    useKeyStore.setState({ selectedKeyType: '4key' });
    useGridSelectionStore.getState().clearSelection();
    useDocumentSelectionStore.getState().clear();
  });

  it('값이 바뀔 때만 다시 그리고, 트리에만 있는 종류가 섞이면 패널 선택이 아니다', () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const renders: boolean[] = [];
    const Probe = () => {
      renders.push(useInPanelSelection('4key', 'n1'));
      return null;
    };
    const root = createRoot(document.createElement('div'));
    act(() => root.render(createElement(Probe)));
    expect(renders).toEqual([false]);

    act(() =>
      useDocumentSelectionStore.getState().setSelection('4key', ['n1']),
    );
    expect(renders).toEqual([false, true]);
    // 다른 노브를 더 골라도 n1의 값은 그대로 - 다시 그리지 않는다
    act(() =>
      useDocumentSelectionStore.getState().setSelection('4key', ['n1', 'n2']),
    );
    expect(renders).toEqual([false, true]);
    // 트리에만 있는 종류가 섞이면 패널은 트리 선택을 합치지 않는다
    act(() =>
      useDocumentSelectionStore.getState().setSelection('4key', ['n1', 't1']),
    );
    expect(renders).toEqual([false, true, false]);
    act(() => root.unmount());
  });
});
