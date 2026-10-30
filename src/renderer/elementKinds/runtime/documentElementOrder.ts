import type { Node, Scene } from '@src/types/generated/elementDocument';
import { isEditorElementType } from '@src/types/editor';
import { isPluginKind, TREE_EDITED_KINDS } from '@src/types/elementKinds';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';

export interface DocumentElementSlot {
  element: ElementNode;
  // 트리 순번 - 장면의 모든 요소(숨김·플러그인 포함)를 아래부터 센 값. 플러그인 요소도 같은 축이다
  zIndex: number;
  // 아래에 옛 종류 요소가 깔렸는지 (오버레이는 옛 종류 자신도) - 쌓인 칸(노트 트랙 위)에 그린다
  aboveLegacy: boolean;
}

const rankCache = new WeakMap<Scene, ReadonlyMap<string, number>>();

/** 장면의 모든 요소 id → 트리 순번(아래가 0). 목록 순서가 곧 겹치는 순서다 */
export const treeStackingRanks = (
  scene: Scene | undefined,
): ReadonlyMap<string, number> => {
  if (!scene) return new Map();
  const cached = rankCache.get(scene);
  if (cached) return cached;
  const ranks = new Map<string, number>();
  const visit = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      if (node.type === 'group') visit(node.children);
      else ranks.set(node.id, ranks.size);
    }
  };
  visit(scene.nodes);
  rankCache.set(scene, ranks);
  return ranks;
};

/** 트리 편집기가 그리는 요소를 겹치는 순서대로 - 숨긴 요소·숨긴 그룹 안은 뺀다.
 * 트리에만 있는 종류에 더해 legacyKinds의 옛 종류도 넣는다
 * (편집 화면은 트리로 옮긴 옛 종류, 오버레이는 트리에서 그리는 옛 종류, 창 크기 계산은 없음).
 * zIndex는 트리 순번 - 흩어진 옛 그룹도 트리에서 모인 순서로 쌓는다(3.1) */
export const documentElementSlots = (
  scene: Scene | undefined,
  {
    includeHidden = false,
    legacyKinds = TREE_EDITED_KINDS,
    stackNatives = false,
  }: {
    includeHidden?: boolean;
    legacyKinds?: ReadonlySet<string>;
    // 오버레이 - 옛 종류도 쌓인 칸에
    stackNatives?: boolean;
  } = {},
): DocumentElementSlot[] => {
  if (!scene) return [];
  const ranks = treeStackingRanks(scene);
  const slots: DocumentElementSlot[] = [];
  let legacyBelow = false;
  const visit = (nodes: readonly Node[], hidden: boolean) => {
    for (const node of nodes) {
      if (node.type === 'group') {
        visit(node.children, hidden || node.hidden === true);
        continue;
      }
      // 플러그인 인스턴스는 옛 플러그인 렌더러가 그린다
      if (isPluginKind(node.kind)) continue;
      const native = isEditorElementType(node.kind);
      if (native) legacyBelow = true;
      if (native && !legacyKinds.has(node.kind)) continue;
      if (includeHidden || (!hidden && !node.hidden)) {
        const aboveLegacy = native ? stackNatives : legacyBelow;
        slots.push({
          element: node,
          // 오버레이의 아래 칸(옛 종류보다 아래)은 노트 트랙(z 없음) 아래에 남도록 0
          zIndex: stackNatives && !aboveLegacy ? 0 : ranks.get(node.id) ?? 0,
          aboveLegacy,
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
