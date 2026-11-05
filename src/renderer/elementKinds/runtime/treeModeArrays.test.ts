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

describe('위치 목록의 칸 - 트리 칸 보기', () => {
  it('종류가 쓰는 칸(고유 값·묶음·틀·공통 정보)만, 종류가 갖지 않는 옛 칸과 옛 겹침 번호는 읽지 않는다', () => {
    const scene: Scene = {
      nodes: [
        {
          type: 'element',
          id: 'k1',
          kind: 'key',
          frame: frame(7),
          input: { type: 'key', slot: 'KeyA' },
          values: { displayText: 'A' },
          bundles: {
            note: { noteColor: '#123456', noteEffectEnabled: false },
            counter: { counter: { enabled: true } },
          },
          className: 'mine',
          legacy: {
            index: 0,
            zIndex: 9,
            fields: { graphAnimationEnabled: true },
          },
        } as unknown as Node,
      ],
    };
    const [position] = treeModeArrays(scene).keyPositions as unknown as Record<
      string,
      unknown
    >[];
    expect(position).toMatchObject({
      id: 'k1',
      dx: 7,
      displayText: 'A',
      noteColor: '#123456',
      noteEffectEnabled: false,
      counter: { enabled: true },
      className: 'mine',
      zIndex: 0,
    });
    expect(position).not.toHaveProperty('graphAnimationEnabled');
  });
});
