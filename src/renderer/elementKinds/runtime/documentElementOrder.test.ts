import { describe, expect, it, vi } from 'vitest';

import type { Node, Scene } from '@src/types/generated/elementDocument';
import {
  documentElementSlots,
  documentLayoutElements,
  treeGroupHiddenKey,
  withTreeGroupHidden,
} from './documentElementOrder';

// 키를 옛 종류 대표로 쓴다
vi.mock('@src/types/elementKinds', async (importOriginal) =>
  (await import('@src/renderer/__tests__/legacyKeyKinds')).keepKeyLegacy(
    importOriginal,
  ),
);

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
  it('트리가 그리는 옛 종류(노브)는 자기 zIndex로 넣고, 넣을 옛 종류가 없으면 뺀다', () => {
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
    expect(
      ids(documentElementSlots(scene, { legacyKinds: new Set() })),
    ).toEqual([['t1', 7]]);
    // 오버레이 - 저장된 자기 zIndex
    expect(
      ids(
        documentElementSlots(scene, {
          legacyKinds: new Set(['knob']),
          ownZIndex: true,
        }),
      ),
    ).toEqual([
      ['n1', 7],
      ['t1', 7],
      ['n2', 1],
    ]);
    // 편집 화면 - 자기 zIndex
    expect(
      ids(documentElementSlots(scene, { legacyKinds: new Set(['knob']) })),
    ).toEqual([
      ['n1', 7],
      ['t1', 7],
      ['n2', 1],
    ]);
  });

  it('편집 화면은 모든 옛 종류를 트리가 그려도 자기 zIndex로 플러그인과 같은 축에 쌓는다', () => {
    const scene: Scene = {
      nodes: [
        tracker('bottom'),
        legacyKey('a', 7, 0),
        // 흩어진 옛 그룹은 트리에서 모이므로 트리 순서와 zIndex가 어긋날 수 있다
        legacyKey('b', 3, 1),
        tracker('t1'),
        legacyKey('c', 12, 2),
      ],
    };
    const slots = (legacyZIndexes?: ReadonlyMap<string, number>) =>
      documentElementSlots(scene, {
        legacyKinds: new Set(['key', 'knob']),
        legacyZIndexes,
      }).map(({ element, zIndex, aboveLegacy }) => [
        element.id,
        zIndex,
        aboveLegacy,
      ]);
    expect(slots()).toEqual([
      ['bottom', 3, false],
      ['a', 7, false],
      ['b', 3, false],
      ['t1', 3, true],
      ['c', 12, false],
    ]);
    // 낙관 반영된 옛 컬렉션 값이 먼저다
    expect(slots(new Map([['b', 9]]))).toEqual([
      ['bottom', 3, false],
      ['a', 7, false],
      ['b', 9, false],
      ['t1', 9, true],
      ['c', 12, false],
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

describe('숨긴 트리 그룹 안 요소', () => {
  it('숨김 열쇠는 내용이 같으면 같고, 옛 배열의 그 요소만 hidden으로 (없으면 같은 배열)', () => {
    const scene: Scene = {
      nodes: [
        legacyKey('k1', 1, 0),
        {
          type: 'group',
          id: 'g',
          name: 'g',
          hidden: true,
          children: [legacyKey('k2', 2, 1)],
        },
      ],
    };
    const key = treeGroupHiddenKey(scene);
    expect(key).toBe('k2');
    expect(treeGroupHiddenKey({ ...scene })).toBe(key);
    const positions = [{ id: 'k1' }, { id: 'k2' }];
    expect(withTreeGroupHidden(positions, key)).toEqual([
      { id: 'k1' },
      { id: 'k2', hidden: true },
    ]);
    expect(withTreeGroupHidden(positions, '')).toBe(positions);
  });
});

describe('플러그인 인스턴스 요소', () => {
  it('옛 플러그인 렌더러가 그리므로 트리 슬롯에서 빠진다', () => {
    const scene: Scene = {
      nodes: [
        tracker('t1'),
        { type: 'element', id: 'demo::i1', kind: 'plugin:demo', frame } as Node,
      ],
    };
    expect(
      documentElementSlots(scene).map(({ element }) => element.id),
    ).toEqual(['t1']);
    expect(
      documentElementSlots(scene, { ownZIndex: true }).map(
        ({ element }) => element.id,
      ),
    ).toEqual(['t1']);
  });
});
