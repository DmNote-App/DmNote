// 편집 창 낙관 적용 - 백엔드 응답 전에 화면에 먼저 반영할 편집만 JS로 적용한다
// 검사·정리는 백엔드 엔진(element_document::ops)이 맡고, 그 결과 패치가 오면 이 계산을 대신한다.
// 입력·장면 연산은 여기서 다루지 않는다 (패치를 기다린다)
import type {
  Document,
  Node,
  Op,
  Scene,
} from '@src/types/generated/elementDocument';
import { isTreeOnlyGroup, walkNodes, type ElementNode } from './documentPatch';

const mapElement = (
  nodes: Node[],
  id: string,
  update: (element: ElementNode) => ElementNode,
): Node[] => {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.type === 'element') {
      if (node.id !== id) return node;
      changed = true;
      return { ...update(node), type: 'element' as const };
    }
    const children = mapElement(node.children, id, update);
    if (children === node.children) return node;
    changed = true;
    return { ...node, children };
  });
  return changed ? next : nodes;
};

const removeNodes = (nodes: Node[], ids: ReadonlySet<string>): Node[] => {
  let changed = false;
  const next: Node[] = [];
  for (const node of nodes) {
    if (ids.has(node.id)) {
      changed = true;
      continue;
    }
    if (node.type === 'group') {
      const children = removeNodes(node.children, ids);
      if (children !== node.children) {
        changed = true;
        next.push({ ...node, children });
        continue;
      }
    }
    next.push(node);
  }
  return changed ? next : nodes;
};

// parent 안 자식 목록 - null이면 장면 맨 위 목록
const childrenOf = (nodes: Node[], parent: string | null): Node[] | null => {
  if (parent === null) return nodes;
  let found: Node[] | null = null;
  walkNodes(nodes, (node) => {
    if (!found && node.type === 'group' && node.id === parent) {
      found = node.children;
    }
  });
  return found;
};

const withChildren = (
  nodes: Node[],
  parent: string | null,
  children: Node[],
): Node[] => {
  if (parent === null) return children;
  return nodes.map((node) => {
    if (node.type !== 'group') return node;
    if (node.id === parent) return { ...node, children };
    const next = withChildren(node.children, parent, children);
    return next === node.children ? node : { ...node, children: next };
  });
};

// 노드까지의 자리 - 위 단계부터 순번
const pathOf = (nodes: readonly Node[], id: string): number[] | null => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === id) return [index];
    if (node.type === 'group') {
      const inner = pathOf(node.children, id);
      if (inner) return [index, ...inner];
    }
  }
  return null;
};

const comparePaths = (left: number[], right: number[]) => {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
};

const nodeAt = (nodes: readonly Node[], path: number[]): Node | undefined => {
  let list = nodes;
  let node: Node | undefined;
  for (const index of path) {
    node = list[index];
    if (!node) return undefined;
    list = node.type === 'group' ? node.children : [];
  }
  return node;
};

const mapGroup = (
  nodes: Node[],
  id: string,
  update: (group: Extract<Node, { type: 'group' }>) => Node[],
): Node[] => {
  let changed = false;
  const next: Node[] = [];
  for (const node of nodes) {
    if (node.type === 'group' && node.id === id) {
      changed = true;
      next.push(...update(node));
      continue;
    }
    if (node.type === 'group') {
      const children = mapGroup(node.children, id, update);
      if (children !== node.children) {
        changed = true;
        next.push({ ...node, children });
        continue;
      }
    }
    next.push(node);
  }
  return changed ? next : nodes;
};

const hasId = (nodes: Node[], id: string) => {
  let found = false;
  walkNodes(nodes, (node) => {
    if (node.id === id) found = true;
  });
  return found;
};

const applyToNodes = (nodes: Node[], op: Op): Node[] => {
  switch (op.op) {
    case 'setFrame':
      return mapElement(nodes, op.id, (element) => {
        const frame = { ...element.frame };
        for (const key of ['x', 'y', 'width', 'height', 'rotation'] as const) {
          const value = op.frame[key];
          if (typeof value === 'number') frame[key] = value;
        }
        return { ...element, frame };
      });
    case 'setCommon':
      return mapElement(nodes, op.id, (element) => {
        const next = { ...element };
        // null은 지우기, 적지 않은 칸은 그대로
        if (op.name !== undefined) next.name = op.name ?? undefined;
        if (typeof op.hidden === 'boolean') next.hidden = op.hidden;
        if (op.className !== undefined) {
          next.className = op.className ?? undefined;
        }
        if (op.useInlineStyles !== undefined) {
          next.useInlineStyles = op.useInlineStyles ?? undefined;
        }
        return next;
      });
    case 'setValues':
      return mapElement(nodes, op.id, (element) => ({
        ...element,
        values: { ...element.values, ...op.values },
      }));
    case 'setBundle':
      return mapElement(nodes, op.id, (element) => {
        const previous = element.bundles?.[op.bundle];
        const base =
          previous && typeof previous === 'object' && !Array.isArray(previous)
            ? previous
            : {};
        return {
          ...element,
          bundles: {
            ...element.bundles,
            [op.bundle]: { ...base, ...op.fields },
          },
        };
      });
    case 'insert': {
      // 응답보다 패치가 먼저 와 이미 들어 있으면 다시 넣지 않는다
      if (hasId(nodes, op.node.id)) return nodes;
      const siblings = childrenOf(nodes, op.parent);
      if (!siblings) return nodes;
      const at = Math.min(op.index ?? siblings.length, siblings.length);
      const next = [...siblings];
      next.splice(at, 0, op.node);
      return withChildren(nodes, op.parent, next);
    }
    case 'remove':
      return removeNodes(nodes, new Set(op.ids));
    case 'move': {
      const wanted = new Set(op.ids);
      // 지금 겹치는 순서대로, 함께 옮겨지는 그룹의 자손은 따로 떼지 않는다
      const moving: Node[] = [];
      const visit = (list: Node[]) => {
        for (const node of list) {
          if (wanted.has(node.id)) moving.push(node);
          else if (node.type === 'group') visit(node.children);
        }
      };
      visit(nodes);
      if (moving.length === 0) return nodes;
      const movingIds = new Set(moving.map((node) => node.id));
      if (
        op.parent !== null &&
        moving.some(
          (node) =>
            node.id === op.parent ||
            (node.type === 'group' && hasId(node.children, op.parent!)),
        )
      ) {
        return nodes;
      }
      const target = childrenOf(nodes, op.parent);
      if (!target) return nodes;
      // 자리 기준: 옮기기 전 대상 목록에서 index 앞에 있던 남는 노드 수
      const anchor =
        op.index === null
          ? null
          : target.slice(0, op.index).filter((node) => !movingIds.has(node.id))
              .length;
      const without = removeNodes(nodes, movingIds);
      const siblings = childrenOf(without, op.parent) ?? [];
      const at = Math.min(anchor ?? siblings.length, siblings.length);
      const next = [...siblings];
      next.splice(at, 0, ...moving);
      return withChildren(without, op.parent, next);
    }
    case 'group': {
      // 엔진과 같다 - 멤버 중 가장 위 노드 자리(같은 부모)에 만들고, 멤버는 아래→위 순서.
      // 다른 멤버(그룹)의 자손은 그 그룹과 함께 옮겨진다
      if (op.ids.length === 0 || hasId(nodes, op.id)) return nodes;
      const found = [...new Set(op.ids)].flatMap((id) => {
        const path = pathOf(nodes, id);
        return path ? [{ id, path }] : [];
      });
      if (found.length !== new Set(op.ids).size) return nodes;
      const members = found
        .filter(
          ({ path }) =>
            !found.some(
              (other) =>
                other.path.length < path.length &&
                other.path.every((value, index) => path[index] === value),
            ),
        )
        .sort((left, right) => comparePaths(left.path, right.path));
      const top = members[members.length - 1].path;
      const parentPath = top.slice(0, -1);
      const parent =
        parentPath.length === 0 ? null : nodeAt(nodes, parentPath)?.id ?? null;
      const topIndex = top[top.length - 1];
      // 같은 부모에서 가장 위 멤버보다 아래 있던 멤버만큼 자리가 당겨진다
      const before = members.filter(
        ({ path }) =>
          path.length === top.length &&
          parentPath.every((value, index) => path[index] === value) &&
          path[path.length - 1] < topIndex,
      ).length;
      const memberNodes = members.map(({ path }) => nodeAt(nodes, path)!);
      const without = removeNodes(nodes, new Set(members.map(({ id }) => id)));
      const siblings = childrenOf(without, parent);
      if (!siblings) return nodes;
      const next = [...siblings];
      next.splice(topIndex - before, 0, {
        type: 'group',
        id: op.id,
        name: op.name,
        children: memberNodes,
      });
      return withChildren(without, parent, next);
    }
    case 'ungroup':
      return mapGroup(nodes, op.id, (group) => group.children);
    case 'setGroup':
      return mapGroup(nodes, op.id, (group) => [
        {
          ...group,
          ...(op.name != null ? { name: op.name } : {}),
          ...(typeof op.hidden === 'boolean' ? { hidden: op.hidden } : {}),
        },
      ]);
    default:
      return nodes;
  }
};

// 빼기·옮기기로 비게 된 트리 전용 그룹은 함께 지운다 (백엔드 커밋과 같다)
const pruneEmptyTreeGroups = (nodes: Node[]): Node[] => {
  let changed = false;
  const next: Node[] = [];
  for (const node of nodes) {
    if (node.type !== 'group') {
      next.push(node);
      continue;
    }
    const children = pruneEmptyTreeGroups(node.children);
    if (children.length === 0 && isTreeOnlyGroup(node)) {
      changed = true;
      continue;
    }
    if (children !== node.children) {
      changed = true;
      next.push({ ...node, children });
    } else {
      next.push(node);
    }
  }
  return changed ? next : nodes;
};

export const applyLocalOps = (document: Document, ops: readonly Op[]) => {
  let scenes = document.scenes;
  for (const op of ops) {
    const scene: Scene | undefined = scenes[op.scene];
    if (!scene) continue;
    const applied = applyToNodes(scene.nodes, op);
    const nodes =
      op.op === 'remove' || op.op === 'move' || op.op === 'group'
        ? pruneEmptyTreeGroups(applied)
        : applied;
    if (nodes === scene.nodes) continue;
    scenes = { ...scenes, [op.scene]: { ...scene, nodes } };
  }
  return scenes === document.scenes ? document : { ...document, scenes };
};

// 편집이 건드리는 요소 - 알림용 (구조가 바뀌는 연산은 structure)
export const touchedByOps = (ops: readonly Op[]) => {
  const scenes: Record<string, { ids: Set<string>; structure: boolean }> = {};
  for (const op of ops) {
    const entry = (scenes[op.scene] ??= { ids: new Set(), structure: false });
    if ('id' in op) entry.ids.add(op.id);
    if (op.op === 'insert') entry.ids.add(op.node.id);
    if ('ids' in op) for (const id of op.ids) entry.ids.add(id);
    if (
      op.op === 'insert' ||
      op.op === 'remove' ||
      op.op === 'move' ||
      op.op === 'group' ||
      op.op === 'ungroup'
    ) {
      entry.structure = true;
    }
  }
  return scenes;
};
