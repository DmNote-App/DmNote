/**
 * 플러그인 인스턴스 undo/redo 재결합 (C4, main 전용)
 * pluginInstances:changed 수신 → canonical pull → 등록된 정의별 reapplier로 재주입
 * 자기 commit의 echo는 originMutationId로 식별해 재주입하지 않음
 */

import {
  pluginInstancesApi,
  type SavedPluginInstanceWire,
} from '@api/modules/plugin/pluginInstancesApi';
import { noteBackendPluginRevision } from '@plugins/runtime/pluginModelRevision';
import { pruneStalePluginSelection } from '@stores/grid/useDocumentSelectionStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { withoutInstanceSave } from './instanceSaveSuppression';
import { isPluginElementEditing } from './pluginTreeEditOwnership';

interface PluginInstancesRebindHandlers {
  // 이벤트 도착 즉시 - 낡은 메모리를 커밋할 pending 저장 차단
  cancelPendingSave: () => void;
  reapply: (instances: SavedPluginInstanceWire[]) => void;
}

// pluginId → defId → handlers (plugin unload 시 해제 - 미등록이면 저장만 유지)
const reappliers = new Map<
  string,
  Map<string, PluginInstancesRebindHandlers>
>();

// 이 창에서 발신한 mutation id - changed echo 식별 (bounded)
const OWN_MUTATION_LIMIT = 256;
const ownMutationIds = new Set<string>();

// 자기 트리 편집(동작 id) - 알림 뒤 저장된 값을 맞춘다
const ownTreeEditIds = new Set<string>();

export const notePluginTreeEdit = (gestureId: string): void => {
  notePluginInstancesMutation(gestureId);
  ownTreeEditIds.add(gestureId);
  if (ownTreeEditIds.size > OWN_MUTATION_LIMIT) {
    const oldest = ownTreeEditIds.values().next().value;
    if (oldest !== undefined) ownTreeEditIds.delete(oldest);
  }
};

export const notePluginInstancesMutation = (mutationId: string): void => {
  ownMutationIds.add(mutationId);
  if (ownMutationIds.size > OWN_MUTATION_LIMIT) {
    const oldest = ownMutationIds.values().next().value;
    if (oldest !== undefined) ownMutationIds.delete(oldest);
  }
};

export const registerPluginInstancesReapplier = (
  pluginId: string,
  defId: string,
  handlers: PluginInstancesRebindHandlers,
): (() => void) => {
  let byDef = reappliers.get(pluginId);
  if (!byDef) {
    byDef = new Map();
    reappliers.set(pluginId, byDef);
  }
  byDef.set(defId, handlers);
  return () => {
    const current = reappliers.get(pluginId);
    if (!current) return;
    if (current.get(defId) === handlers) current.delete(defId);
    if (current.size === 0) reappliers.delete(pluginId);
  };
};

export const cancelPendingPluginInstanceSaves = (pluginId: string): void => {
  reappliers.get(pluginId)?.forEach((handlers) => {
    handlers.cancelPendingSave();
  });
};

export const applyCommittedPluginInstancesProjection = (
  pluginId: string,
  apply: () => void,
): void => {
  apply();
  // projection 구독이 만든 trailing save는 방금 성공한 canonical commit과 중복
  cancelPendingPluginInstanceSaves(pluginId);
};

// plugin별 적용 revision 단조 - 연속 undo/redo에서 늦은 pull의 역행 방지
const appliedRevisions = new Map<string, number>();

/** canonical pull 후 등록된 정의별 diff 적용 - undo 재결합과 실패 복구가 공유 */
export const applyCanonicalPluginInstances = async (
  pluginId: string,
  force = false,
): Promise<void> => {
  const snapshot = await pluginInstancesApi.get(pluginId);
  noteBackendPluginRevision(snapshot.modelRevision);
  const applied = appliedRevisions.get(pluginId) ?? 0;
  if (!force && snapshot.modelRevision <= applied) return;
  appliedRevisions.set(pluginId, snapshot.modelRevision);

  const byDef = reappliers.get(pluginId);
  if (!byDef) return;
  for (const handlers of byDef.values()) {
    handlers.reapply(snapshot.instances);
  }
  // diff-patch 재주입은 생존 fullId를 보존한다 - prune은 스냅샷 밖으로
  // 소멸한 fullId를 쥔 선택만 정밀 정리하고 생존 선택은 그대로 유지된다
  pruneStalePluginSelection(
    new Set(
      usePluginDisplayElementStore
        .getState()
        .elements.map((element) => element.fullId),
    ),
    pluginId,
  );
};

// 자기 트리 커밋 뒤 저장된 값 맞추기 - 플러그인별 마지막으로 맞춘 리비전 (늦게 온 조회가 되돌리지 않게)
const ownSyncedRevisions = new Map<string, number>();

/** 자기 트리 편집이 확정된 뒤 저장된 값으로 맞춘다 - 밀린 저장은 그대로 둔다(취소하지 않는다).
 * 겹침·그룹 값은 늘(백엔드가 이웃 노드도 다시 정한다). 틀·숨김은 그 편집이 고친 요소(frameTargets) 중
 * 편집기가 다시 고치는 중이 아닌 것만 (끼어든 되돌리기의 다시 받기가 덮은 값 등) - 다른 요소는 아직 저장하지
 * 않은 스크립트 변경이 있을 수 있다 */
export const syncOwnTreeEditFields = (
  pluginId: string,
  frameTargets: ReadonlySet<string> = new Set(),
): void => {
  void pluginInstancesApi
    .get(pluginId)
    .then((snapshot) => {
      // 다른 창 되돌리기 등으로 이미 더 새 값을 받았으면 늦게 온 조회는 버린다
      const synced = Math.max(
        ownSyncedRevisions.get(pluginId) ?? 0,
        appliedRevisions.get(pluginId) ?? 0,
      );
      if (snapshot.modelRevision < synced) return;
      ownSyncedRevisions.set(pluginId, snapshot.modelRevision);
      const saved = new Map<string, SavedPluginInstanceWire>(
        snapshot.instances.flatMap((instance) =>
          instance.instanceId
            ? [[`${pluginId}::${instance.instanceId}`, instance] as const]
            : [],
        ),
      );
      const store = usePluginDisplayElementStore.getState();
      withoutInstanceSave(() => {
        for (const element of store.elements) {
          const instance = saved.get(element.fullId);
          if (!instance) continue;
          const patch: Partial<typeof element> = {};
          if (element.zIndex !== instance.zIndex)
            patch.zIndex = instance.zIndex;
          if (element.groupId !== instance.groupId) {
            patch.groupId = instance.groupId;
          }
          if (
            frameTargets.has(element.fullId) &&
            !isPluginElementEditing(element.fullId)
          ) {
            if (
              element.position.x !== instance.position.x ||
              element.position.y !== instance.position.y
            ) {
              patch.position = instance.position;
            }
            if (
              instance.measuredSize &&
              (element.measuredSize?.width !== instance.measuredSize.width ||
                element.measuredSize?.height !== instance.measuredSize.height)
            ) {
              patch.measuredSize = instance.measuredSize;
            }
            if ((element.hidden ?? false) !== (instance.hidden ?? false)) {
              patch.hidden = instance.hidden ?? false;
            }
          }
          if (Object.keys(patch).length > 0) {
            store.updateElement(element.fullId, patch);
          }
        }
      });
    })
    .catch((error) => {
      console.error(`[Plugin ${pluginId}] Failed to sync tree edit`, error);
    });
};

/** main 창 bootstrap에서 1회 호출 */
export const initPluginInstancesUndoSync = (): (() => void) => {
  const unsubscribe = pluginInstancesApi.onChanged((payload) => {
    if (!payload || typeof payload.pluginId !== 'string') return;
    // 자기 commit echo - 메모리가 이미 원본이므로 재주입 불필요. 자기 트리 편집이면 백엔드가 이웃 노드의
    // 겹침·그룹 값을 다시 정했을 수 있어 그 값만 맞춘다
    if (
      payload.originMutationId &&
      ownMutationIds.has(payload.originMutationId)
    ) {
      if (ownTreeEditIds.has(payload.originMutationId)) {
        syncOwnTreeEditFields(payload.pluginId);
      }
      return;
    }
    if (typeof payload.revision === 'number') {
      noteBackendPluginRevision(payload.revision);
    }
    // barrier 승리 - canonical pull이 끝나기 전에 낡은 메모리가 저장되지 않게 즉시 차단
    cancelPendingPluginInstanceSaves(payload.pluginId);
    void applyCanonicalPluginInstances(payload.pluginId).catch((error) => {
      console.error(
        `[Plugin ${payload.pluginId}] Failed to reapply canonical instances:`,
        error,
      );
    });
  });
  return () => {
    unsubscribe?.();
    reappliers.clear();
    ownMutationIds.clear();
    ownTreeEditIds.clear();
    appliedRevisions.clear();
    ownSyncedRevisions.clear();
  };
};
