import type { SelectedElement } from '@stores/grid/useGridSelectionStore';
import type { LayerGroups, LayerGroupDef } from '@src/types/layerGroups';
import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  EDITOR_ELEMENT_TYPES,
  isEditorElementType,
  pickElementCollections,
} from '@src/types/editor';
import type {
  EditorElementGroupTargetV1,
  EditorElementPositionField,
  EditorElementTypeV1,
  EditorTargetLayerGroupV1,
  ElementCollections,
} from '@src/types/editor';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import type { ReactiveSpritePosition } from '@src/types/key/sprites';
import { normalizePluginInstanceTabId } from '@plugins/runtime/displayElement/instanceLifecycle';
import { toSpriteWireShape } from '@utils/sprite/spriteWireShape';

export const isPluginVisibleInMode = (
  element: Pick<PluginDisplayElementInternal, 'tabId'>,
  mode: string,
): boolean => !element.tabId || element.tabId === mode;

/** 그룹 멤버 집계용 플러그인 요소 최소 형태 (내부 요소·패널 뷰 공용) */
export type PluginGroupMemberLike = Pick<
  PluginDisplayElementInternal,
  'tabId' | 'groupId'
>;

// 플러그인 그룹 멤버십의 모드 판정 - 저장 규칙(tab_id normalize)과 동일.
// Rust remove_empty_layer_groups의 판정과 반드시 일치해야 커밋마다
// 가짜 diff가 생기지 않는다 (드리프트 금지)
export const isPluginGroupMemberInMode = (
  element: Pick<PluginDisplayElementInternal, 'tabId'>,
  mode: string,
): boolean => normalizePluginInstanceTabId(element.tabId) === mode;

type Groupable = SelectedElement & {
  type: EditorElementTypeV1;
};

function isGroupableElement(el: SelectedElement): el is Groupable {
  return isEditorElementType(el.type);
}

// 종류 공통으로 다루는 position 최소 형태
type LayerPosition = {
  id: string;
  groupId?: string | null;
  zIndex?: number | null;
};
type ModePositions = Record<EditorElementTypeV1, LayerPosition[]>;
type LooseCollections = Record<
  EditorElementPositionField,
  Record<string, LayerPosition[] | undefined>
>;

const modeListOf = (
  collections: ElementCollections,
  type: EditorElementTypeV1,
  mode: string,
): readonly LayerPosition[] =>
  (collections as unknown as LooseCollections)[
    EDITOR_ELEMENT_POSITION_FIELDS[type]
  ][mode] || [];

// 종류별 현재 모드 배열 복사본
const copyModePositions = (
  collections: ElementCollections,
  mode: string,
): ModePositions =>
  Object.fromEntries(
    EDITOR_ELEMENT_TYPES.map((type) => [
      type,
      [...modeListOf(collections, type, mode)],
    ]),
  ) as ModePositions;

// 모든 컬렉션을 복사하고 replaced 종류만 모드 배열을 교체
const withModePositions = (
  collections: ElementCollections,
  mode: string,
  modePositions: ModePositions,
  replaced: (type: EditorElementTypeV1) => boolean,
): ElementCollections =>
  Object.fromEntries(
    EDITOR_ELEMENT_TYPES.map((type) => {
      const field = EDITOR_ELEMENT_POSITION_FIELDS[type];
      const record = collections[field];
      return [
        field,
        replaced(type)
          ? { ...record, [mode]: modePositions[type] }
          : { ...record },
      ];
    }),
  ) as unknown as ElementCollections;

// 그룹 소속 갱신 - 스프라이트는 wire 정규화(해제는 groupId 키 부재로 ack와 일치)
const withGroupId = (
  type: EditorElementTypeV1,
  position: LayerPosition,
  groupId: string | undefined,
): LayerPosition =>
  type === 'sprite'
    ? (toSpriteWireShape({
        ...(position as unknown as ReactiveSpritePosition),
        groupId,
      }) as unknown as LayerPosition)
    : { ...position, groupId };

function getElementGroupId(
  mode: string,
  element: Groupable,
  collections: ElementCollections,
): string | undefined {
  return (
    modeListOf(collections, element.type, mode).find(
      ({ id }) => id === element.id,
    )?.groupId ?? undefined
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectModeGroupMemberCounts(
  mode: string,
  collections: ElementCollections,
  pluginElements: readonly PluginGroupMemberLike[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (groupId?: string | null) => {
    if (!groupId) return;
    counts.set(groupId, (counts.get(groupId) || 0) + 1);
  };

  for (const type of EDITOR_ELEMENT_TYPES) {
    modeListOf(collections, type, mode).forEach((pos) => add(pos?.groupId));
  }
  // 플러그인 멤버도 그룹 생존에 기여 - 모드 판정은 저장 규칙과 동일
  pluginElements.forEach((element) => {
    if (isPluginGroupMemberInMode(element, mode)) add(element.groupId);
  });

  return counts;
}

export function buildNextLayerGroupName(
  baseLabel: string,
  groups: LayerGroupDef[],
): string {
  const normalizedBase = (baseLabel || 'New Group').trim() || 'New Group';
  const pattern = new RegExp(`^${escapeRegExp(normalizedBase)}\\s+(\\d+)$`);
  const usedNumbers = new Set<number>();

  groups.forEach((group) => {
    const match = group.name.match(pattern);
    if (!match) return;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) {
      usedNumbers.add(value);
    }
  });

  let next = 1;
  while (usedNumbers.has(next)) {
    next += 1;
  }

  return `${normalizedBase} ${next}`;
}

export function resolveSingleGroupIdFromSelection(
  mode: string,
  selectedElements: SelectedElement[],
  collections: ElementCollections,
): string | undefined {
  const groupIds = new Set<string>();

  selectedElements.forEach((element) => {
    if (!isGroupableElement(element)) return;
    const groupId = getElementGroupId(mode, element, collections);
    if (groupId) {
      groupIds.add(groupId);
    }
  });

  if (groupIds.size !== 1) return undefined;
  return Array.from(groupIds)[0];
}

type ApplyGroupIdResult = ElementCollections & {
  changed: boolean;
};

export function applyGroupIdToSelectedElements(
  params: ElementCollections & {
    mode: string;
    selectedElements: SelectedElement[];
    targetGroupId: string | undefined;
  },
): ApplyGroupIdResult {
  const { mode, selectedElements, targetGroupId } = params;

  const modePositions = copyModePositions(params, mode);
  const changedTypes = new Set<EditorElementTypeV1>();

  selectedElements.forEach((element) => {
    if (!isGroupableElement(element)) return;
    const list = modePositions[element.type];
    const index = list.findIndex(({ id }) => id === element.id);
    const current = list[index];
    // 명시 null 이력까지 undefined로 접어 동치 비교
    if (!current || (current.groupId ?? undefined) === targetGroupId) return;
    list[index] = withGroupId(element.type, current, targetGroupId);
    changedTypes.add(element.type);
  });

  const changed = changedTypes.size > 0;
  return {
    ...(changed
      ? withModePositions(params, mode, modePositions, (type) =>
          changedTypes.has(type),
        )
      : pickElementCollections(params)),
    changed,
  };
}

export type StableElementGroupProjection = ElementCollections & {
  layerGroups: LayerGroups;
  changed: boolean;
};

export function projectStableElementGroups(
  params: ElementCollections & {
    mode: string;
    targets: readonly EditorElementGroupTargetV1[];
    targetGroup: EditorTargetLayerGroupV1 | null;
    layerGroups: LayerGroups;
    // normalize의 플러그인 멤버 집계 - 혼합 그룹화는 최종 소속 상태를 전달
    pluginElements: readonly PluginGroupMemberLike[];
  },
): StableElementGroupProjection | null {
  const { mode, targets, targetGroup, layerGroups, pluginElements } = params;
  const selectedElements: SelectedElement[] = [];
  for (const target of targets) {
    const positions = modeListOf(params, target.elementType, mode);
    const index = positions.findIndex((position) => position?.id === target.id);
    if (index < 0) return null;
    selectedElements.push({
      type: target.elementType,
      id: target.id,
      index,
    });
  }

  const currentModeGroups = layerGroups[mode] ?? [];
  let nextLayerGroups = layerGroups;
  if (targetGroup?.kind === 'existing') {
    if (!currentModeGroups.some((group) => group.id === targetGroup.id)) {
      return null;
    }
  } else if (targetGroup?.kind === 'create') {
    const existing = currentModeGroups.find(
      (group) => group.id === targetGroup.id,
    );
    if (existing) return null;
    nextLayerGroups = {
      ...layerGroups,
      [mode]: [
        ...currentModeGroups,
        { id: targetGroup.id, name: targetGroup.name },
      ],
    };
  }

  const grouped = applyGroupIdToSelectedElements({
    ...pickElementCollections(params),
    mode,
    selectedElements,
    targetGroupId: targetGroup?.id,
  });
  const targetTypes = new Set(targets.map((target) => target.elementType));
  const normalized = normalizeLayerGroupsForMode({
    ...(Object.fromEntries(
      EDITOR_ELEMENT_TYPES.map((type) => {
        const field = EDITOR_ELEMENT_POSITION_FIELDS[type];
        return [field, targetTypes.has(type) ? grouped[field] : params[field]];
      }),
    ) as unknown as ElementCollections),
    mode,
    layerGroups: nextLayerGroups,
    pluginElements,
  });
  return {
    ...pickElementCollections(normalized),
    layerGroups: normalized.layerGroups,
    changed:
      grouped.changed ||
      normalized.positionsChanged ||
      normalized.groupsChanged ||
      nextLayerGroups !== layerGroups,
  };
}

export function projectLayerGroupRename(params: {
  mode: string;
  groupId: string;
  name: string;
  layerGroups: LayerGroups;
}): LayerGroups | null {
  const modeGroups = params.layerGroups[params.mode] ?? [];
  if (!modeGroups.some((group) => group.id === params.groupId)) return null;
  return {
    ...params.layerGroups,
    [params.mode]: modeGroups.map((group) =>
      group.id === params.groupId ? { ...group, name: params.name } : group,
    ),
  };
}

type NormalizeLayerGroupsResult = ElementCollections & {
  layerGroups: LayerGroups;
  positionsChanged: boolean;
  groupsChanged: boolean;
  removedGroupIds: string[];
};

export function normalizeLayerGroupsForMode(
  params: ElementCollections & {
    mode: string;
    layerGroups: LayerGroups;
    // 플러그인 멤버 집계 - Rust remove_empty_layer_groups와 동일 규칙 필수
    pluginElements: readonly PluginGroupMemberLike[];
  },
): NormalizeLayerGroupsResult {
  const { mode, layerGroups, pluginElements } = params;

  const currentModeGroups = layerGroups[mode] || [];
  const modePositions = copyModePositions(params, mode);

  const initialCounts = collectModeGroupMemberCounts(
    mode,
    params,
    pluginElements,
  );
  const groupsToDissolve = new Set<string>();

  initialCounts.forEach((count, groupId) => {
    if (count === 0) {
      groupsToDissolve.add(groupId);
    }
  });
  currentModeGroups.forEach((group) => {
    const count = initialCounts.get(group.id) || 0;
    if (count === 0) {
      groupsToDissolve.add(group.id);
    }
  });

  let positionsChanged = false;
  if (groupsToDissolve.size > 0) {
    const shouldClear = (groupId?: string | null) =>
      !!groupId && groupsToDissolve.has(groupId);

    for (const type of EDITOR_ELEMENT_TYPES) {
      const list = modePositions[type];
      list.forEach((pos, index) => {
        if (!shouldClear(pos?.groupId)) return;
        list[index] = withGroupId(type, pos, undefined);
        positionsChanged = true;
      });
    }
  }

  const collections = positionsChanged
    ? withModePositions(params, mode, modePositions, () => true)
    : pickElementCollections(params);

  const finalCounts = collectModeGroupMemberCounts(
    mode,
    collections,
    pluginElements,
  );
  const nextModeGroups = currentModeGroups.filter(
    (group) => (finalCounts.get(group.id) || 0) >= 1,
  );
  const removedGroupIds = currentModeGroups
    .filter((group) => !nextModeGroups.some((next) => next.id === group.id))
    .map((group) => group.id);

  const groupsChanged = removedGroupIds.length > 0;
  const nextLayerGroups = groupsChanged
    ? {
        ...layerGroups,
        [mode]: nextModeGroups,
      }
    : layerGroups;

  return {
    ...collections,
    layerGroups: nextLayerGroups,
    positionsChanged,
    groupsChanged,
    removedGroupIds,
  };
}

// ============================================================================
// 레이어 순서 유틸 (paste / reorder 공용)
// ============================================================================

export interface LayerItemForOrder {
  type: EditorElementTypeV1 | 'plugin';
  id: string;
  index?: number;
  zIndex: number;
  groupId?: string;
}

/** 요소 컬렉션과 플러그인에서 아이템을 수집하고 zIndex 내림차순 정렬 */
export function buildLayerItemsForMode(
  mode: string,
  collections: ElementCollections,
  pluginElements: PluginDisplayElementInternal[],
): LayerItemForOrder[] {
  const items: LayerItemForOrder[] = [];

  for (const type of EDITOR_ELEMENT_TYPES) {
    modeListOf(collections, type, mode).forEach((pos, index) => {
      items.push({
        type,
        id: pos.id,
        index,
        zIndex: pos.zIndex ?? index,
        groupId: pos.groupId ?? undefined,
      });
    });
  }

  pluginElements
    .filter((el) => isPluginVisibleInMode(el, mode))
    .forEach((el) => {
      items.push({
        type: 'plugin',
        id: el.fullId,
        zIndex: el.zIndex ?? 0,
        groupId: el.groupId,
      });
    });

  items.sort((a, b) => b.zIndex - a.zIndex);
  return items;
}

/** 선택 상태 기반으로 paste 앵커 위치 결정 (선택된 레이어 바로 위에 삽입) */
export function findPasteAnchorIndex(
  orderedItems: LayerItemForOrder[],
  selectedElements: SelectedElement[],
  selectedGroupIds: string[],
): number {
  if (orderedItems.length === 0) return 0;

  const idToIndex = new Map<string, number>();
  const groupTopIndex = new Map<string, number>();

  orderedItems.forEach((item, idx) => {
    idToIndex.set(item.id, idx);
    // 그룹의 첫 자식 = zIndex 내림차순에서 가장 위
    if (item.groupId && !groupTopIndex.has(item.groupId)) {
      groupTopIndex.set(item.groupId, idx);
    }
  });

  let anchor = Number.POSITIVE_INFINITY;

  for (const el of selectedElements) {
    const idx = idToIndex.get(el.id);
    if (idx !== undefined && idx < anchor) anchor = idx;
  }

  for (const gid of selectedGroupIds) {
    const idx = groupTopIndex.get(gid);
    if (idx !== undefined && idx < anchor) anchor = idx;
  }

  return Number.isFinite(anchor) ? anchor : 0;
}

export type ZIndexPatchResult = ElementCollections & {
  pluginUpdates: Array<{ fullId: string; zIndex: number }>;
};

/** 정렬된 아이템 배열에 maxZIndex - idx 패턴으로 zIndex 일괄 재부여 */
export function applyZIndexToLayerOrder(
  orderedItems: LayerItemForOrder[],
  mode: string,
  collections: ElementCollections,
): ZIndexPatchResult {
  const maxZIndex = orderedItems.length - 1;
  const modePositions = copyModePositions(collections, mode);
  const pluginUpdates: Array<{ fullId: string; zIndex: number }> = [];

  orderedItems.forEach((item, idx) => {
    const z = maxZIndex - idx;
    if (item.type === 'plugin') {
      pluginUpdates.push({ fullId: item.id, zIndex: z });
      return;
    }
    const list = modePositions[item.type];
    const index = list.findIndex((position) => position.id === item.id);
    if (index !== -1) list[index] = { ...list[index], zIndex: z };
  });

  return {
    ...withModePositions(collections, mode, modePositions, () => true),
    pluginUpdates,
  };
}
