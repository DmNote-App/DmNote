import { describe, expect, it } from 'vitest';

import type { Node, Scene } from '@src/types/generated/elementDocument';
import {
  documentElementSlots,
  documentLayoutElements,
} from './documentElementOrder';

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
      ['bottom', 3],
      ['t1', 5],
      ['t2', 3],
    ]);
  });
  it('오버레이는 트리에서 그리는 옛 종류(노브)를 자기 zIndex로 넣고 편집 화면은 뺀다', () => {
    const knob = (id: string, zIndex: number | null, index: number) =>
      ({ ...legacyKey(id, zIndex, index), kind: 'knob' } as Node);
    const scene: Scene = {
      nodes: [
        legacyKey('k1', 5, 0),
        knob('n1', 7, 0),
        tracker('t1'),
        knob('n2', null, 1),
        { ...(knob('n3', 2, 2) as object), hidden: true } as Node,
      ],
    };
    const ids = (slots: ReturnType<typeof documentElementSlots>) =>
      slots.map(({ element, zIndex }) => [element.id, zIndex]);
    expect(ids(documentElementSlots(scene))).toEqual([['t1', 7]]);
    expect(ids(documentElementSlots(scene, { overlay: true }))).toEqual([
      ['n1', 7],
      ['t1', 7],
      ['n2', 1],
    ]);
  });
});

describe('오버레이 창 크기용 트리 요소 상자', () => {
  it('상자가 같으면 장면이 바뀌어도 같은 배열을 돌려준다', () => {
    const first = documentLayoutElements(
      { nodes: [legacyKey('k1', 1, 0), tracker('t1')] },
      'layout-test',
    );
    // 옛 종류 요소만 바뀐 패치
    const legacyMoved = documentLayoutElements(
      {
        nodes: [
          { ...legacyKey('k1', 1, 0), frame: { ...frame, x: 50 } } as Node,
          tracker('t1'),
        ],
      },
      'layout-test',
    );
    expect(legacyMoved).toBe(first);
    const trackerMoved = documentLayoutElements(
      {
        nodes: [
          legacyKey('k1', 1, 0),
          { ...tracker('t1'), frame: { ...frame, x: 5 } } as Node,
        ],
      },
      'layout-test',
    );
    expect(trackerMoved).not.toBe(first);
    expect(trackerMoved[0].position).toEqual({ x: 5, y: 0 });
  });
});
