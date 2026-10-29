import { describe, expect, it } from 'vitest';

import type { Scene } from '@src/types/generated/elementDocument';
import {
  documentGroupRoots,
  documentGroupsOf,
  expandDocumentGroup,
  isTreeOnlyGroup,
} from './documentGroups';

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

  it('그룹 안 요소를 누르면 가장 바깥 트리 그룹의 요소 전체를 고른다', () => {
    expect(expandDocumentGroup(scene, 'b')).toEqual(['a', 'b']);
    expect(expandDocumentGroup(scene, 'c')).toEqual(['c']);
    // 옛 그룹은 트리에서 다루지 않는다
    expect(expandDocumentGroup(scene, 'd')).toEqual(['d']);
  });

  it('묶을 대상은 다 고른 그룹은 그룹째, 나머지는 요소로 겹치는 순서대로', () => {
    expect(documentGroupRoots(scene, ['a', 'b', 'c'])).toEqual(['outer', 'c']);
    expect(documentGroupRoots(scene, ['b', 'c'])).toEqual(['inner', 'c']);
  });

  it('풀 대상은 고른 요소가 들어 있는 가장 바깥 트리 그룹', () => {
    expect(documentGroupsOf(scene, ['b', 'c'])).toEqual(['outer']);
    expect(documentGroupsOf(scene, ['c', 'd'])).toEqual([]);
  });
});
