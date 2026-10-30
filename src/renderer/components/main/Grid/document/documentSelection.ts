// 트리 요소 선택 계산 - 옛 종류 선택(useGridSelectionStore)과 같은 규칙
import type { Frame, Scene } from '@src/types/generated/elementDocument';
import {
  isElementInMarquee,
  type SelectedElement,
} from '@stores/grid/useGridSelectionStore';
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

interface RangePluginElement {
  fullId: string;
  tabId?: string;
  position: { x: number; y: number };
  measuredSize?: { width: number; height: number };
}

/** Shift 클릭 - 마지막으로 누른 요소(플러그인 요소 포함) 영역과 누른 요소를 감싸는 영역과 겹치는
 * 트리 요소와 플러그인 요소 (옛 키 범위 선택과 같다) */
export const documentRangeSelection = (
  scene: Scene | undefined,
  anchor: { x: number; y: number; width: number; height: number },
  clicked: Frame,
  pluginElements: readonly RangePluginElement[],
  sceneId: string,
): { treeIds: string[]; plugins: SelectedElement[] } => {
  const left = Math.min(anchor.x, clicked.x);
  const top = Math.min(anchor.y, clicked.y);
  const rect = {
    left,
    top,
    width: Math.max(anchor.x + anchor.width, clicked.x + clicked.width) - left,
    height:
      Math.max(anchor.y + anchor.height, clicked.y + clicked.height) - top,
  };
  return {
    treeIds: documentIdsInRect(scene, rect),
    plugins: pluginElements
      .filter(
        (element) =>
          (!element.tabId || element.tabId === sceneId) &&
          element.measuredSize &&
          isElementInMarquee(
            { ...element.position, ...element.measuredSize },
            rect,
          ),
      )
      .map((element) => ({ type: 'plugin', id: element.fullId })),
  };
};
