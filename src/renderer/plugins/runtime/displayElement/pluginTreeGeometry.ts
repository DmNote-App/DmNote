// 편집기의 플러그인 요소 위치·크기 저장·숨기기 - 트리 노드 연산으로 (같은 동작의 트리 요소 편집과 한 되돌리기).
// 런타임 스토어는 트리 보기에서 파생하므로 트리 편집을 보내면 따라온다(거절되면 함께 돌아간다).
// 끌기·크기 미리보기만 런타임 스토어를 먼저 고치고(미리보는 요소는 저장·트리 반영에서 빠진다), 끝날 때 트리 틀로 저장한다
import { ElementEditHeldError } from '@src/renderer/editor/document/elementDocumentStore';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { trackEditorWrite } from '@src/renderer/editor/runtime/lifecycle/editorWriteBarrier';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import type { FramePatch, Op } from '@src/types/generated/elementDocument';
import { setPluginElementsHidden } from './pluginElementActions';
import {
  markPluginElementsEditing,
  releasePluginElementsEditing,
} from './pluginTreeEditOwnership';

/** 플러그인 요소 미리보기 - 런타임 스토어만 고친다. 끝은 commitPluginFrames, 취소는 releasePluginElementsEditing */
export const applyPluginElementEdit = (
  fullIds: ReadonlySet<string>,
  change: (ids: ReadonlySet<string>) => void,
) => {
  markPluginElementsEditing(fullIds);
  change(fullIds);
};

/** 플러그인 노드를 고치는 트리 편집 보내기 - 보류한 편집은 화면에 남고 트리 스토어가 다시 보낸다 */
export const sendPluginTreeEdit = (
  ops: Op[],
  gestureId?: string,
): Promise<void> => {
  const store = getElementDocumentStore();
  if (!store?.edit) return Promise.resolve();
  const sent = store.edit(ops, gestureId ? { gestureId } : undefined).then(
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

/** 미리보기를 끝내고 런타임 위치·측정 크기를 트리 노드 틀로 저장 - 바뀐 것만, 노드가 없으면 건너뛴다 */
export const commitPluginFrames = (
  sceneId: string,
  fullIds: Iterable<string>,
  gestureId?: string,
): Promise<void> => {
  const store = getElementDocumentStore();
  const ids = new Set(fullIds);
  const ops: Op[] = [];
  for (const element of usePluginDisplayElementStore.getState().elements) {
    if (!ids.has(element.fullId)) continue;
    const node = store?.getElement(sceneId, element.fullId);
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
  // 보낸 뒤 미리보기를 푼다 - 풀면 런타임이 (이미 고친) 트리 보기로 맞춰진다
  const sent = ops.length > 0 ? sendPluginTreeEdit(ops, gestureId) : null;
  releasePluginElementsEditing(ids);
  return sent ?? Promise.resolve();
};

/** 플러그인 요소 숨김 - 트리에 노드가 있으면 트리 공통 정보 연산으로, 없으면(저장하지 않는 요소) 런타임 스토어에서 */
export const setPluginElementHiddenInTree = (
  sceneId: string,
  fullId: string,
  hidden: boolean,
): Promise<void> => {
  if (!getElementDocumentStore()?.getElement(sceneId, fullId)) {
    return setPluginElementsHidden([{ fullId, hidden }]).then(() => undefined);
  }
  return sendPluginTreeEdit([
    { op: 'setCommon', scene: sceneId, id: fullId, hidden },
  ]);
};
