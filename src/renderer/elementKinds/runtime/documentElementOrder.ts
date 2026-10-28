import type { Node, Scene } from '@src/types/generated/elementDocument';
import { isEditorElementType } from '@src/types/editor';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';

export interface DocumentElementSlot {
  element: ElementNode;
  // 옛 종류 요소와 같은 쌓임 맥락에서 쓸 zIndex - 바로 아래 옛 종류 요소와 같고 DOM 순서로 그 위에 온다
  zIndex: number;
}

const legacyZIndex = (element: ElementNode): number | null => {
  const legacy = element.legacy as
    | { zIndex?: number | null; index?: number }
    | undefined;
  if (!legacy) return null;
  return legacy.zIndex ?? legacy.index ?? null;
};

/** 트리에만 있는 종류 요소를 겹치는 순서대로 - 숨긴 요소·숨긴 그룹 안은 뺀다 */
export const documentElementSlots = (
  scene: Scene | undefined,
): DocumentElementSlot[] => {
  if (!scene) return [];
  const slots: DocumentElementSlot[] = [];
  let below = 0;
  const visit = (nodes: readonly Node[], hidden: boolean) => {
    for (const node of nodes) {
      if (node.type === 'group') {
        visit(node.children, hidden || node.hidden === true);
        continue;
      }
      if (isEditorElementType(node.kind)) {
        below = legacyZIndex(node) ?? below;
        continue;
      }
      if (!hidden && !node.hidden) slots.push({ element: node, zIndex: below });
    }
  };
  visit(scene.nodes, false);
  return slots;
};

/** 오버레이 창 크기 계산용 상자 - 플러그인 요소와 같은 모양 */
export const documentLayoutElements = (
  scene: Scene | undefined,
  tabId: string,
) =>
  documentElementSlots(scene).map(({ element }) => ({
    tabId,
    position: { x: element.frame.x, y: element.frame.y },
    measuredSize: { width: element.frame.width, height: element.frame.height },
  }));
