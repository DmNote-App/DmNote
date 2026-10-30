'use no memo';
// 프리뷰 오버레이(모듈 상태)를 버전으로 다시 읽어서 컴파일러 메모 제외
import type { Node, Scene } from '@src/types/generated/elementDocument';
import { getPreviewOverlayVersion } from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { treeKeySlot } from '@src/renderer/editor/runtime/operations/keySlotOps';
import { isItemElementType } from '@src/types/editor';
import { legacyPositionOf } from './legacyPosition';
import { treeElementPositionOf } from './treeElementPosition';

type Positions = Record<string, unknown[]>;

export interface TreePanelRecords {
  // 보이는 값(편집 미리보기 포함) - 옛 위치 기록 모양, 지금 탭 하나만
  positions: Positions;
  statItemPositions: Positions;
  graphItemPositions: Positions;
  knobItemPositions: Positions;
  spriteItemPositions: Positions;
  // 지금 값(미리보기 없음)
  canonicalPositions: Positions;
  canonicalStatItemPositions: Positions;
  canonicalGraphItemPositions: Positions;
  canonicalKnobItemPositions: Positions;
  canonicalSpritePositions: Positions;
  // 키 슬롯 - 키 위치와 같은 순번
  keyMappings: Record<string, unknown[]>;
}

const cache = new WeakMap<
  Scene,
  Map<string, { version: number; records: TreePanelRecords }>
>();

const empty = (sceneId: string): TreePanelRecords => {
  const none = { [sceneId]: [] };
  return {
    positions: none,
    statItemPositions: none,
    graphItemPositions: none,
    knobItemPositions: none,
    spriteItemPositions: none,
    canonicalPositions: none,
    canonicalStatItemPositions: none,
    canonicalGraphItemPositions: none,
    canonicalKnobItemPositions: none,
    canonicalSpritePositions: none,
    keyMappings: none,
  };
};

/** 속성 패널이 읽는 옛 위치 기록 모양을 트리에서 - 트리 순서, 지금 탭 하나만.
 * 장면·미리보기 판이 같으면 같은 객체 (패널 effect·메모가 참조로 비교한다) */
export const treePanelRecords = (
  scene: Scene | undefined,
  sceneId: string,
): TreePanelRecords => {
  if (!scene) return empty(sceneId);
  const version = getPreviewOverlayVersion();
  const byScene = cache.get(scene) ?? new Map();
  const cached = byScene.get(sceneId);
  if (cached?.version === version) return cached.records;
  const view: Record<string, unknown[]> = {
    key: [],
    stat: [],
    graph: [],
    knob: [],
    sprite: [],
  };
  const current: Record<string, unknown[]> = {
    key: [],
    stat: [],
    graph: [],
    knob: [],
    sprite: [],
  };
  const slots: unknown[] = [];
  const visit = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      if (node.type === 'group') {
        visit(node.children);
        continue;
      }
      if (node.kind !== 'key' && !isItemElementType(node.kind)) continue;
      view[node.kind].push(treeElementPositionOf(node, sceneId));
      current[node.kind].push(legacyPositionOf(node));
      if (node.kind === 'key') slots.push(treeKeySlot(node) ?? '');
    }
  };
  visit(scene.nodes);
  const of = (list: unknown[]) => ({ [sceneId]: list });
  const records: TreePanelRecords = {
    positions: of(view.key),
    statItemPositions: of(view.stat),
    graphItemPositions: of(view.graph),
    knobItemPositions: of(view.knob),
    spriteItemPositions: of(view.sprite),
    canonicalPositions: of(current.key),
    canonicalStatItemPositions: of(current.stat),
    canonicalGraphItemPositions: of(current.graph),
    canonicalKnobItemPositions: of(current.knob),
    canonicalSpritePositions: of(current.sprite),
    keyMappings: of(slots),
  };
  byScene.set(sceneId, { version, records });
  cache.set(scene, byScene);
  return records;
};
