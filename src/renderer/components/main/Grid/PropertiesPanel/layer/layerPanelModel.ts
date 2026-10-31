/**
 * 레이어 패널 이름표 — 순수 함수
 * 행 순서·그룹은 트리가 정하고, 이름이 비었을 때의 기본 이름과 플러그인 요소의 표시 상태만 옛 컬렉션에서 읽는다
 */

import { slotDisplayName } from '@utils/keySlot';
import type { KeyMappings } from '@src/types/key/keys';
import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  ITEM_ELEMENT_TYPES,
  type CanonicalEditorDocumentV1,
  type CanonicalPositionOf,
  type ItemElementType,
} from '@src/types/editor';
import type { ElementCollections } from '@src/types/editor';

type ItemElementCollections = Omit<ElementCollections, 'keyPositions'>;
import { getStatTypeLabel } from '@utils/grid/statTypeLabel';
import type { PluginPanelElementView } from '@src/types/plugin/api';
import { isPluginVisibleInMode } from '@utils/layerGroupUtils';
import type { Node, Scene } from '@src/types/generated/elementDocument';

type BuildLayerLabelsParams = ItemElementCollections & {
  selectedKeyType: string;
  positions: CanonicalEditorDocumentV1['keyPositions'];
  keyMappings: KeyMappings;
  pluginElements: PluginPanelElementView[];
  // 기본 이름 번호 - 옛 배열 순번 (목록은 겹침 순서라 순번과 다르다)
  storedIndexOf?: (id: string) => number | undefined;
};

// 키 외 종류별 레이어 기본 이름
const ITEM_LAYER_DEFAULT_NAMES: {
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

export interface LayerLabels {
  // 요소 id → 이름이 비었을 때의 기본 이름
  defaultNames: Map<string, string>;
  // 플러그인 요소 fullId → 숨김 (플러그인 스토어가 낙관 반영한 값)
  pluginHidden: Map<string, boolean>;
}

export function buildLayerLabels(params: BuildLayerLabelsParams): LayerLabels {
  const {
    selectedKeyType,
    positions,
    keyMappings,
    pluginElements,
    storedIndexOf,
  } = params;
  const numberIndex = (id: string, index: number) =>
    storedIndexOf?.(id) ?? index;
  const defaultNames = new Map<string, string>();
  const pluginHidden = new Map<string, boolean>();

  const currentKeyMappings = keyMappings[selectedKeyType] || [];
  (positions[selectedKeyType] || []).forEach((position, index) => {
    defaultNames.set(
      position.id,
      slotDisplayName(currentKeyMappings[index] ?? '') ||
        `Key ${numberIndex(position.id, index) + 1}`,
    );
  });

  for (const type of ITEM_ELEMENT_TYPES) {
    const defaultName = ITEM_LAYER_DEFAULT_NAMES[type] as (
      position: never,
      index: number,
    ) => string;
    (
      (params[EDITOR_ELEMENT_POSITION_FIELDS[type]][selectedKeyType] ||
        []) as Array<{ id: string }>
    ).forEach((position, index) => {
      defaultNames.set(
        position.id,
        defaultName(position as never, numberIndex(position.id, index)),
      );
    });
  }

  pluginElements
    .filter((element) => isPluginVisibleInMode(element, selectedKeyType))
    .forEach((element) => {
      defaultNames.set(element.fullId, element.definitionId || 'Plugin');
      pluginHidden.set(element.fullId, !!element.hidden);
    });

  return { defaultNames, pluginHidden };
}

/** 요소 id → 트리에 실린 옛 배열 순번 */
export const legacyIndicesOf = (scene: Scene | undefined) => {
  const indices = new Map<string, number>();
  const visit = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      if (node.type === 'group') {
        visit(node.children);
        continue;
      }
      const index = (node.legacy as { index?: unknown } | undefined)?.index;
      if (typeof index === 'number') indices.set(node.id, index);
    }
  };
  if (scene) visit(scene.nodes);
  return indices;
};
