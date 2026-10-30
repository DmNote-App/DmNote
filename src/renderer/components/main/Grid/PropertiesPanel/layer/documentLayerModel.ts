// 레이어 패널의 트리 요소 구역 - 트리 전용 노드만 위→아래 겹침 순서로 보인다
// (옛 종류 행은 위쪽 옛 목록이 맡는다. 옛 그룹은 안의 트리 요소만 드러나게 지나간다)
import type {
  Group,
  Node,
  Op,
  Scene,
} from '@src/types/generated/elementDocument';
import { isTreeOnlyGroup } from '@src/renderer/editor/document/documentPatch';
import { isTreeEditedKind } from '@src/types/elementKinds';

export interface DocumentLayerRowModel {
  node: Node;
  depth: number;
  // 실제 부모 그룹 id - 장면 맨 위 단계면 null
  parentId: string | null;
  // 부모 안에서의 순번 (아래가 0)
  index: number;
}

export const documentLayerRows = (
  scene: Scene | undefined,
  collapsed: ReadonlySet<string>,
): DocumentLayerRowModel[] => {
  const rows: DocumentLayerRowModel[] = [];
  const visit = (
    nodes: readonly Node[],
    depth: number,
    parentId: string | null,
  ) => {
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      if (node.type === 'element') {
        if (isTreeEditedKind(node.kind)) {
          rows.push({ node, depth, parentId, index });
        }
        continue;
      }
      if (isTreeOnlyGroup(node)) {
        rows.push({ node, depth, parentId, index });
        if (!collapsed.has(node.id)) visit(node.children, depth + 1, node.id);
      } else {
        visit(node.children, depth, node.id);
      }
    }
  };
  if (scene) visit(scene.nodes, 0, null);
  return rows;
};

const containsId = (group: Group, id: string): boolean =>
  group.children.some(
    (child) =>
      child.id === id || (child.type === 'group' && containsId(child, id)),
  );

/** 끈 노드를 놓을 자리 - 행 위(더 위)·아래·그룹 안(맨 위). 자기 안으로는 null */
export const documentDropMove = (
  scene: Scene | undefined,
  rows: readonly DocumentLayerRowModel[],
  ids: readonly string[],
  targetIndex: number,
  position: 'above' | 'below' | 'into',
  sceneId = 's',
): Op | null => {
  const target = rows[targetIndex];
  if (!scene || !target || ids.length === 0) return null;
  const parent =
    position === 'into' && target.node.type === 'group'
      ? target.node.id
      : target.parentId;
  // 그룹을 자기 자신이나 안쪽으로 옮길 수 없다
  const moving = rows.filter((row) => ids.includes(row.node.id));
  if (
    parent !== null &&
    moving.some(
      (row) =>
        row.node.id === parent ||
        (row.node.type === 'group' && containsId(row.node, parent)),
    )
  ) {
    return null;
  }
  if (ids.includes(target.node.id) && position !== 'into') return null;
  return {
    op: 'move',
    scene: sceneId,
    ids: [...ids],
    parent,
    index:
      position === 'into'
        ? null
        : position === 'above'
        ? target.index + 1
        : target.index,
  };
};

// 행 들여쓰기 - 옛 행(맨 위 12px, 그룹 안 28px)과 같고 중첩은 16px씩
export const layerRowIndent = (depth: number) =>
  depth === 0 ? 12 : 28 + (depth - 1) * 16;
