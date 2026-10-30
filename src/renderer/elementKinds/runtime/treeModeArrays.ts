import type { Node, Scene } from '@src/types/generated/elementDocument';
import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  isItemElementType,
  type CanonicalEditorDocumentV1,
  type ItemElementModeArrays,
} from '@src/types/editor';
import type { KeySlot } from '@src/types/key/keys';
import { treeKeySlot } from '@src/renderer/editor/runtime/operations/keySlotOps';
import { treeStackingRanks } from './documentElementOrder';
import { legacyPositionOf } from './legacyPosition';

type KeyPositions = CanonicalEditorDocumentV1['keyPositions'][string];

export interface TreeModeArrays {
  // 키 슬롯과 키 위치는 같은 순번으로 짝을 이룬다
  keySlots: KeySlot[];
  keyPositions: KeyPositions;
  itemArrays: ItemElementModeArrays;
}

const EMPTY: TreeModeArrays = {
  keySlots: [],
  keyPositions: [],
  itemArrays: {
    statPositions: [],
    graphPositions: [],
    knobPositions: [],
    spritePositions: [],
  },
};

const cache = new WeakMap<Scene, TreeModeArrays>();

/** 장면 트리 → 탭 하나의 옛 종류 위치 목록 (바깥 카운터·노트 트랙·창 크기처럼 위치 목록으로 자리를 잡는 층).
 * 트리 순서(아래→위), 숨긴 그룹 안은 숨김, zIndex는 트리 순번. 장면이 같으면 같은 객체 */
export const treeModeArrays = (scene: Scene | undefined): TreeModeArrays => {
  if (!scene) return EMPTY;
  const cached = cache.get(scene);
  if (cached) return cached;
  const ranks = treeStackingRanks(scene);
  const keySlots: KeySlot[] = [];
  const keyPositions: KeyPositions = [];
  const items: Record<string, unknown[]> = {
    statPositions: [],
    graphPositions: [],
    knobPositions: [],
    spritePositions: [],
  };
  const visit = (nodes: readonly Node[], hidden: boolean) => {
    for (const node of nodes) {
      if (node.type === 'group') {
        visit(node.children, hidden || node.hidden === true);
        continue;
      }
      if (node.kind !== 'key' && !isItemElementType(node.kind)) continue;
      const base = legacyPositionOf(node);
      const position = {
        ...base,
        zIndex: ranks.get(node.id) ?? 0,
        ...(hidden ? { hidden: true } : {}),
      };
      if (node.kind === 'key') {
        keySlots.push(treeKeySlot(node) ?? '');
        keyPositions.push(position as unknown as KeyPositions[number]);
      } else {
        items[EDITOR_ELEMENT_POSITION_FIELDS[node.kind]].push(position);
      }
    }
  };
  visit(scene.nodes, false);
  const arrays: TreeModeArrays = {
    keySlots,
    keyPositions,
    itemArrays: items as unknown as ItemElementModeArrays,
  };
  cache.set(scene, arrays);
  return arrays;
};
