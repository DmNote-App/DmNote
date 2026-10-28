import { describe, expect, it } from 'vitest';

import type { Node, Scene } from '@src/types/generated/elementDocument';
import { documentElementSlots } from './documentElementOrder';

const frame = { x: 0, y: 0, width: 10, height: 10, rotation: 0 };

const legacyKey = (id: string, zIndex: number | null, index: number): Node => ({
  type: 'element',
  id,
  kind: 'key',
  frame,
  legacy: { index, zIndex },
});

const tracker = (id: string, hidden = false): Node => ({
  type: 'element',
  id,
  kind: 'cursorTracker',
  frame,
  hidden,
});

describe('트리 전용 요소 쌓임 순서', () => {
  it('바로 아래 옛 종류 요소의 zIndex를 따르고 숨긴 그룹 안은 뺀다', () => {
    const scene: Scene = {
      nodes: [
        tracker('bottom'),
        legacyKey('k1', 5, 0),
        tracker('t1'),
        {
          type: 'group',
          id: 'g',
          name: 'g',
          hidden: true,
          children: [tracker('in-hidden-group')],
        },
        legacyKey('k2', null, 3),
        tracker('t2'),
        tracker('hidden', true),
      ],
    };
    expect(
      documentElementSlots(scene).map(({ element, zIndex }) => [
        element.id,
        zIndex,
      ]),
    ).toEqual([
      ['bottom', 0],
      ['t1', 5],
      ['t2', 3],
    ]);
  });
});
