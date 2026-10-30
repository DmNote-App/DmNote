import { describe, expect, it, vi } from 'vitest';

import type { Node, Scene } from '@src/types/generated/elementDocument';
import {
  documentElementSlots,
  documentLayoutElements,
  treeStackingRanks,
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

describe('트리 순서로 쌓기', () => {
  it('모든 요소(숨김·플러그인 포함)의 트리 순번이 zIndex - 숨긴 것·숨긴 그룹 안은 그리지 않는다', () => {
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
        { type: 'element', id: 'demo::i1', kind: 'plugin:demo', frame } as Node,
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
      ['t1', 2],
      ['t2', 6],
    ]);
    expect([...treeStackingRanks(scene)]).toEqual([
      ['bottom', 0],
      ['k1', 1],
      ['t1', 2],
      ['in-hidden-group', 3],
      ['demo::i1', 4],
      ['k2', 5],
      ['t2', 6],
      ['hidden', 7],
    ]);
    // 같은 장면이면 같은 표
    expect(treeStackingRanks(scene)).toBe(treeStackingRanks(scene));
  });

  it('흩어진 옛 그룹이 있어도 저장된 zIndex가 아니라 트리 순서로 쌓는다', () => {
    const scene: Scene = {
      nodes: [
        tracker('bottom'),
        legacyKey('a', 7, 0),
        legacyKey('b', 3, 1),
        tracker('t1'),
        legacyKey('c', 12, 2),
      ],
    };
    const slots = (stackNatives?: boolean) =>
      documentElementSlots(scene, {
        legacyKinds: new Set(['key']),
        stackNatives,
      }).map(({ element, zIndex, aboveLegacy }) => [
        element.id,
        zIndex,
        aboveLegacy,
      ]);
    // 편집 화면 - 옛 종류는 아래 칸, 위에 옛 종류가 깔린 트리 전용 종류는 쌓인 칸
    expect(slots()).toEqual([
      ['bottom', 0, false],
      ['a', 1, false],
      ['b', 2, false],
      ['t1', 3, true],
      ['c', 4, false],
    ]);
    // 오버레이 - 옛 종류도 쌓인 칸(노트 트랙 위)
    expect(slots(true)).toEqual([
      ['bottom', 0, false],
      ['a', 1, true],
      ['b', 2, true],
      ['t1', 3, true],
      ['c', 4, true],
    ]);
    // 오버레이 - 옛 종류보다 아래 칸은 노트 트랙 아래에 남도록 0
    const below: Scene = {
      nodes: [tracker('b1'), tracker('b2'), legacyKey('k', 1, 0)],
    };
    expect(
      documentElementSlots(below, {
        legacyKinds: new Set(['key']),
        stackNatives: true,
      }).map(({ element, zIndex }) => [element.id, zIndex]),
    ).toEqual([
      ['b1', 0],
      ['b2', 0],
      ['k', 2],
    ]);
    // 그리지 않는 옛 종류도 순번을 차지한다
    expect(
      documentElementSlots(scene, { legacyKinds: new Set() }).map(
        ({ element, zIndex }) => [element.id, zIndex],
      ),
    ).toEqual([
      ['bottom', 0],
      ['t1', 3],
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
      documentElementSlots(scene, { stackNatives: true }).map(
        ({ element }) => element.id,
      ),
    ).toEqual(['t1']);
  });
});
