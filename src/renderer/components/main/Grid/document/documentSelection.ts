// 트리 요소 선택 계산 - 옛 종류 선택(useGridSelectionStore)과 같은 규칙
import type { Frame, Scene } from '@src/types/generated/elementDocument';
import { isElementInMarquee } from '@stores/grid/useGridSelectionStore';
import { documentElementSlots } from '@src/renderer/elementKinds/runtime/documentElementOrder';

type Rect = { left: number; top: number; width: number; height: number };

const boundsOf = (frame: Frame) => ({
  x: frame.x,
  y: frame.y,
  width: frame.width,
  height: frame.height,
});

/** 보조키(Cmd/Ctrl) 클릭 - 고른 목록에 넣거나 뺀다 */
export const toggleDocumentId = (ids: readonly string[], id: string) =>
  ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];

/** 마퀴 영역과 겹치는 보이는 트리 요소 - 겹치는 순서대로 */
export const documentIdsInRect = (scene: Scene | undefined, rect: Rect) =>
  documentElementSlots(scene)
    .filter(({ element }) => isElementInMarquee(boundsOf(element.frame), rect))
    .map(({ element }) => element.id);

/** Shift 클릭 - 기준 요소와 누른 요소를 감싸는 영역과 겹치는 요소 (옛 종류 범위 선택과 같다) */
export const documentIdsInRange = (
  scene: Scene | undefined,
  anchorId: string,
  clickedId: string,
) => {
  const slots = documentElementSlots(scene);
  const clicked = slots.find(({ element }) => element.id === clickedId);
  if (!clicked) return [];
  const anchor =
    slots.find(({ element }) => element.id === anchorId) ?? clicked;
  const a = anchor.element.frame;
  const b = clicked.element.frame;
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  return documentIdsInRect(scene, {
    left,
    top,
    width: Math.max(a.x + a.width, b.x + b.width) - left,
    height: Math.max(a.y + a.height, b.y + b.height) - top,
  });
};
