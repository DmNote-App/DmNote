import { describe, expect, it, vi } from 'vitest';

// 키를 옛 종류 대표로 쓴다
vi.mock('@src/types/elementKinds', async (importOriginal) =>
  (await import('@src/renderer/__tests__/legacyKeyKinds')).keepKeyLegacy(
    importOriginal,
  ),
);

import type { Scene } from '@src/types/generated/elementDocument';
import {
  documentGroupActions,
  documentGroupRoots,
  documentGroupsOf,
  groupSelectionOf,
} from './documentGroups';
import { isTreeOnlyGroup } from '@src/renderer/editor/document/documentPatch';

const tracker = (id: string) => ({
  type: 'element' as const,
  id,
  kind: 'cursorTracker',
  frame: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
});

const scene: Scene = {
  nodes: [
    {
      type: 'group',
      id: 'outer',
      name: 'O',
      children: [
        tracker('a'),
        { type: 'group', id: 'inner', name: 'I', children: [tracker('b')] },
      ],
    },
    tracker('c'),
    {
      type: 'group',
      id: 'legacy',
      name: 'L',
      legacy: { index: 0 },
      children: [tracker('d')],
    },
  ],
};

describe('트리 전용 그룹 계산', () => {
  it('옛 그룹 표시가 없고 안이 모두 트리 전용이면 트리 전용 그룹이다', () => {
    expect(isTreeOnlyGroup(scene.nodes[0] as never)).toBe(true);
    expect(isTreeOnlyGroup(scene.nodes[2] as never)).toBe(false);
  });

  it('그룹 안 요소를 누르면 가장 바깥 그룹(옛 그룹 포함)의 요소 전체를 고른다', () => {
    expect(groupSelectionOf(scene, 'b')).toEqual({
      treeIds: ['a', 'b'],
      plugins: [],
    });
    expect(groupSelectionOf(scene, 'c')).toEqual({
      treeIds: ['c'],
      plugins: [],
    });
    expect(groupSelectionOf(scene, 'd')).toEqual({
      treeIds: ['d'],
      plugins: [],
    });
  });

  it('묶을 대상은 다 고른 그룹은 그룹째, 나머지는 요소로 겹치는 순서대로', () => {
    expect(documentGroupRoots(scene, ['a', 'b', 'c'])).toEqual(['outer', 'c']);
    expect(documentGroupRoots(scene, ['b', 'c'])).toEqual(['inner', 'c']);
    expect(documentGroupRoots(scene, ['c', 'd'])).toEqual(['c', 'legacy']);
  });

  it('풀 대상은 고른 요소가 들어 있는 가장 바깥 그룹', () => {
    expect(documentGroupsOf(scene, ['b', 'c'])).toEqual(['outer']);
    expect(documentGroupsOf(scene, ['c', 'd'])).toEqual(['legacy']);
  });

  it('묶기·풀기 메뉴 - 모두 한 그룹이면 풀기만, 아무 그룹도 아니면 묶기만', () => {
    expect(documentGroupActions(scene, ['c'])).toEqual([]);
    expect(documentGroupActions(scene, ['a', 'b'])).toEqual(['ungroup']);
    expect(documentGroupActions(scene, ['b', 'c'])).toEqual([
      'group',
      'ungroup',
    ]);
    expect(
      documentGroupActions({ nodes: [tracker('x'), tracker('y')] }, ['x', 'y']),
    ).toEqual(['group']);
  });
});

describe('그룹 안 플러그인 요소', () => {
  it('그룹째 고르면 플러그인 요소는 옛 선택 몫으로 나눈다', () => {
    const scene = {
      nodes: [
        {
          type: 'group' as const,
          id: 'G',
          name: 'G',
          legacy: {},
          children: [
            tracker('t1'),
            {
              type: 'element' as const,
              id: 'demo::i1',
              kind: 'plugin:demo',
              frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
            },
          ],
        },
      ],
    };
    expect(groupSelectionOf(scene as never, 't1')).toEqual({
      treeIds: ['t1'],
      plugins: ['demo::i1'],
    });
  });
});
