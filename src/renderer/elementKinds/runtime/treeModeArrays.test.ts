import { describe, expect, it } from 'vitest';

import type { Node, Scene } from '@src/types/generated/elementDocument';
import { treeModeArrays } from './treeModeArrays';

const frame = (x: number) => ({ x, y: 0, width: 10, height: 10, rotation: 0 });

const key = (id: string, x: number, slot: string): Node =>
  ({
    type: 'element',
    id,
    kind: 'key',
    frame: frame(x),
    input: { type: 'key', slot },
  } as Node);

const element = (id: string, kind: string, x: number): Node =>
  ({ type: 'element', id, kind, frame: frame(x) } as Node);

describe('장면 트리 → 탭 하나의 옛 종류 위치 목록', () => {
  it('트리 순서(아래→위)로 모으고 zIndex는 트리 순번, 키 슬롯은 키 위치와 같은 순번으로 짝을 이룬다', () => {
    const scene: Scene = {
      nodes: [
        key('k1', 1, 'KeyA'),
        element('tracker', 'cursorTracker', 2),
        {
          type: 'group',
          id: 'g',
          name: 'G',
          hidden: true,
          children: [key('k2', 3, 'KeyB'), element('s1', 'stat', 4)],
        } as Node,
        element('n1', 'knob', 5),
        element('demo::p', 'plugin:demo', 6),
      ],
    };
    const arrays = treeModeArrays(scene);
    expect(arrays.keySlots).toEqual(['KeyA', 'KeyB']);
    expect(
      arrays.keyPositions.map(({ id, dx, zIndex }) => [id, dx, zIndex]),
    ).toEqual([
      ['k1', 1, 0],
      ['k2', 3, 2],
    ]);
    // 숨긴 그룹 안은 숨김
    expect(arrays.keyPositions[0].hidden).toBe(false);
    expect(arrays.keyPositions[1].hidden).toBe(true);
    expect(arrays.itemArrays.statPositions).toMatchObject([
      { id: 's1', dx: 4, zIndex: 3, hidden: true },
    ]);
    expect(arrays.itemArrays.knobPositions).toMatchObject([
      { id: 'n1', dx: 5, zIndex: 4 },
    ]);
    // 트리에만 있는 종류·플러그인 요소는 옛 위치 목록에 들지 않는다 (순번은 함께 센다)
    expect(arrays.itemArrays.graphPositions).toEqual([]);
    expect(arrays.itemArrays.spritePositions).toEqual([]);
  });

  it('입력이 없는 키는 빈 슬롯, 장면이 없으면 빈 목록, 같은 장면이면 같은 객체', () => {
    const scene: Scene = {
      nodes: [
        { type: 'element', id: 'k', kind: 'key', frame: frame(0) } as Node,
      ],
    };
    expect(treeModeArrays(scene).keySlots).toEqual(['']);
    expect(treeModeArrays(scene)).toBe(treeModeArrays(scene));
    expect(treeModeArrays(undefined)).toEqual({
      keySlots: [],
      keyPositions: [],
      itemArrays: {
        statPositions: [],
        graphPositions: [],
        knobPositions: [],
        spritePositions: [],
      },
    });
  });
});
