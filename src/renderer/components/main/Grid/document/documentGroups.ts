// 구조 편집 그룹 계산 - 옛 그룹·트리 전용 그룹 모두 트리 그룹으로 다룬다 (묶기·풀기·겹침 순서는 트리 연산)
import type { Group, Node, Scene } from '@src/types/generated/elementDocument';
import { isPluginKind } from '@src/types/elementKinds';

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

const outermostGroup = (scene: Scene, id: string) =>
  ancestorsOf(scene.nodes, id)?.[0] ?? null;

const elementNodes = (node: Node): Extract<Node, { type: 'element' }>[] =>
  node.type === 'group' ? node.children.flatMap(elementNodes) : [node];

/** 누른 요소가 그룹 안이면 가장 바깥 그룹의 요소 전체 - 트리 선택 몫과 옛 선택 몫(플러그인 요소)으로 나눈다 */
export const groupSelectionOf = (scene: Scene | undefined, id: string) => {
  const group = scene ? outermostGroup(scene, id) : null;
  if (!group) return { treeIds: [id], plugins: [] as string[] };
  const treeIds: string[] = [];
  const plugins: string[] = [];
  for (const element of group.children.flatMap(elementNodes)) {
    (isPluginKind(element.kind) ? plugins : treeIds).push(element.id);
  }
  return { treeIds, plugins };
};

/** 묶을 대상 - 요소가 다 골라진 그룹은 그룹째(가장 바깥부터), 나머지는 요소. 겹치는 순서대로 */
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
      if (members.length > 0 && members.every((member) => picked.has(member))) {
        roots.push(node.id);
      } else {
        visit(node.children);
      }
    }
  };
  visit(scene.nodes);
  return roots;
};

/** 풀 대상 - 고른 요소가 들어 있는 가장 바깥 그룹 */
export const documentGroupsOf = (
  scene: Scene | undefined,
  ids: readonly string[],
) => {
  if (!scene) return [];
  const groups: string[] = [];
  for (const id of ids) {
    const group = outermostGroup(scene, id);
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

/** 묶기·풀기 메뉴 - 둘 이상일 때. 모두 한 그룹이면 풀기만, 아무 그룹도 아니면 묶기만 */
export const documentGroupActions = (
  scene: Scene | undefined,
  ids: readonly string[],
): ('group' | 'ungroup')[] => {
  if (ids.length < 2) return [];
  const groups = documentGroupsOf(scene, ids);
  const roots = documentGroupRoots(scene, ids);
  if (groups.length === 0) return ['group'];
  if (groups.length === 1 && roots.length === 1 && roots[0] === groups[0]) {
    return ['ungroup'];
  }
  return ['group', 'ungroup'];
};
