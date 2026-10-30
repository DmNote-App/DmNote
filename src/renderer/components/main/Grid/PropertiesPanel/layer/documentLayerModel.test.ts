import { describe, expect, it } from 'vitest';

import type { Scene } from '@src/types/generated/elementDocument';
import { documentDropMove, documentLayerRows } from './documentLayerModel';

const tracker = (id: string) => ({
  type: 'element' as const,
  id,
  kind: 'cursorTracker',
  frame: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
});
const key = (id: string) => ({ ...tracker(id), kind: 'key' });

// 아래→위: k1, a, G{b, c}, L(옛 그룹){k2, d}
const scene: Scene = {
  nodes: [
    key('k1'),
    tracker('a'),
    {
      type: 'group',
      id: 'G',
      name: 'G',
      children: [tracker('b'), tracker('c')],
    },
    {
      type: 'group',
      id: 'L',
      name: 'L',
      legacy: { index: 0 },
      children: [key('k2'), tracker('d')],
    },
  ],
};

const view = (rows: ReturnType<typeof documentLayerRows>) =>
  rows.map((row) => `${row.node.id}:${row.depth}`);

describe('레이어 행', () => {
  it('위→아래로 모든 노드를 보이고 접은 그룹은 안을 감춘다', () => {
    expect(view(documentLayerRows(scene, new Set()))).toEqual([
      'L:0',
      'd:1',
      'k2:1',
      'G:0',
      'c:1',
      'b:1',
      'a:0',
      'k1:0',
    ]);
    expect(view(documentLayerRows(scene, new Set(['G', 'L'])))).toEqual([
      'L:0',
      'G:0',
      'a:0',
      'k1:0',
    ]);
  });

  it('행 위·아래에 놓으면 그 행의 부모 안 겹치는 순서 자리로 옮긴다', () => {
    const rows = documentLayerRows(scene, new Set());
    // a를 c 위에 놓기 - G 안에서 c 다음(더 위)
    expect(documentDropMove(scene, rows, ['a'], 4, 'above')).toEqual({
      op: 'move',
      scene: 's',
      ids: ['a'],
      parent: 'G',
      index: 2,
    });
    // d를 a 아래에 놓기 - 장면 맨 위 단계에서 a 자리
    expect(documentDropMove(scene, rows, ['d'], 6, 'below')).toEqual({
      op: 'move',
      scene: 's',
      ids: ['d'],
      parent: null,
      index: 1,
    });
  });

  it('그룹 행 가운데에 놓으면 그 그룹 맨 위로, 자기 안으로는 못 놓는다', () => {
    const rows = documentLayerRows(scene, new Set());
    expect(documentDropMove(scene, rows, ['a'], 3, 'into')).toEqual({
      op: 'move',
      scene: 's',
      ids: ['a'],
      parent: 'G',
      index: null,
    });
    expect(documentDropMove(scene, rows, ['G'], 4, 'above')).toBeNull();
    expect(documentDropMove(scene, rows, ['G'], 3, 'into')).toBeNull();
  });

  it('옛 종류가 든 노드를 그룹 안 그룹에, 옛 그룹째 다른 그룹에 넣는 자리는 받지 않는다', () => {
    // 아래→위: G{T{t}}, L(옛 그룹){k3}, k4
    const nested: Scene = {
      nodes: [
        {
          type: 'group',
          id: 'G',
          name: 'G',
          children: [
            { type: 'group', id: 'T', name: 'T', children: [tracker('t')] },
          ],
        },
        {
          type: 'group',
          id: 'L',
          name: 'L',
          legacy: { index: 0 },
          children: [key('k3')],
        },
        key('k4'),
      ],
    };
    const rows = documentLayerRows(nested, new Set());
    const at = (id: string) => rows.findIndex((row) => row.node.id === id);
    // 키를 G 안의 T 안으로 - 거부
    expect(documentDropMove(nested, rows, ['k4'], at('T'), 'into')).toBeNull();
    // 키를 맨 위 단계 그룹 G 안으로 - 된다
    expect(
      documentDropMove(nested, rows, ['k4'], at('G'), 'into'),
    ).not.toBeNull();
    // 옛 그룹 L째 G 안으로 - 거부
    expect(documentDropMove(nested, rows, ['L'], at('G'), 'into')).toBeNull();
    // 트래커는 어디든
    expect(
      documentDropMove(nested, rows, ['t'], at('L'), 'into'),
    ).not.toBeNull();
  });
});
