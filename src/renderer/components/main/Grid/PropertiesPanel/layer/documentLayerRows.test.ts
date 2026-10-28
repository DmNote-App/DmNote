import { describe, expect, it } from 'vitest';

import type { DocumentElementSlot } from '@src/renderer/elementKinds/runtime/documentElementOrder';
import type { DisplayItem, LayerItem } from '../types';
import { placeDocumentLayerRows } from './documentLayerRows';

const layer = (id: string, zIndex: number, groupId?: string): DisplayItem => ({
  displayType: 'layer',
  item: {
    type: 'key',
    id,
    name: id,
    zIndex,
    hidden: false,
    groupId,
  } as LayerItem,
  groupDepth: groupId ? 1 : 0,
  flatIndex: 0,
});

const slot = (
  id: string,
  zIndex: number,
  aboveLegacy = true,
): DocumentElementSlot => ({
  element: {
    type: 'element',
    id,
    kind: 'cursorTracker',
    frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
  },
  zIndex,
  aboveLegacy,
});

describe('레이어 목록 트리 요소 자리', () => {
  it('바로 아래 옛 요소 행 위에 놓고 맨 아래 요소는 끝에 둔다', () => {
    const items: DisplayItem[] = [
      layer('k3', 3),
      {
        displayType: 'group-header',
        groupId: 'g',
        groupName: 'g',
        isCollapsed: false,
        childCount: 1,
        allHidden: false,
      },
      layer('k2', 2, 'g'),
      layer('k0', 0),
    ];
    // 트리 순서(아래→위): bottom(z 0 아래), t1(k0 위), t2(k3 위)
    const { before, after } = placeDocumentLayerRows(items, [
      slot('bottom', -1, false),
      slot('t1', 0),
      slot('t2', 3),
    ]);
    expect(before.get(0)?.map((entry) => entry.element.id)).toEqual(['t2']);
    expect(before.get(3)?.map((entry) => entry.element.id)).toEqual(['t1']);
    expect(after.map((entry) => entry.element.id)).toEqual(['bottom']);
  });
});
