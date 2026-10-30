import { describe, expect, it } from 'vitest';

import { treeRoutedOps } from './treeRoutedOps';

const inScene = (id: string) => id === 'n1';

describe('트리로 옮긴 옛 종류의 옛 편집 연산 → 트리 연산', () => {
  it('위치·숨김·이름·회전·지우기는 트리 연산으로, 나머지는 옛 경로로 남긴다', () => {
    const { treeOps, legacyIndexes } = treeRoutedOps(
      [
        {
          kind: 'setBounds',
          elementType: 'knob',
          id: 'n1',
          bounds: { dx: 1, dy: 2, width: 3, height: 4 },
        },
        {
          kind: 'patchElement',
          elementType: 'knob',
          id: 'n1',
          patch: { property: 'hidden', value: true },
        },
        {
          kind: 'patchElement',
          elementType: 'knob',
          id: 'n1',
          patch: { property: 'layerName', value: null },
        },
        {
          kind: 'patchElement',
          elementType: 'knob',
          id: 'n1',
          patch: { property: 'rotation', value: 30 },
        },
        {
          kind: 'patchElement',
          elementType: 'knob',
          id: 'n1',
          patch: { property: 'sensitivity', value: 2 },
        },
        { kind: 'deleteElement', elementType: 'knob', id: 'n1' },
        // 옮기지 않은 종류 - 옛 경로
        {
          kind: 'setBounds',
          elementType: 'key',
          id: 'k1',
          bounds: { dx: 0, dy: 0, width: 1, height: 1 },
        },
      ] as never,
      { scene: '4key', isTreeEdited: (type) => type === 'knob', inScene },
    );
    expect(treeOps).toEqual([
      {
        op: 'setFrame',
        scene: '4key',
        id: 'n1',
        frame: { x: 1, y: 2, width: 3, height: 4 },
      },
      { op: 'setCommon', scene: '4key', id: 'n1', hidden: true },
      { op: 'setCommon', scene: '4key', id: 'n1', name: null },
      { op: 'setFrame', scene: '4key', id: 'n1', frame: { rotation: 30 } },
      { op: 'remove', scene: '4key', ids: ['n1'] },
    ]);
    expect([...legacyIndexes]).toEqual([4, 6]);
  });

  it('지금 장면에 없는 요소는 옛 경로로 남긴다', () => {
    const { treeOps, legacyIndexes } = treeRoutedOps(
      [{ kind: 'deleteElement', elementType: 'knob', id: 'other' }] as never,
      { scene: '4key', isTreeEdited: () => true, inScene },
    );
    expect(treeOps).toEqual([]);
    expect([...legacyIndexes]).toEqual([0]);
  });
});
