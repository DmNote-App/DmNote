// 구조 편집 그룹 계산 - 옛 그룹·트리 전용 그룹 모두 트리 그룹으로 다룬다 (묶기·풀기·겹침 순서는 트리 연산)
import type {
  Group,
  Node,
  Op,
  Scene,
} from '@src/types/generated/elementDocument';
import { isTreeOnlyGroup } from '@src/renderer/editor/document/documentPatch';
import { isEditorElementType } from '@src/types/editor';
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

// 옛 모양(layerGroups)에 드는 노드 - 옛 종류·플러그인 요소, 그것을 품은 그룹
export const isLegacyNode = (node: Node): boolean =>
  node.type === 'group'
    ? !isTreeOnlyGroup(node)
    : isEditorElementType(node.kind) || isPluginKind(node.kind);

const findNode = (nodes: readonly Node[], id: string): Node | undefined => {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === 'group') {
      const inner = findNode(node.children, id);
      if (inner) return inner;
    }
  }
  return undefined;
};

/** 묶기 연산 - 둘 이상이고 이미 한 그룹 전체가 아닐 때.
 * 옛 종류·플러그인이 섞이면 옛 모양이 그룹 안 그룹을 나타내지 못하므로 옛 묶기와 같이: 고른 요소가 한 그룹에만
 * 들어 있으면 나머지를 그 그룹에 넣고, 아니면 고른 요소만 장면 맨 위 단계로 꺼내 새 그룹으로 묶는다.
 * 트리 전용 요소끼리는 다 고른 그룹을 그룹째 넣는다. 할 것이 없으면 null */
export const documentGroupOps = (
  scene: Scene | undefined,
  sceneId: string,
  ids: readonly string[],
  group: { id: string; name: string },
): Op[] | null => {
  if (!scene) return null;
  const roots = documentGroupRoots(scene, ids);
  if (ids.length < 2 || roots.length < 2) return null;
  const legacy = roots.some((id) => {
    const node = findNode(scene.nodes, id);
    return !!node && isLegacyNode(node);
  });
  if (!legacy) {
    return [{ op: 'group', scene: sceneId, ...group, ids: roots }];
  }
  const outer = new Map(
    ids.map((id) => [id, outermostGroup(scene, id)?.id ?? null]),
  );
  const groups = new Set([...outer.values()].filter((id) => id !== null));
  if (groups.size === 0) {
    return [{ op: 'group', scene: sceneId, ...group, ids: [...ids] }];
  }
  if (groups.size === 1) {
    const [existing] = groups;
    const outside = ids.filter((id) => outer.get(id) === null);
    return outside.length === 0
      ? null
      : [
          {
            op: 'move',
            scene: sceneId,
            ids: outside,
            parent: existing,
            index: null,
          },
        ];
  }
  // 고른 것 중 가장 위 요소의 맨 위 단계 자리 바로 위로 꺼낸 뒤 묶는다
  const rootIndexOf = (id: string) =>
    scene.nodes.findIndex(
      (node) =>
        node.id === id ||
        (node.type === 'group' && !!findNode(node.children, id)),
    );
  const top = Math.max(...ids.map(rootIndexOf));
  return [
    { op: 'move', scene: sceneId, ids: [...ids], parent: null, index: top + 1 },
    { op: 'group', scene: sceneId, ...group, ids: [...ids] },
  ];
};

/** 묶기·풀기 메뉴 - 둘 이상일 때. 묶을 것이 없으면(이미 한 그룹) 풀기만, 아무 그룹도 아니면 묶기만 */
export const documentGroupActions = (
  scene: Scene | undefined,
  ids: readonly string[],
): ('group' | 'ungroup')[] => {
  if (ids.length < 2) return [];
  const canGroup =
    documentGroupOps(scene, '', ids, { id: '', name: '' }) !== null;
  const canUngroup = documentGroupsOf(scene, ids).length > 0;
  return [
    ...(canGroup ? (['group'] as const) : []),
    ...(canUngroup ? (['ungroup'] as const) : []),
  ];
};
