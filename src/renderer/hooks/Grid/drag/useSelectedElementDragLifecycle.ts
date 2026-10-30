import { useRef } from 'react';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import {
  beginPluginInstancesEditSession,
  endPluginInstancesEditSession,
} from '@plugins/runtime/displayElement/instancesCommitQueue';
import {
  beginMixedGestureTransaction,
  cancelUncommittedMixedGestureTransaction,
} from '@plugins/runtime/displayElement/gestureTransaction';
import { createPluginPositionDragReceipt } from '@plugins/runtime/displayElement/pluginElementActions';
import { createNativePositionDragReceipt } from '@src/renderer/editor/runtime/intent/elementIntent';

// 함께 고른 다른 선택(트리 요소)의 끌기 - 증분 이동, 끝낼 때 커밋, 취소 때 되돌리기
export interface CompanionDragReceipt {
  move: (deltaX: number, deltaY: number) => void;
  // gestureId - 같은 끌기의 옛 종류 편집과 한 되돌리기 단계로 합친다
  commit: (gestureId?: string) => unknown;
  rollback: () => void;
}

interface UseSelectedElementDragLifecycleOptions {
  freezeSelectionForGesture: () => void;
  syncSelectedElementsToOverlay: (gestureId?: string) => void;
  moveSelectedElements: (deltaX: number, deltaY: number) => void;
  createCompanionReceipt?: () => CompanionDragReceipt;
}

export const useSelectedElementDragLifecycle = ({
  freezeSelectionForGesture,
  syncSelectedElementsToOverlay,
  moveSelectedElements,
  createCompanionReceipt,
}: UseSelectedElementDragLifecycleOptions) => {
  const gestureIdRef = useRef<string | null>(null);
  // 드래그 시작값 영수증 - 취소된 제스처는 네이티브·플러그인 위치를 되돌린다
  const nativeReceiptRef = useRef<ReturnType<
    typeof createNativePositionDragReceipt
  > | null>(null);
  const pluginReceiptRef = useRef<ReturnType<
    typeof createPluginPositionDragReceipt
  > | null>(null);
  const companionReceiptRef = useRef<CompanionDragReceipt | null>(null);

  const moveSelectedElementsDrag = (deltaX: number, deltaY: number) => {
    companionReceiptRef.current?.move(deltaX, deltaY);
    const move = () => moveSelectedElements(deltaX, deltaY);
    const pluginReceipt = pluginReceiptRef.current;
    const movePlugins = () => {
      if (pluginReceipt) pluginReceipt.apply(move);
      else move();
    };
    const nativeReceipt = nativeReceiptRef.current;
    if (nativeReceipt) nativeReceipt.apply(movePlugins);
    else movePlugins();
  };

  const beginSelectedElementsDrag = () => {
    const gestureId = crypto.randomUUID();
    gestureIdRef.current = gestureId;
    freezeSelectionForGesture();
    const frozenSelection = useGridSelectionStore.getState().selectedElements;
    const nativeReceipt = createNativePositionDragReceipt(
      frozenSelection.flatMap(({ type, id }) =>
        type === 'plugin' ? [] : [{ type, id }],
      ),
    );
    nativeReceiptRef.current = nativeReceipt;
    const selectedPluginElementIds = new Set(
      frozenSelection
        .filter((element) => element.type === 'plugin')
        .map((element) => element.id),
    );
    const pluginReceipt = createPluginPositionDragReceipt(
      selectedPluginElementIds,
    );
    pluginReceiptRef.current = pluginReceipt;
    const companionReceipt = createCompanionReceipt?.() ?? null;
    companionReceiptRef.current = companionReceipt;
    const tokens = new Map<string, string>();
    usePluginDisplayElementStore
      .getState()
      .elements.filter((element) =>
        selectedPluginElementIds.has(element.fullId),
      )
      .forEach((element) => {
        if (!tokens.has(element.pluginId)) {
          tokens.set(
            element.pluginId,
            beginPluginInstancesEditSession(element.pluginId, gestureId),
          );
        }
      });
    if (tokens.size > 0) {
      beginMixedGestureTransaction(gestureId, [...tokens.keys()]);
    }
    return (commit = true) => {
      if (!commit) {
        companionReceipt?.rollback();
        nativeReceipt.rollback();
        cancelUncommittedMixedGestureTransaction(gestureId, {
          discardPendingSave: true,
          beforeDiscard: pluginReceipt.rollback,
        });
      }
      tokens.forEach((token, pluginId) => {
        endPluginInstancesEditSession(pluginId, token);
      });
      cancelUncommittedMixedGestureTransaction(gestureId);
      if (gestureIdRef.current === gestureId) {
        gestureIdRef.current = null;
        nativeReceiptRef.current = null;
        pluginReceiptRef.current = null;
        companionReceiptRef.current = null;
      }
    };
  };

  const commitSelectedElementsDrag = () => {
    void companionReceiptRef.current?.commit(gestureIdRef.current ?? undefined);
    syncSelectedElementsToOverlay(gestureIdRef.current ?? undefined);
  };

  return {
    beginSelectedElementsDrag,
    commitSelectedElementsDrag,
    moveSelectedElementsDrag,
  };
};
