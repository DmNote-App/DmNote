// 편집기의 플러그인 요소 위치·크기 저장·지우기 - 트리 노드 연산으로 (같은 동작의 트리 요소 편집과 한 되돌리기).
// 런타임 스토어는 바로 고쳐 화면에 보이고(자동 저장 없이), 트리 커밋이 거절되면 저장된 값을 다시 받아 되돌린다.
// 트리에 아직 없는 요소(막 만든 요소)는 지금처럼 인스턴스 자동 저장에 맡긴다
import {
  ElementEditHeldError,
  type ElementDocumentStore,
} from '@src/renderer/editor/document/elementDocumentStore';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { trackEditorWrite } from '@src/renderer/editor/runtime/lifecycle/editorWriteBarrier';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import type { FramePatch, Op } from '@src/types/generated/elementDocument';
import { setPluginElementsHidden } from './pluginElementActions';
import {
  flushPluginInstancesEditSession,
  settledPluginInstancesCommits,
} from './instancesCommitQueue';
import {
  applyCanonicalPluginInstances,
  notePluginTreeEdit,
  syncOwnTreeEditFields,
} from './instancesUndoSync';
import {
  beginPluginTreeEdit,
  endPluginTreeEdit,
  markPluginElementsEditing,
  releasePluginElementsEditing,
} from './pluginTreeEditOwnership';
import { withoutInstanceSave } from './instanceSaveSuppression';

const treeStore = (): ElementDocumentStore | null => {
  const store = getElementDocumentStore();
  return store?.edit ? store : null;
};

/** 플러그인 요소 고치기 - 트리에 노드가 있는 요소는 자동 저장 없이, 없는 요소는 자동 저장으로 */
export const applyPluginElementEdit = (
  sceneId: string,
  fullIds: ReadonlySet<string>,
  change: (ids: ReadonlySet<string>) => void,
) => {
  const store = treeStore();
  const backed = new Set(
    [...fullIds].filter((id) => store?.getElement(sceneId, id)),
  );
  const rest = new Set([...fullIds].filter((id) => !backed.has(id)));
  if (rest.size > 0) change(rest);
  if (backed.size > 0) {
    markPluginElementsEditing(backed);
    withoutInstanceSave(() => change(backed));
  }
};

/** 런타임 위치·측정 크기를 트리 노드 틀로 저장 - 바뀐 것만, 노드가 없으면 건너뛴다 */
export const commitPluginFrames = (
  sceneId: string,
  fullIds: Iterable<string>,
  gestureId?: string,
): Promise<void> => {
  const store = treeStore();
  if (!store) return Promise.resolve();
  const ids = new Set(fullIds);
  const elements = usePluginDisplayElementStore
    .getState()
    .elements.filter((element) => ids.has(element.fullId));
  const ops: Op[] = [];
  for (const element of elements) {
    const node = store.getElement(sceneId, element.fullId);
    if (!node) continue;
    const frame: FramePatch = {};
    if (node.frame.x !== element.position.x) frame.x = element.position.x;
    if (node.frame.y !== element.position.y) frame.y = element.position.y;
    const size = element.measuredSize;
    if (size && node.frame.width !== size.width) frame.width = size.width;
    if (size && node.frame.height !== size.height) frame.height = size.height;
    if (Object.keys(frame).length > 0) {
      ops.push({ op: 'setFrame', scene: sceneId, id: element.fullId, frame });
    }
  }
  // 미리보기로 고친 요소 표시는 여기서 풀고, 바뀐 것만 보내는 동안 다시 잡는다
  releasePluginElementsEditing(ids);
  if (ops.length === 0) return Promise.resolve();
  return sendPluginTreeEdit(
    ops,
    elements.map((element) => element.pluginId),
    gestureId,
  );
};

// 연산이 고치는 플러그인 요소 id (fullId에만 '::'가 든다)
const pluginTargetsOf = (ops: readonly Op[]): string[] =>
  ops
    .flatMap((op) =>
      op.op === 'remove'
        ? op.ids
        : op.op === 'setFrame' || op.op === 'setCommon'
        ? [op.id]
        : [],
    )
    .filter((id) => id.includes('::'));

/** 플러그인 노드를 고치는 트리 편집 보내기 - 트리 스토어가 편집을 버리면(영구 실패 - 보류했다 다시 보낸 뒤 포함)
 * 그 플러그인을 저장된 값으로 되돌린다. 보류한 편집은 화면에 남고 트리 스토어가 다시 보낸다 */
export const sendPluginTreeEdit = (
  ops: Op[],
  pluginIds: Iterable<string>,
  gestureId?: string,
): Promise<void> => {
  const store = treeStore();
  if (!store) return Promise.resolve();
  const ids = [...new Set(pluginIds)];
  const restore = () => {
    for (const pluginId of ids) {
      void applyCanonicalPluginInstances(pluginId, true).catch(() => undefined);
    }
  };
  // 트리 커밋의 플러그인 알림은 동작 id를 출처로 싣는다 - 자기 편집이라 밀린 저장을 취소하거나 다시 받지 않는다
  const id = gestureId ?? crypto.randomUUID();
  notePluginTreeEdit(id);
  const targets = pluginTargetsOf(ops);
  beginPluginTreeEdit(targets);
  // 앞서 줄 선 인스턴스 저장(트리 연산 전 목록)이 먼저 닿게 - 플러그인 몫 변경이 이 동작의 기록에 들고,
  // 거절되면 그 전 값으로 돌아간다
  const sent = store.edit!(ops, {
    gestureId: id,
    onDropped: () => {
      endPluginTreeEdit(targets);
      restore();
    },
    onCommitted: () => {
      endPluginTreeEdit(targets);
      const frameTargets = new Set(targets);
      for (const pluginId of ids) {
        syncOwnTreeEditFields(pluginId, frameTargets);
      }
    },
    after: settledPluginInstancesCommits(ids),
  }).then(
    (result) => {
      if (result.status === 'committed') return;
      throw new Error(`[Plugin] tree edit rejected: ${result.code}`);
    },
    (error: unknown) => {
      if (error instanceof ElementEditHeldError) return;
      throw error;
    },
  );
  trackEditorWrite(sent).catch(() => undefined);
  return sent;
};

// 밀린 자동 저장을 런타임 스토어를 고치기 전 목록으로 먼저 보낸다 - 트리 편집 보내기는 이 저장이 끝난 뒤라
// (sendPluginTreeEdit) 지우기·숨기기의 플러그인 몫이 이 동작의 기록에 들고, 거절되면 그 전 값으로 돌아간다
const flushPendingSaves = (pluginIds: Iterable<string>) => {
  for (const pluginId of new Set(pluginIds)) {
    flushPluginInstancesEditSession(pluginId);
  }
};

/** 트리에서 지울 플러그인 요소를 런타임 스토어에서 먼저 뺀다(자동 저장 없이) - 그 플러그인 id들을 돌려준다
 * (sendPluginTreeEdit에 넘겨 거절되면 되돌린다) */
export const removePluginElementsLocally = (
  fullIds: readonly string[],
): string[] => {
  if (fullIds.length === 0) return [];
  const targets = new Set(fullIds);
  const store = usePluginDisplayElementStore.getState();
  const pluginIds = [
    ...new Set(
      store.elements
        .filter((element) => targets.has(element.fullId))
        .map((element) => element.pluginId),
    ),
  ];
  flushPendingSaves(pluginIds);
  withoutInstanceSave(() =>
    store.setElements(
      store.elements.filter((element) => !targets.has(element.fullId)),
    ),
  );
  return pluginIds;
};

/** 플러그인 요소 숨김 - 트리에 노드가 있으면 트리 공통 정보 연산으로(런타임 스토어는 자동 저장 없이 바로),
 * 없으면 인스턴스 자동 저장으로 */
export const setPluginElementHiddenInTree = (
  sceneId: string,
  fullId: string,
  hidden: boolean,
): Promise<void> => {
  const element = usePluginDisplayElementStore
    .getState()
    .elements.find((candidate) => candidate.fullId === fullId);
  if (!element) return Promise.resolve();
  if (!treeStore()?.getElement(sceneId, fullId)) {
    return setPluginElementsHidden([{ fullId, hidden }]).then(() => undefined);
  }
  flushPendingSaves([element.pluginId]);
  withoutInstanceSave(() =>
    usePluginDisplayElementStore.getState().updateElement(fullId, { hidden }),
  );
  return sendPluginTreeEdit(
    [{ op: 'setCommon', scene: sceneId, id: fullId, hidden }],
    [element.pluginId],
  );
};
