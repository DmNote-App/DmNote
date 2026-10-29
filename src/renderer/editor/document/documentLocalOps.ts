// 편집 창 낙관 적용 - 백엔드 응답 전에 화면에 먼저 반영할 편집만 JS로 적용한다
// 검사·정리는 백엔드 엔진(element_document::ops)이 맡고, 그 결과 패치가 오면 이 계산을 대신한다.
// 그룹 묶기·풀기·입력·장면 연산은 여기서 다루지 않는다 (패치를 기다린다)
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
      op.op === 'remove' || op.op === 'move'
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
    if (op.op === 'insert' || op.op === 'remove' || op.op === 'move') {
      entry.structure = true;
    }
  }
  return scenes;
};
