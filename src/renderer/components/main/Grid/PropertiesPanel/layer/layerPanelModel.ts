/**
 * 레이어 패널 이름표 — 순수 함수
 * 행 순서·그룹·기본 이름은 트리가 정하고, 플러그인 요소의 표시 상태만 플러그인 스토어에서 읽는다
 */

import { slotDisplayName } from '@utils/keySlot';
import { getStatTypeLabel } from '@utils/grid/statTypeLabel';
import type { PluginPanelElementView } from '@src/types/plugin/api';
import type { StatItemType } from '@src/types/key/statItems';
import { isPluginVisibleInMode } from '@utils/layerGroupUtils';
import type { Scene } from '@src/types/generated/elementDocument';
import {
  sceneElements,
  type ElementNode,
} from '@src/renderer/editor/document/documentPatch';
import { keySlotOf } from '@src/renderer/elementKinds/definitions/key/keySlotInfo';

interface BuildLayerLabelsParams {
  scene: Scene | undefined;
  selectedKeyType: string;
  pluginElements: PluginPanelElementView[];
}

const statTypeOf = (element: ElementNode) =>
  (element.values as { statType?: StatItemType | null } | undefined)?.statType;

// 옛 종류별 레이어 기본 이름 - 번호는 옛 배열 순번
const LAYER_DEFAULT_NAMES = new Map<
  string,
  (element: ElementNode, index: number) => string
>([
  [
    'key',
    (element, index) =>
      slotDisplayName(keySlotOf(element) ?? '') || `Key ${index + 1}`,
  ],
  ['stat', (element) => getStatTypeLabel(statTypeOf(element))],
  ['graph', (element) => `${getStatTypeLabel(statTypeOf(element))} Graph`],
  ['knob', (_element, index) => `Knob ${index + 1}`],
  ['sprite', (_element, index) => `Sprite ${index + 1}`],
]);

// 트리에 실린 옛 배열 순번 - 기본 이름 번호 (목록은 겹침 순서라 순번과 다르다)
const legacyIndexOf = (element: ElementNode) => {
  const index = (element.legacy as { index?: unknown } | undefined)?.index;
  return typeof index === 'number' ? index : undefined;
};

export interface LayerLabels {
  // 요소 id → 이름이 비었을 때의 기본 이름
  defaultNames: Map<string, string>;
  // 플러그인 요소 fullId → 숨김 (플러그인 스토어가 낙관 반영한 값)
  pluginHidden: Map<string, boolean>;
}

export function buildLayerLabels({
  scene,
  selectedKeyType,
  pluginElements,
}: BuildLayerLabelsParams): LayerLabels {
  const defaultNames = new Map<string, string>();
  const pluginHidden = new Map<string, boolean>();

  // 종류 안 트리 순서 - 옛 순번이 없을 때의 번호
  const orders = new Map<string, number>();
  for (const element of scene ? sceneElements(scene) : []) {
    const defaultName = LAYER_DEFAULT_NAMES.get(element.kind);
    if (!defaultName) continue;
    const order = orders.get(element.kind) ?? 0;
    orders.set(element.kind, order + 1);
    defaultNames.set(
      element.id,
      defaultName(element, legacyIndexOf(element) ?? order),
    );
  }

  pluginElements
    .filter((element) => isPluginVisibleInMode(element, selectedKeyType))
    .forEach((element) => {
      defaultNames.set(element.fullId, element.definitionId || 'Plugin');
      pluginHidden.set(element.fullId, !!element.hidden);
    });

  return { defaultNames, pluginHidden };
}
