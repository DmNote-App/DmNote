import type { Node, Scene } from '@src/types/generated/elementDocument';
import { isEditorElementType } from '@src/types/editor';
import { isPluginKind, TREE_EDITED_KINDS } from '@src/types/elementKinds';
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

/** 트리 편집기가 그리는 요소를 겹치는 순서대로 - 숨긴 요소·숨긴 그룹 안은 뺀다.
 * 트리에만 있는 종류에 더해 legacyKinds의 옛 종류도 옛 요소 사이에 넣는다
 * (편집 화면은 트리로 옮긴 옛 종류, 오버레이는 트리에서 그리는 옛 종류, 창 크기 계산은 없음).
 * 둘 다 자기 zIndex로 플러그인 요소와 같은 축에 쌓는다. 오버레이는(ownZIndex) 저장된 값,
 * 편집 화면은 옛 층처럼 낙관 반영된 옛 컬렉션 값(legacyZIndexes) - 순서 바꾸기가 백엔드 왕복 없이 보인다.
 * 트리에만 있는 종류는 바로 아래 옛 종류 요소의 zIndex를 따른다 */
export const documentElementSlots = (
  scene: Scene | undefined,
  {
    includeHidden = false,
    legacyKinds = TREE_EDITED_KINDS,
    ownZIndex = false,
    legacyZIndexes,
  }: {
    includeHidden?: boolean;
    legacyKinds?: ReadonlySet<string>;
    ownZIndex?: boolean;
    // 편집 화면 - 옛 컬렉션의 id별 zIndex (없으면 트리에 실린 값)
    legacyZIndexes?: ReadonlyMap<string, number>;
  } = {},
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
      // 플러그인 인스턴스는 옛 플러그인 렌더러가 그린다
      if (isPluginKind(node.kind)) continue;
      if (isEditorElementType(node.kind) && !legacyKinds.has(node.kind)) {
        below = legacyZIndex(node) ?? below;
        continue;
      }
      // 트리가 그리는 옛 종류 - 오버레이는 자기 zIndex
      if (isEditorElementType(node.kind) && ownZIndex) {
        const z = legacyZIndex(node);
        below = z ?? below;
        if (includeHidden || (!hidden && !node.hidden)) {
          slots.push({
            element: node,
            zIndex: z ?? below ?? lowest ?? 0,
            aboveLegacy: true,
          });
        }
        continue;
      }
      // 편집 화면 - 자기 zIndex. 옛 층처럼 플러그인 요소보다 먼저 그린다(같은 zIndex면 플러그인이 위)
      if (isEditorElementType(node.kind)) {
        const z =
          legacyZIndexes?.get(node.id) ??
          legacyZIndex(node) ??
          below ??
          lowest ??
          0;
        below = z;
        if (includeHidden || (!hidden && !node.hidden)) {
          slots.push({ element: node, zIndex: z, aboveLegacy: false });
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

/** 숨긴 트리 그룹 안 요소 id를 정렬해 이은 열쇠 - 그룹 숨김은 트리에만 있다. 내용이 같으면 같은 문자열 */
export const treeGroupHiddenKey = (scene: Scene | undefined): string => {
  if (!scene) return '';
  const ids: string[] = [];
  const visit = (nodes: readonly Node[], hidden: boolean) => {
    for (const node of nodes) {
      if (node.type === 'group')
        visit(node.children, hidden || node.hidden === true);
      else if (hidden) ids.push(node.id);
    }
  };
  visit(scene.nodes, false);
  return ids.sort().join('\n');
};

/** 숨긴 트리 그룹 안 요소를 hidden으로 - 옛 배열로 자리를 잡는 오버레이 층(바깥 카운터·노트 트랙·창 크기)이
 * 트리 층과 같게 보이도록. 바뀐 요소가 없으면 같은 배열 */
export const withTreeGroupHidden = <
  T extends { id: string; hidden?: boolean } | null | undefined,
>(
  positions: readonly T[],
  hiddenKey: string,
): readonly T[] => {
  if (!hiddenKey) return positions;
  const hidden = new Set(hiddenKey.split('\n'));
  let changed = false;
  const next = positions.map((position) => {
    if (!position || position.hidden || !hidden.has(position.id)) {
      return position;
    }
    changed = true;
    return { ...position, hidden: true };
  });
  return changed ? next : positions;
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

const NO_KINDS: ReadonlySet<string> = new Set();

// 탭마다 마지막 상자 - 옛 종류 요소만 바뀐 패치에도 같은 배열을 돌려준다
const lastBoxes = new Map<string, LayoutBox[]>();

/** 오버레이 창 크기 계산용 상자 - 플러그인 요소와 같은 모양.
 * 상자가 그대로면 이전 배열을 돌려줘 창 레이아웃(WebGL 트랙·히트 영역)이 다시 계산되지 않게 한다 */
export const documentLayoutElements = (
  scene: Scene | undefined,
  tabId: string,
): LayoutBox[] => {
  // 옛 종류는 옛 배열이 창 크기에 이미 넣는다
  const boxes = documentElementSlots(scene, { legacyKinds: NO_KINDS }).map(
    ({ element }) => ({
      tabId,
      position: { x: element.frame.x, y: element.frame.y },
      measuredSize: {
        width: element.frame.width,
        height: element.frame.height,
      },
    }),
  );
  const previous = lastBoxes.get(tabId);
  if (previous && sameBoxes(previous, boxes)) return previous;
  lastBoxes.set(tabId, boxes);
  return boxes;
};
