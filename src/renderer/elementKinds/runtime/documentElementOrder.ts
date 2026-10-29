import type { Node, Scene } from '@src/types/generated/elementDocument';
import { isEditorElementType } from '@src/types/editor';
import { TREE_OVERLAY_KINDS } from '@src/types/elementKinds';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';

export interface DocumentElementSlot {
  element: ElementNode;
  // 옛 종류 요소와 같은 쌓임 맥락에서 쓸 zIndex - 바로 아래 옛 종류 요소와 같고 DOM 순서로 그 위에 온다.
  // 아래에 옛 종류 요소가 없으면 가장 낮은 옛 요소와 같고, 옛 요소보다 먼저 그려서 그 아래에 온다
  // (배경보다 아래로 내려가지 않게 음수로 빼지 않는다)
  zIndex: number;
  // 바로 아래 옛 종류 요소가 있는지
  aboveLegacy: boolean;
}

const legacyZIndex = (element: ElementNode): number | null => {
  const legacy = element.legacy as
    | { zIndex?: number | null; index?: number }
    | undefined;
  if (!legacy) return null;
  return legacy.zIndex ?? legacy.index ?? null;
};

/** 트리에만 있는 종류 요소를 겹치는 순서대로 - 숨긴 요소·숨긴 그룹 안은 뺀다.
 * overlay면 오버레이가 트리에서 그리는 옛 종류도 자기 zIndex로 넣는다 */
export const documentElementSlots = (
  scene: Scene | undefined,
  {
    includeHidden = false,
    overlay = false,
  }: { includeHidden?: boolean; overlay?: boolean } = {},
): DocumentElementSlot[] => {
  if (!scene) return [];
  const slots: DocumentElementSlot[] = [];
  let lowest: number | null = null;
  const findLowest = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      if (node.type === 'group') findLowest(node.children);
      else if (isEditorElementType(node.kind)) {
        const z = legacyZIndex(node);
        if (z !== null) lowest = lowest === null ? z : Math.min(lowest, z);
      }
    }
  };
  findLowest(scene.nodes);
  let below: number | null = null;
  const visit = (nodes: readonly Node[], hidden: boolean) => {
    for (const node of nodes) {
      if (node.type === 'group') {
        visit(node.children, hidden || node.hidden === true);
        continue;
      }
      if (isEditorElementType(node.kind)) {
        const z = legacyZIndex(node);
        below = z ?? below;
        // 오버레이가 트리에서 그리는 옛 종류는 자기 zIndex로 옛 요소 사이에 선다
        if (
          overlay &&
          TREE_OVERLAY_KINDS.has(node.kind) &&
          (includeHidden || (!hidden && !node.hidden))
        ) {
          slots.push({
            element: node,
            zIndex: z ?? below ?? lowest ?? 0,
            aboveLegacy: true,
          });
        }
        continue;
      }
      if (includeHidden || (!hidden && !node.hidden)) {
        slots.push({
          element: node,
          zIndex: below ?? lowest ?? 0,
          aboveLegacy: below !== null,
        });
      }
    }
  };
  visit(scene.nodes, false);
  return slots;
};

type LayoutBox = {
  tabId: string;
  position: { x: number; y: number };
  measuredSize: { width: number; height: number };
};

const sameBoxes = (left: LayoutBox[], right: LayoutBox[]) =>
  left.length === right.length &&
  left.every(
    (box, index) =>
      box.position.x === right[index].position.x &&
      box.position.y === right[index].position.y &&
      box.measuredSize.width === right[index].measuredSize.width &&
      box.measuredSize.height === right[index].measuredSize.height,
  );

// 탭마다 마지막 상자 - 옛 종류 요소만 바뀐 패치에도 같은 배열을 돌려준다
const lastBoxes = new Map<string, LayoutBox[]>();

/** 오버레이 창 크기 계산용 상자 - 플러그인 요소와 같은 모양.
 * 상자가 그대로면 이전 배열을 돌려줘 창 레이아웃(WebGL 트랙·히트 영역)이 다시 계산되지 않게 한다 */
export const documentLayoutElements = (
  scene: Scene | undefined,
  tabId: string,
): LayoutBox[] => {
  const boxes = documentElementSlots(scene).map(({ element }) => ({
    tabId,
    position: { x: element.frame.x, y: element.frame.y },
    measuredSize: { width: element.frame.width, height: element.frame.height },
  }));
  const previous = lastBoxes.get(tabId);
  if (previous && sameBoxes(previous, boxes)) return previous;
  lastBoxes.set(tabId, boxes);
  return boxes;
};
