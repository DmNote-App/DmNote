// 플러그인 인스턴스 저장 - 원본은 트리 하나 (main 전용).
// 런타임 스토어의 이 정의 요소는 트리 보기에서 파생한다(처음 복원·되돌리기·다른 창 쓰기·트리 편집 모두 트리 알림).
// 플러그인 스크립트·측정·설정 패널이 런타임 스토어를 바꾸면 바뀐 칸만 트리 연산으로 이어 붙여 보낸다
// (조용해진 뒤 커밋 하나 - 예전 자동 저장의 묶어 보내기). 트리 → 런타임 반영이 만든 변경은 다시 쓰지 않고,
// 보내지 못한 편집은 트리 보기에서 빠져 런타임도 따라 돌아간다
import { trackPluginWork } from '@plugins/runtime/pluginRuntimeReadiness';
import { isPluginTearingDown } from '@plugins/runtime/pluginTeardown';
import { pruneStalePluginSelection } from '@stores/grid/useDocumentSelectionStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import {
  ElementEditHeldError,
  type ElementDocumentStore,
} from '@src/renderer/editor/document/elementDocumentStore';
import { loadElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { trackEditorWrite } from '@src/renderer/editor/runtime/lifecycle/editorWriteBarrier';
import type { ElementDocumentCommitResult } from '@api/modules/editor/elementDocumentApi';
import type { Op } from '@src/types/generated/elementDocument';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import { createPluginInstanceSaveBarrier } from '../displayElement/instanceLifecycle';
import {
  registerPluginInstancesEditSessionFlush,
  touchPluginInstancesEditSession,
} from '../displayElement/instancesCommitQueue';
import type { SavedInstance } from './pluginInstanceSnapshotApplier';
import {
  pluginInstanceOps,
  pluginInstancesFromTree,
  splitBackendPlacedOps,
} from './pluginTreeInstances';

// 드래그 등 프레임 단위 변경을 커밋 하나로 - 조용해진 뒤 보낸다
const INSTANCE_SAVE_QUIET_MS = 200;

interface CreatePluginInstancePersistenceRuntimeOptions {
  pluginId: string;
  definitionId: string;
  registerCleanup: (cleanup: () => void) => void;
  buildSavedPluginInstances: (
    elements: readonly PluginDisplayElementInternal[],
    definitionId: string,
  ) => SavedInstance[];
  // 트리 문서에 이 플러그인의 요소 종류를 알린 뒤 - 쓰기는 그 뒤에 (모르는 종류 넣기는 거절된다)
  kindRegistered?: Promise<unknown>;
}

type ApplyPluginInstancesSnapshot = (
  savedInstances: SavedInstance[],
  readiness: 'ready' | 'failed',
) => void;

export const createPluginInstancePersistenceRuntime = ({
  pluginId,
  definitionId: defId,
  registerCleanup,
  buildSavedPluginInstances,
  kindRegistered,
}: CreatePluginInstancePersistenceRuntimeOptions) => {
  let restoreWindowChanged = false;
  // 트리 → 런타임 반영 중이거나 복원 전이면 저장하지 않는다 - 복원 전 변경은 복원 뒤 한 번에
  const instanceSaveBarrier = createPluginInstanceSaveBarrier(() => {
    restoreWindowChanged = true;
  });

  const instancesOf = (elements: readonly PluginDisplayElementInternal[]) =>
    new Map(
      buildSavedPluginInstances(elements, defId).map((instance) => [
        `${pluginId}::${instance.instanceId}`,
        instance,
      ]),
    );

  let store: ElementDocumentStore | null = null;

  const report = (sent: Promise<ElementDocumentCommitResult>) => {
    void trackEditorWrite(sent).then(
      (result) => {
        if (result.status === 'rejected') {
          console.warn(
            `[Plugin ${pluginId}] Instance write rejected: ${result.code}`,
          );
        }
      },
      (error: unknown) => {
        if (error instanceof ElementEditHeldError) return;
        console.error(`[Plugin ${pluginId}] Failed to save instances:`, error);
      },
    );
  };

  const send = (ops: Op[]) => {
    if (ops.length === 0 || !store?.editCoalesced) return;
    const gestureId = touchPluginInstancesEditSession(pluginId);
    // 겹침값을 바꾼 다시 넣기는 패치로 받는다(백엔드 놓기) - 나머지는 화면에 먼저 얹고 이어 붙인다
    const { placed, local } = splitBackendPlacedOps(ops);
    if (local.length > 0) {
      report(
        store.editCoalesced(local, {
          key: pluginId,
          quietMs: INSTANCE_SAVE_QUIET_MS,
          gestureId,
        }),
      );
    }
    if (placed.length > 0 && store.edit) {
      report(store.edit(placed, { gestureId, local: false }));
    }
  };

  const connectSnapshotApplier = (
    applyInstancesSnapshot: ApplyPluginInstancesSnapshot,
  ) => {
    if (window.__dmn_window_type !== 'main') {
      instanceSaveBarrier.finishRestoration();
      return;
    }

    let disposed = false;
    let unsubscribeTree: (() => void) | null = null;
    let lastApplied: string | null = null;
    // 트리 → 런타임 반영 중 - 그 변경은 다시 쓰지 않는다
    let applying = false;
    registerCleanup(() => {
      disposed = true;
      unsubscribeTree?.();
      unsubscribeTree = null;
      store = null;
    });

    // 트리 → 런타임
    const reapply = () => {
      if (!store) return;
      const instances = pluginInstancesFromTree(store, pluginId);
      const key = JSON.stringify(instances);
      if (key === lastApplied) return;
      lastApplied = key;
      applying = true;
      try {
        applyInstancesSnapshot(instances, 'ready');
      } finally {
        applying = false;
      }
      pruneStalePluginSelection(
        new Set(
          usePluginDisplayElementStore
            .getState()
            .elements.map((element) => element.fullId),
        ),
        pluginId,
      );
    };

    const restoreWork = (async () => {
      const loaded = await loadElementDocumentStore();
      await kindRegistered?.catch(() => undefined);
      if (disposed) return;
      store = loaded;
      reapply();
      unsubscribeTree = loaded.subscribe(reapply);
      // 복원 전에 만든 요소(트리에 없는 것)를 넣는다
      if (instanceSaveBarrier.finishRestoration() && restoreWindowChanged) {
        const created = new Map(
          [
            ...instancesOf(usePluginDisplayElementStore.getState().elements),
          ].filter(([fullId]) =>
            loaded
              .getSceneIds()
              .every((sceneId) => !loaded.getElement(sceneId, fullId)),
          ),
        );
        send(pluginInstanceOps(loaded, pluginId, new Map(), created));
      }
    })().catch((error: unknown) => {
      instanceSaveBarrier.failRestoration();
      throw error;
    });
    trackPluginWork(restoreWork);
    void restoreWork.catch((error) => {
      console.error(`[Plugin ${pluginId}] Failed to restore instances:`, error);
    });

    // 런타임 → 트리. 바뀐 칸만 (트리 → 런타임 반영·플러그인을 내리는 중 변경은 빼고)
    const unsubscribeStore = usePluginDisplayElementStore.subscribe(
      (state, previous) => {
        if (state.elements === previous.elements || applying) return;
        if (!instanceSaveBarrier.shouldSave()) return;
        if (isPluginTearingDown(pluginId) || !store) return;
        send(
          pluginInstanceOps(
            store,
            pluginId,
            instancesOf(previous.elements),
            instancesOf(state.elements),
          ),
        );
      },
    );
    registerCleanup(unsubscribeStore);
    // 지우기·만들기는 끊어 보낸다 (조용해지길 기다리지 않는다)
    registerCleanup(
      registerPluginInstancesEditSessionFlush(pluginId, () =>
        store?.flushCoalesced?.(),
      ),
    );
  };

  return {
    connectSnapshotApplier,
    instanceSaveBarrier,
  };
};
