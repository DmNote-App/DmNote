/**
 * 캔버스 클릭 시 그룹 멤버 확장 선택 공용 로직
 * Grid.tsx(native 클릭)와 PluginElement.tsx(플러그인 클릭)에서 공유
 */

import { selectOtherMembers } from '@stores/grid/keepOtherSelection';
import { isLegacyEditedType } from '@src/types/elementKinds';
import type { SelectedElement } from '@stores/grid/useGridSelectionStore';
import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  EDITOR_ELEMENT_TYPES,
  modeArraysOf,
  type EditorElementTypeV1,
  type ElementModeArrays,
} from '@src/types/editor';
import { captureElementCollections } from '@src/renderer/editor/model/elementStores';
import type { LayerGroupDef } from '@src/types/layerGroups';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import { isPluginVisibleInMode } from '@utils/layerGroupUtils';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useLayerGroupStore } from '@stores/data/useLayerGroupStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';

// 그룹 판정에 필요한 native 위치 최소 형태 (sprite는 groupId를 null로 저장)
type GroupablePositionLike = { id: string; groupId?: string | null };

// 그룹 판정에 필요한 플러그인 요소 최소 형태
type PluginGroupSelectableLike = Pick<
  PluginDisplayElementInternal,
  'fullId' | 'tabId' | 'groupId'
>;

export type GroupSelectionSource = ElementModeArrays<
  GroupablePositionLike | null | undefined
> & {
  mode: string;
  pluginElements: readonly PluginGroupSelectableLike[];
  // 현재 모드의 그룹 def 목록 - def가 없는 groupId는 확장하지 않는다
  modeGroups: readonly Pick<LayerGroupDef, 'id'>[];
};

export type SelectionGroupingSummary =
  | { kind: 'none' }
  | { kind: 'same'; groupId: string }
  | { kind: 'mixed' };

const modeArrayOf = (source: GroupSelectionSource, type: EditorElementTypeV1) =>
  source[EDITOR_ELEMENT_POSITION_FIELDS[type]];

const resolveClickedGroupId = (
  clicked: SelectedElement,
  source: GroupSelectionSource,
): string | undefined => {
  if (clicked.type === 'plugin') {
    return source.pluginElements.find((el) => el.fullId === clicked.id)
      ?.groupId;
  }
  return (
    modeArrayOf(source, clicked.type).find((pos) => pos?.id === clicked.id)
      ?.groupId ?? undefined
  );
};

const resolveSelectionGroupId = (
  element: SelectedElement,
  source: GroupSelectionSource,
  modeGroupIds: ReadonlySet<string>,
): string | undefined => {
  if (element.type === 'plugin') {
    const groupId = source.pluginElements.find(
      (candidate) => candidate.fullId === element.id,
    )?.groupId;
    return groupId && modeGroupIds.has(groupId) ? groupId : undefined;
  }

  return modeArrayOf(source, element.type).find(
    (position) => position?.id === element.id,
  )?.groupId;
};

/**
 * 선택 집합의 그룹 메뉴 상태를 계산한다.
 * native의 기존 dangling groupId는 해제 대상으로 유지하고, plugin은 현재 모드에
 * 정의된 그룹만 유효하게 보는 기존 캔버스 계약을 보존한다.
 */
export const summarizeSelectionGrouping = (
  selectedElements: readonly SelectedElement[],
  source: GroupSelectionSource,
): SelectionGroupingSummary => {
  const modeGroupIds = new Set(source.modeGroups.map((group) => group.id));
  let firstGroupId: string | undefined;
  let anyInGroup = false;
  let allInSameGroup = true;

  selectedElements.forEach((element, index) => {
    const groupId = resolveSelectionGroupId(element, source, modeGroupIds);
    if (groupId) anyInGroup = true;
    if (index === 0) {
      firstGroupId = groupId;
    } else if (groupId !== firstGroupId) {
      allInSameGroup = false;
    }
  });

  if (anyInGroup && allInSameGroup && firstGroupId) {
    return { kind: 'same', groupId: firstGroupId };
  }
  if (!anyInGroup) return { kind: 'none' };
  return { kind: 'mixed' };
};

/**
 * 클릭 요소의 그룹 멤버 전체를 SelectedElement 배열로 확장
 * - 클릭 요소가 항상 선두 (native·플러그인 클릭 공통 계약)
 * - dangling groupId(그룹 def 없음)는 확장하지 않음 (읽기 가드와 동일)
 * - 플러그인 멤버는 현재 모드에서 보이는 것만 포함 (컨텍스트 메뉴 판정과 동일 규칙)
 */
export const expandGroupSelection = (
  clicked: SelectedElement,
  source: GroupSelectionSource,
): SelectedElement[] => {
  const selection: SelectedElement[] = [clicked];
  const groupId = resolveClickedGroupId(clicked, source);
  if (!groupId || !source.modeGroups.some((group) => group.id === groupId)) {
    return selection;
  }

  // 트리로 옮긴 옛 종류 멤버는 트리 선택이 고른다 (treeEditedGroupMemberIds)
  EDITOR_ELEMENT_TYPES.filter(isLegacyEditedType).forEach((memberType) => {
    modeArrayOf(source, memberType).forEach((pos, index) => {
      if (!pos || pos.groupId !== groupId) return;
      if (clicked.type === memberType && clicked.id === pos.id) return;
      selection.push({ type: memberType, id: pos.id, index });
    });
  });
  source.pluginElements.forEach((el) => {
    if (el.groupId !== groupId) return;
    if (!isPluginVisibleInMode(el, source.mode)) return;
    if (clicked.type === 'plugin' && clicked.id === el.fullId) return;
    selection.push({ type: 'plugin', id: el.fullId });
  });
  return selection;
};

/** 클릭 요소의 옛 그룹 안에서 트리로 옮긴 옛 종류 멤버 id - 트리 선택으로 함께 고른다 */
export const treeEditedGroupMemberIds = (
  clicked: SelectedElement,
  source: GroupSelectionSource,
): string[] => {
  const groupId = resolveClickedGroupId(clicked, source);
  if (!groupId || !source.modeGroups.some((group) => group.id === groupId)) {
    return [];
  }
  return EDITOR_ELEMENT_TYPES.filter(
    (type) => !isLegacyEditedType(type),
  ).flatMap((memberType) =>
    modeArrayOf(source, memberType).flatMap((pos) =>
      pos && pos.groupId === groupId ? [pos.id] : [],
    ),
  );
};

// 스토어 스냅샷 기반 편의 래퍼 - 컬렉션을 직접 들고 있지 않은 호출부용
const sourceFromStores = (mode: string): GroupSelectionSource => ({
  mode,
  ...modeArraysOf(
    {
      ...captureElementCollections(),
      // 키는 렌더 positions 기준
      keyPositions: useKeyStore.getState().positions,
    },
    mode,
  ),
  pluginElements: usePluginDisplayElementStore.getState().elements,
  modeGroups: useLayerGroupStore.getState().layerGroups[mode] || [],
});

export const expandGroupSelectionFromStores = (
  clicked: SelectedElement,
  mode: string,
): SelectedElement[] => expandGroupSelection(clicked, sourceFromStores(mode));

/** 옛 그룹째 고른 뒤 부른다 - 그 그룹의 트리로 옮긴 옛 종류 멤버를 트리 선택으로 함께 고른다 */
export const selectTreeEditedGroupMembersFromStores = (
  clicked: SelectedElement,
  mode: string,
) =>
  selectOtherMembers(
    mode,
    treeEditedGroupMemberIds(clicked, sourceFromStores(mode)),
  );
