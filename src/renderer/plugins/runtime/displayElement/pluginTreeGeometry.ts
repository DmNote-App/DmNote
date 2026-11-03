// 편집기의 플러그인 요소 틀·숨김 저장 - 트리에 노드가 있는 인스턴스는 트리 노드 연산으로 (같은 동작의 트리 요소
// 편집과 한 되돌리기). 런타임 스토어는 트리 보기에서 파생하므로 트리 편집을 보내면 따라온다(거절되면 함께 돌아간다).
// 트리에 없는 런타임 요소(스크립트가 만든 요소)는 런타임 스토어만 고친다
import { ElementEditHeldError } from '@src/renderer/editor/document/elementDocumentStore';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { trackEditorWrite } from '@src/renderer/editor/runtime/lifecycle/editorWriteBarrier';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import type { FramePatch, Op } from '@src/types/generated/elementDocument';
import { setPluginElementsHidden } from './pluginElementActions';

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

/** 플러그인 요소 틀 - 인스턴스는 트리 틀 연산 하나로, 런타임 요소는 런타임 스토어에서 (위치·측정 크기) */
export const setPluginElementFrames = (
  sceneId: string,
  frames: ReadonlyMap<string, FramePatch>,
  gestureId?: string,
): Promise<void> => {
  const store = getElementDocumentStore();
  const ops: Op[] = [];
  const runtime = new Map<string, FramePatch>();
  for (const [fullId, frame] of frames) {
    if (store?.getElement(sceneId, fullId)) {
      ops.push({ op: 'setFrame', scene: sceneId, id: fullId, frame });
    } else {
      runtime.set(fullId, frame);
    }
  }
  if (runtime.size > 0) {
    const plugins = usePluginDisplayElementStore.getState();
    plugins.setElements(
      plugins.elements.map((element) => {
        const frame = runtime.get(element.fullId);
        if (!frame) return element;
        const sized = frame.width != null || frame.height != null;
        return {
          ...element,
          position: {
            x: frame.x ?? element.position.x,
            y: frame.y ?? element.position.y,
          },
          ...(sized
            ? {
                measuredSize: {
                  width: frame.width ?? element.measuredSize?.width ?? 0,
                  height: frame.height ?? element.measuredSize?.height ?? 0,
                },
              }
            : {}),
        };
      }),
    );
  }
  return ops.length > 0
    ? sendPluginTreeEdit(ops, gestureId)
    : Promise.resolve();
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
