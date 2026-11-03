// 플러그인 인스턴스 ↔ 트리 노드 - 저장 원본은 트리 하나다 (요소 id = `{플러그인}::{인스턴스}`, 장면 = 탭).
// 읽기는 장면의 플러그인 노드를 저장 모양으로, 쓰기는 런타임이 바꾼 칸만 트리 연산으로 옮긴다.
// 탭·겹침값·그룹을 바꾸면 빼고 다시 넣는다 - 자리는 노드가 든 자기 항목의 값으로 백엔드가 정한다
// (인스턴스 목록 쓰기와 같은 놓기). 인스턴스 ↔ 노드 변환은 백엔드 저장 항목 ↔ 노드와 같다 - fixture로 고정
// (tests/plugin-instance-tree-parity.test.ts)
import {
  applyLocalOp,
  applyLocalOps,
} from '@src/renderer/editor/document/documentLocalOps';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type {
  Document,
  JsonValue,
  Node,
  Op,
  Scene,
} from '@src/types/generated/elementDocument';
import { normalizePluginInstanceTabId } from '../displayElement/instanceLifecycle';
import type { SavedInstance } from './pluginInstanceSnapshotApplier';
import { PLUGIN_FALLBACK_SIZE, pluginKindName } from './pluginKindSchema';

interface TreeView {
  getSceneIds(): string[];
  getScene(sceneId: string): Scene | undefined;
}

interface PluginLegacy {
  pluginEntry?: Record<string, unknown>;
  order?: number;
}

interface PluginNode {
  sceneId: string;
  node: ElementNode;
  parentId: string | null;
  // 형제 사이 자리
  index: number;
}

const legacyOf = (node: ElementNode): PluginLegacy | undefined => {
  const legacy = (node as { legacy?: unknown }).legacy;
  return legacy && typeof legacy === 'object'
    ? (legacy as PluginLegacy)
    : undefined;
};

const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

/** 그 플러그인의 노드 - 문서 장면 순서·트리 순서대로 */
const pluginNodes = (view: TreeView, pluginId: string) => {
  const kind = pluginKindName(pluginId);
  const prefix = `${pluginId}::`;
  const found = new Map<string, PluginNode>();
  for (const sceneId of view.getSceneIds()) {
    const visit = (nodes: readonly Node[], parentId: string | null) => {
      nodes.forEach((node, index) => {
        if (node.type === 'group') visit(node.children, node.id);
        else if (
          node.kind === kind &&
          node.id.startsWith(prefix) &&
          node.id.length > prefix.length
        ) {
          found.set(node.id, { sceneId, node, parentId, index });
        }
      });
    };
    visit(view.getScene(sceneId)?.nodes ?? [], null);
  }
  return found;
};

// 측정 크기가 없던 인스턴스는 기본 크기 틀이다 (백엔드 버킷 ↔ 트리와 같은 규칙, 기본 크기는 종류 정의 하나)
const measuredSizeOf = (node: ElementNode) => {
  const { width, height } = node.frame;
  const measured =
    legacyOf(node)?.pluginEntry?.measuredSize !== undefined ||
    width !== PLUGIN_FALLBACK_SIZE.width ||
    height !== PLUGIN_FALLBACK_SIZE.height;
  return measured ? { width, height } : undefined;
};

/** 트리 → 그 플러그인의 저장 모양 인스턴스 (목록 순번대로 - 순번 없는 막 넣은 노드는 끝에) */
export const pluginInstancesFromTree = (
  view: TreeView,
  pluginId: string,
): SavedInstance[] =>
  [...pluginNodes(view, pluginId)]
    .map(([fullId, { sceneId, node, parentId }], walk) => {
      const legacy = legacyOf(node);
      const measuredSize = measuredSizeOf(node);
      const values = node.values ?? {};
      const zIndex = legacy?.pluginEntry?.zIndex;
      const instance: SavedInstance = {
        instanceId: fullId.slice(pluginId.length + 2),
        position: { x: node.frame.x, y: node.frame.y },
        tabId: sceneId,
        hidden: node.hidden === true,
        ...(measuredSize ? { measuredSize } : {}),
        ...(Object.keys(values).length > 0
          ? { settings: values as SavedInstance['settings'] }
          : {}),
        ...(typeof zIndex === 'number' ? { zIndex } : {}),
        ...(parentId ? { groupId: parentId } : {}),
      };
      const order = legacy?.order;
      return {
        instance,
        rank: typeof order === 'number' ? order : Number.POSITIVE_INFINITY,
        walk,
      };
    })
    .sort((left, right) => left.rank - right.rank || left.walk - right.walk)
    .map(({ instance }) => instance);

const nodeOf = (
  pluginId: string,
  fullId: string,
  instance: SavedInstance,
  legacy: PluginLegacy,
): Node =>
  ({
    type: 'element',
    id: fullId,
    kind: pluginKindName(pluginId),
    frame: {
      x: instance.position.x,
      y: instance.position.y,
      width: instance.measuredSize?.width ?? PLUGIN_FALLBACK_SIZE.width,
      height: instance.measuredSize?.height ?? PLUGIN_FALLBACK_SIZE.height,
      rotation: 0,
    },
    // 숨김 false·빈 설정은 칸을 뺀다 (백엔드 문서 모양과 같게)
    ...(instance.hidden === true ? { hidden: true } : {}),
    ...(instance.settings && Object.keys(instance.settings).length > 0
      ? { values: instance.settings as Record<string, JsonValue> }
      : {}),
    legacy,
  } as unknown as Node);

// 자리를 정하는 항목 칸 - 없는 값은 빼서 백엔드가 맨 위에 둔다
const placedEntry = (
  entry: Record<string, unknown>,
  instance: SavedInstance,
  sceneId: string,
) => {
  const {
    zIndex: _zIndex,
    groupId: _groupId,
    ...rest
  } = { ...entry } as Record<string, unknown>;
  return {
    ...rest,
    instanceId: instance.instanceId,
    tabId: sceneId,
    ...(instance.zIndex !== undefined ? { zIndex: instance.zIndex } : {}),
    ...(instance.groupId !== undefined ? { groupId: instance.groupId } : {}),
  };
};

// 장면에 그 그룹이 있으면 그 그룹 - 다시 넣기는 화면에 바로 그 그룹 안으로 (자리는 백엔드가 항목 값으로 정한다)
const parentIn = (
  view: TreeView,
  sceneId: string,
  groupId: string | undefined,
): string | null => {
  if (!groupId) return null;
  const has = (nodes: readonly Node[]): boolean =>
    nodes.some(
      (node) =>
        node.type === 'group' && (node.id === groupId || has(node.children)),
    );
  return has(view.getScene(sceneId)?.nodes ?? []) ? groupId : null;
};

/** 런타임이 바꾼 인스턴스(이전 → 다음, fullId 열쇠) → 트리 연산. 이번에 바뀐 칸 중 트리와 다른 것만 쓴다 */
export const pluginInstanceOps = (
  view: TreeView,
  pluginId: string,
  previous: ReadonlyMap<string, SavedInstance>,
  next: ReadonlyMap<string, SavedInstance>,
): Op[] => {
  const nodes = pluginNodes(view, pluginId);
  const ops: Op[] = [];
  for (const [fullId, instance] of next) {
    const before = previous.get(fullId);
    if (before && sameJson(before, instance)) continue;
    const sceneId = normalizePluginInstanceTabId(instance.tabId);
    const found = nodes.get(fullId);
    if (!found) {
      ops.push({
        op: 'insert',
        scene: sceneId,
        parent: parentIn(view, sceneId, instance.groupId),
        index: null,
        node: nodeOf(pluginId, fullId, instance, {
          pluginEntry: placedEntry({}, instance, sceneId),
        }),
      });
      continue;
    }
    const { node, parentId } = found;
    const changed = <Key extends keyof SavedInstance>(key: Key) =>
      !before || !sameJson(before[key], instance[key]);
    const moved =
      found.sceneId !== sceneId ||
      (changed('zIndex') &&
        instance.zIndex !== legacyOf(node)?.pluginEntry?.zIndex) ||
      (changed('groupId') && (instance.groupId ?? null) !== parentId);
    if (moved) {
      const legacy = legacyOf(node) ?? {};
      ops.push(
        { op: 'remove', scene: found.sceneId, ids: [fullId] },
        {
          op: 'insert',
          scene: sceneId,
          parent: parentIn(view, sceneId, instance.groupId),
          index: null,
          node: nodeOf(pluginId, fullId, instance, {
            ...legacy,
            pluginEntry: placedEntry(
              legacy.pluginEntry ?? {},
              instance,
              sceneId,
            ),
          }),
        },
      );
      continue;
    }
    // 설정 칸을 뺐으면 값을 통째로 바꾼다 - 값 쓰기는 합치기라, 같은 자리에 빼고 다시 넣는다 (예전 목록 쓰기와 같다)
    const current = node.values ?? {};
    const removedKey =
      changed('settings') &&
      Object.keys(current).some((key) => !(key in (instance.settings ?? {})));
    if (removedKey) {
      ops.push(
        { op: 'remove', scene: sceneId, ids: [fullId] },
        {
          op: 'insert',
          scene: sceneId,
          parent: found.parentId,
          index: found.index,
          node: nodeOf(pluginId, fullId, instance, legacyOf(node) ?? {}),
        },
      );
      continue;
    }
    const frame: Partial<Record<'x' | 'y' | 'width' | 'height', number>> = {};
    if (changed('position')) {
      if (instance.position.x !== node.frame.x) frame.x = instance.position.x;
      if (instance.position.y !== node.frame.y) frame.y = instance.position.y;
    }
    if (changed('measuredSize') && instance.measuredSize) {
      if (instance.measuredSize.width !== node.frame.width) {
        frame.width = instance.measuredSize.width;
      }
      if (instance.measuredSize.height !== node.frame.height) {
        frame.height = instance.measuredSize.height;
      }
    }
    if (Object.keys(frame).length > 0) {
      ops.push({ op: 'setFrame', scene: sceneId, id: fullId, frame });
    }
    const hidden = instance.hidden === true;
    if (changed('hidden') && hidden !== (node.hidden === true)) {
      ops.push({ op: 'setCommon', scene: sceneId, id: fullId, hidden });
    }
    if (changed('settings')) {
      const values = Object.fromEntries(
        Object.entries(instance.settings ?? {}).filter(
          ([key, value]) => !sameJson(current[key], value),
        ),
      ) as Record<string, JsonValue>;
      if (Object.keys(values).length > 0) {
        ops.push({ op: 'setValues', scene: sceneId, id: fullId, values });
      }
    }
  }
  for (const fullId of previous.keys()) {
    if (next.has(fullId)) continue;
    const found = nodes.get(fullId);
    if (found) {
      ops.push({ op: 'remove', scene: found.sceneId, ids: [fullId] });
    }
  }
  return ops;
};

const documentOf = (view: TreeView): Document => ({
  formatVersion: 1,
  kindVersions: {},
  scenes: Object.fromEntries(
    view.getSceneIds().flatMap((sceneId) => {
      const scene = view.getScene(sceneId);
      return scene ? [[sceneId, scene]] : [];
    }),
  ),
});

const viewOf = (document: Document): TreeView => ({
  getSceneIds: () => Object.keys(document.scenes),
  getScene: (sceneId) => document.scenes[sceneId],
});

/** 백엔드가 자리를 정하는 다시 넣기 - 겹침값을 실은 플러그인 노드를 index 없이 넣는 연산과 그 노드의 빼기.
 * 그대로 화면에 얹으면 장면·그룹 맨 위에 놓였다가 패치로 제자리에 가 튀므로, 화면에는 같은 부모면 빼기 직전
 * 자리에 다시 넣는 연산(`placedLocal` - 바뀐 값은 바로 보인다)을 얹고 자리는 패치로 받는다 (놓기 규칙을 TS에 두지 않는다).
 * 빼기 직전 자리는 화면에 먼저 얹히는 이어 붙이는 편집(`local`, 편집 하나)과 같은 편집의 앞선 다시 넣기를
 * 적용한 뒤 기준이다 - 화면처럼 빈 그룹 정리는 편집 끝에서만 한다.
 * 겹침값 없는 넣기는 맨 위라 백엔드 놓기와 같아 그대로 얹는다 */
export const splitBackendPlacedOps = (
  view: TreeView,
  pluginId: string,
  ops: Op[],
): { placed: Op[]; placedLocal: Op[]; local: Op[] } => {
  const placedIds = new Set(
    ops.flatMap((op) =>
      op.op === 'insert' &&
      op.index === null &&
      typeof legacyOf(op.node as ElementNode)?.pluginEntry?.zIndex === 'number'
        ? [op.node.id]
        : [],
    ),
  );
  if (placedIds.size === 0) return { placed: [], placedLocal: [], local: ops };
  const isPlaced = (op: Op) =>
    (op.op === 'insert' && placedIds.has(op.node.id)) ||
    (op.op === 'remove' && op.ids.some((id) => placedIds.has(id)));
  const placed = ops.filter(isPlaced);
  const local = ops.filter((op) => !isPlaced(op));
  let document = applyLocalOps(documentOf(view), local);
  const removedAt = new Map<string, PluginNode>();
  const placedLocal = placed.map((op) => {
    if (op.op === 'remove') {
      const nodes = pluginNodes(viewOf(document), pluginId);
      for (const id of op.ids) {
        const found = nodes.get(id);
        if (found) removedAt.set(id, found);
      }
    }
    const found = op.op === 'insert' ? removedAt.get(op.node.id) : undefined;
    const shown =
      op.op === 'insert' &&
      found &&
      found.sceneId === op.scene &&
      (found.parentId ?? null) === op.parent
        ? { ...op, index: found.index }
        : op;
    document = applyLocalOp(document, shown);
    return shown;
  });
  return { placed, placedLocal, local };
};
