import { describe, expect, it } from 'vitest';

import type { SelectedElement } from '@stores/grid/useGridSelectionStore';
import {
  buildMixedSelectionMenuItems,
  gridAddTypeForMenuItem,
  shouldOpenMixedSelectionMenu,
} from './gridContextMenuModel';

const t = (key: string) => key;

const ids = (items: ReturnType<typeof buildMixedSelectionMenuItems>) =>
  items.map((item) => item.id);

describe('gridContextMenuModel', () => {
  it('묶기·풀기는 트리 그룹 판정대로 공통 항목 사이에 넣는다', () => {
    expect(ids(buildMixedSelectionMenuItems([], t))).toEqual([
      'delete',
      'duplicate',
      'bringToFront',
      'sendToBack',
    ]);
    expect(ids(buildMixedSelectionMenuItems(['group', 'ungroup'], t))).toEqual([
      'delete',
      'duplicate',
      'groupSelected',
      'ungroupSelected',
      'bringToFront',
      'sendToBack',
    ]);
    expect(ids(buildMixedSelectionMenuItems(['ungroup'], t))).toContain(
      'ungroupSelected',
    );
  });

  it('혼합 메뉴는 둘 이상의 현재 선택 멤버를 클릭할 때만 열린다', () => {
    const selected: SelectedElement[] = [
      { type: 'key', id: 'key:one', index: 0 },
      { type: 'plugin', id: 'plugin:one' },
    ];
    expect(shouldOpenMixedSelectionMenu(selected, 'plugin:one')).toBe(true);
    expect(shouldOpenMixedSelectionMenu(selected, 'missing')).toBe(false);
    expect(shouldOpenMixedSelectionMenu(selected.slice(0, 1), 'key:one')).toBe(
      false,
    );
  });

  it('그리드 추가 메뉴 ID를 fail-closed로 분류한다', () => {
    expect(gridAddTypeForMenuItem('add')).toBe('key');
    expect(gridAddTypeForMenuItem('addStat')).toBe('stat');
    expect(gridAddTypeForMenuItem('addGraph')).toBe('graph');
    expect(gridAddTypeForMenuItem('addKnob')).toBe('knob');
    expect(gridAddTypeForMenuItem('addSprite')).toBe('sprite');
    expect(gridAddTypeForMenuItem('addPlugin')).toBeNull();
  });
});
