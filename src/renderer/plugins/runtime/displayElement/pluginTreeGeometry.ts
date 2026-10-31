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
import { flushPluginInstancesEditSession } from './instancesCommitQueue';
import { applyCanonicalPluginInstances } from './instancesUndoSync';
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
  if (backed.size > 0) withoutInstanceSave(() => change(backed));
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
  if (ops.length === 0) return Promise.resolve();
  const pluginIds = [...new Set(elements.map((element) => element.pluginId))];
  const restore = () =>
    Promise.all(
      pluginIds.map((pluginId) =>
        applyCanonicalPluginInstances(pluginId, true).catch(() => undefined),
      ),
    );
  const sent = store.edit!(ops, gestureId ? { gestureId } : undefined).then(
    async (result) => {
      if (result.status === 'committed') return;
      await restore();
      throw new Error(`[Plugin] frame edit rejected: ${result.code}`);
    },
    async (error: unknown) => {
      // 보류한 편집은 화면에 남고 트리 스토어가 다시 보낸다
      if (error instanceof ElementEditHeldError) return;
      await restore();
      throw error;
    },
  );
  trackEditorWrite(sent).catch(() => undefined);
  return sent;
};

/** 트리에서 지울 플러그인 요소를 런타임 스토어에서 먼저 뺀다(자동 저장 없이) - 돌려주는 함수는 저장된 값으로 되돌린다 */
export const removePluginElementsLocally = (
  fullIds: readonly string[],
): (() => Promise<void>) => {
  if (fullIds.length === 0) return () => Promise.resolve();
  const targets = new Set(fullIds);
  const store = usePluginDisplayElementStore.getState();
  const pluginIds = [
    ...new Set(
      store.elements
        .filter((element) => targets.has(element.fullId))
        .map((element) => element.pluginId),
    ),
  ];
  // 밀린 자동 저장은 지우기 전 목록으로 먼저 보낸다 - 지운 뒤 목록이 트리 지우기보다 먼저 닿으면
  // 노드가 먼저 사라져 트리 지우기 전체가 거절된다
  pluginIds.forEach(flushPluginInstancesEditSession);
  withoutInstanceSave(() =>
    store.setElements(
      store.elements.filter((element) => !targets.has(element.fullId)),
    ),
  );
  return () =>
    Promise.all(
      pluginIds.map((pluginId) =>
        applyCanonicalPluginInstances(pluginId, true).catch(() => undefined),
      ),
    ).then(() => undefined);
};
