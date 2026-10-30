// 트리 전용 그룹 계산 - 옛 그룹(layerGroups에서 온 그룹)은 아직 옛 경로가 다룬다
import type { Group, Node, Scene } from '@src/types/generated/elementDocument';
import { isTreeOnlyGroup } from '@src/renderer/editor/document/documentPatch';
import {
  isEditorElementType,
  type EditorElementTypeV1,
} from '@src/types/editor';
import { isTreeEditedKind } from '@src/types/elementKinds';

const elementIds = (node: Node): string[] =>
  node.type === 'group' ? node.children.flatMap(elementIds) : [node.id];

// 노드까지의 조상 그룹 - 바깥부터
const ancestorsOf = (nodes: readonly Node[], id: string): Group[] | null => {
  for (const node of nodes) {
    if (node.id === id) return [];
    if (node.type === 'group') {
      const inner = ancestorsOf(node.children, id);
      if (inner) return [node, ...inner];
    }
  }
  return null;
};

const outermostTreeGroup = (scene: Scene, id: string) =>
  ancestorsOf(scene.nodes, id)?.find(isTreeOnlyGroup) ?? null;

/** 누른 요소가 트리 그룹 안이면 가장 바깥 트리 그룹의 요소 전체 (옛 종류 그룹 선택과 같다) */
export const expandDocumentGroup = (scene: Scene | undefined, id: string) => {
  const group = scene ? outermostTreeGroup(scene, id) : null;
  return group ? group.children.flatMap(elementIds) : [id];
};

/** 누른 요소가 옛 그룹(옛 종류 그룹) 안이면 그 그룹 멤버 - 트리 가족 id와 옛 종류 멤버로 나눈다.
 * 옛 그룹째 고르기는 두 선택에 나눠 담는다 (옛 종류 클릭의 그룹 고르기와 같다) */
export const legacyGroupMembersOf = (scene: Scene | undefined, id: string) => {
  const group = scene
    ? ancestorsOf(scene.nodes, id)?.find(
        (ancestor) => !isTreeOnlyGroup(ancestor),
      )
    : undefined;
  if (!group) return null;
  const treeIds: string[] = [];
  const legacy: { kind: EditorElementTypeV1; id: string }[] = [];
  const visit = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      if (node.type === 'group') visit(node.children);
      else if (isEditorElementType(node.kind) && !isTreeEditedKind(node.kind)) {
        legacy.push({ kind: node.kind, id: node.id });
      } else {
        treeIds.push(node.id);
      }
    }
  };
  visit(group.children);
  return { treeIds, legacy };
};

/** 묶을 대상 - 요소가 다 골라진 트리 그룹은 그룹째(가장 바깥부터), 나머지는 요소. 겹치는 순서대로 */
export const documentGroupRoots = (
  scene: Scene | undefined,
  ids: readonly string[],
) => {
  if (!scene) return [];
  const picked = new Set(ids);
  const roots: string[] = [];
  const visit = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      if (node.type === 'element') {
        if (picked.has(node.id)) roots.push(node.id);
        continue;
      }
      const members = elementIds(node);
      if (
        isTreeOnlyGroup(node) &&
        members.length > 0 &&
        members.every((member) => picked.has(member))
      ) {
        roots.push(node.id);
      } else {
        visit(node.children);
      }
    }
  };
  visit(scene.nodes);
  return roots;
};

/** 풀 대상 - 고른 요소가 들어 있는 가장 바깥 트리 그룹 */
export const documentGroupsOf = (
  scene: Scene | undefined,
  ids: readonly string[],
) => {
  if (!scene) return [];
  const groups: string[] = [];
  for (const id of ids) {
    const group = outermostTreeGroup(scene, id);
    if (group && !groups.includes(group.id)) groups.push(group.id);
  }
  return groups;
};

/** 장면 안 모든 그룹 이름 - 새 그룹 이름 번호 매기기용 */
export const documentGroupNames = (scene: Scene | undefined) => {
  const names: { id: string; name: string }[] = [];
  const visit = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      if (node.type !== 'group') continue;
      names.push({ id: node.id, name: node.name });
      visit(node.children);
    }
  };
  if (scene) visit(scene.nodes);
  return names;
};

/** 노드의 부모 그룹 id - 장면 맨 위 단계면 null, 없으면 undefined */
export const documentParentOf = (scene: Scene | undefined, id: string) => {
  if (!scene) return undefined;
  const ancestors = ancestorsOf(scene.nodes, id);
  if (!ancestors) return undefined;
  return ancestors.length > 0 ? ancestors[ancestors.length - 1].id : null;
};
