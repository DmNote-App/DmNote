// 플러그인 인스턴스 ↔ 트리 노드 - 저장 원본은 트리 하나다 (요소 id = `{플러그인}::{인스턴스}`, 장면 = 탭).
// 읽기는 장면의 플러그인 노드를 저장 모양으로, 쓰기는 런타임이 바꾼 칸만 트리 연산으로 옮긴다.
// 탭·겹침값·그룹을 바꾸면 빼고 다시 넣는다 - 자리는 노드가 든 자기 항목의 값으로 백엔드가 정한다
// (인스턴스 목록 쓰기와 같은 놓기)
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type {
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
      for (const node of nodes) {
        if (node.type === 'group') visit(node.children, node.id);
        else if (
          node.kind === kind &&
          node.id.startsWith(prefix) &&
          node.id.length > prefix.length
        ) {
          found.set(node.id, { sceneId, node, parentId });
        }
      }
    };
    visit(view.getScene(sceneId)?.nodes ?? [], null);
  }
  return found;
};

// 측정 크기가 없던 인스턴스는 기본 크기 틀이다 (백엔드 버킷 ↔ 트리와 같은 규칙)
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
    hidden: instance.hidden === true,
    values: (instance.settings ?? {}) as Record<string, JsonValue>,
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
        parent: null,
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
          parent: null,
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
      const current = node.values ?? {};
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
