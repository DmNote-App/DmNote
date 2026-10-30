/**
 * 레이어 패널 모델 빌더 — 순수 함수
 * LayerTabContent에서 사용하는 layerItems / displayItems 생성
 */

import { slotDisplayName } from '@utils/keySlot';
import { isLegacyEditedType } from '@src/types/elementKinds';
import type { KeyMappings } from '@src/types/key/keys';
import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  ITEM_ELEMENT_TYPES,
  type CanonicalEditorDocumentV1,
  type CanonicalPositionOf,
  type ItemElementType,
} from '@src/types/editor';
import type { ItemElementCollections } from '@src/renderer/editor/model/elementStores';
import { getStatTypeLabel } from '@utils/grid/statTypeLabel';
import type { PluginPanelElementView } from '@src/types/plugin/api';
import type { LayerGroupDef } from '@src/types/layerGroups';
import type { LayerItem, DisplayItem } from '../types';
import { isPluginVisibleInMode } from '@utils/layerGroupUtils';

// ============================================================================
// layerItems 생성
// ============================================================================

type BuildLayerItemsParams = ItemElementCollections & {
  selectedKeyType: string;
  positions: CanonicalEditorDocumentV1['keyPositions'];
  keyMappings: KeyMappings;
  pluginElements: PluginPanelElementView[];
  layerGroupsForMode: LayerGroupDef[];
};

// 키 외 종류별 레이어 기본 이름
export const ITEM_LAYER_DEFAULT_NAMES: {
  [K in ItemElementType]: (
    position: CanonicalPositionOf<K>,
    index: number,
  ) => string;
} = {
  stat: (position) => getStatTypeLabel(position.statType),
  graph: (position) => `${getStatTypeLabel(position.statType)} Graph`,
  knob: (_position, index) => `Knob ${index + 1}`,
  sprite: (_position, index) => `Sprite ${index + 1}`,
};

export function buildLayerItems(params: BuildLayerItemsParams): LayerItem[] {
  const {
    selectedKeyType,
    positions,
    keyMappings,
    pluginElements,
    layerGroupsForMode,
  } = params;
  const items: LayerItem[] = [];

  // 키 아이템
  const currentPositions = positions[selectedKeyType] || [];
  const currentKeyMappings = keyMappings[selectedKeyType] || [];
  currentPositions.forEach((pos, index) => {
    const slot = currentKeyMappings[index] ?? '';
    const defaultName = slotDisplayName(slot) || `Key ${index + 1}`;
    items.push({
      type: 'key',
      id: pos.id,
      index,
      name: pos.layerName || defaultName,
      zIndex: pos.zIndex ?? index,
      hidden: !!pos.hidden,
      groupId: pos.groupId,
    });
  });

  // 키 외 종류 아이템 (종류 순서)
  for (const type of ITEM_ELEMENT_TYPES.filter(isLegacyEditedType)) {
    const defaultName = ITEM_LAYER_DEFAULT_NAMES[type] as (
      position: never,
      index: number,
    ) => string;
    (
      (params[EDITOR_ELEMENT_POSITION_FIELDS[type]][selectedKeyType] ||
        []) as Array<{
        id: string;
        layerName?: string | null;
        zIndex?: number | null;
        hidden?: boolean;
        groupId?: string | null;
      }>
    ).forEach((pos, index) => {
      items.push({
        type,
        id: pos.id,
        index,
        name: pos.layerName || defaultName(pos as never, index),
        zIndex: pos.zIndex ?? index,
        hidden: !!pos.hidden,
        groupId: pos.groupId ?? undefined,
      });
    });
  }

  // 플러그인 아이템 - 그룹은 모드 스코프라 현재 모드에 def가 있는 groupId만
  // 노출 (dangling group_id의 유령 헤더 방지)
  const validGroupIds = new Set(layerGroupsForMode.map((group) => group.id));
  pluginElements
    .filter((el) => isPluginVisibleInMode(el, selectedKeyType))
    .forEach((el) => {
      items.push({
        type: 'plugin',
        id: el.fullId,
        name: el.definitionId || 'Plugin',
        zIndex: el.zIndex ?? 0,
        hidden: !!el.hidden,
        groupId:
          el.groupId && validGroupIds.has(el.groupId) ? el.groupId : undefined,
      });
    });

  // z-index 내림차순 정렬
  items.sort((a, b) => b.zIndex - a.zIndex);

  return items;
}

// ============================================================================
// displayItems 생성
// ============================================================================

interface BuildDisplayItemsParams {
  layerItems: LayerItem[];
  layerGroupsForMode: LayerGroupDef[];
  collapsedGroups: Set<string>;
  defaultGroupName: string;
}

export function buildDisplayItems({
  layerItems,
  layerGroupsForMode,
  collapsedGroups,
  defaultGroupName,
}: BuildDisplayItemsParams): DisplayItem[] {
  const result: DisplayItem[] = [];
  const seenGroups = new Set<string>();

  // 그룹별 자식 아이템 사전 수집
  const groupChildren = new Map<string, LayerItem[]>();
  layerItems.forEach((item) => {
    if (item.groupId) {
      const children = groupChildren.get(item.groupId) || [];
      children.push(item);
      groupChildren.set(item.groupId, children);
    }
  });

  let flatIdx = 0;
  layerItems.forEach((item) => {
    if (item.groupId) {
      if (!seenGroups.has(item.groupId)) {
        seenGroups.add(item.groupId);
        const groupDef = layerGroupsForMode.find((g) => g.id === item.groupId);
        const children = groupChildren.get(item.groupId) || [];
        const isCollapsed = collapsedGroups.has(item.groupId);
        const allHidden = children.every((c) => c.hidden);

        result.push({
          displayType: 'group-header',
          groupId: item.groupId,
          groupName: groupDef?.name || defaultGroupName,
          isCollapsed,
          childCount: children.length,
          allHidden,
        });

        if (!isCollapsed) {
          children.forEach((child) => {
            const childFlatIdx = layerItems.indexOf(child);
            result.push({
              displayType: 'layer',
              item: child,
              groupDepth: 1,
              flatIndex: childFlatIdx,
            });
          });
        }
      }
    } else {
      result.push({
        displayType: 'layer',
        item,
        groupDepth: 0,
        flatIndex: flatIdx,
      });
    }
    flatIdx++;
  });

  return result;
}
