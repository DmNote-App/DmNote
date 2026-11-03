import { useRef } from 'react';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { createPluginPositionDragReceipt } from '@plugins/runtime/displayElement/pluginElementActions';

// 함께 고른 다른 선택(트리 요소)의 끌기 - 증분 이동, 끝낼 때 커밋, 취소 때 되돌리기
export interface CompanionDragReceipt {
  move: (deltaX: number, deltaY: number) => void;
  // gestureId - 같은 끌기의 옛 종류 편집과 한 되돌리기 단계로 합친다
  commit: (gestureId?: string) => unknown;
  rollback: () => void;
}

interface UseSelectedElementDragLifecycleOptions {
  syncSelectedElementsToOverlay: () => void;
  moveSelectedElements: (deltaX: number, deltaY: number) => void;
  createCompanionReceipt?: () => CompanionDragReceipt;
}

export const useSelectedElementDragLifecycle = ({
  syncSelectedElementsToOverlay,
  moveSelectedElements,
  createCompanionReceipt,
}: UseSelectedElementDragLifecycleOptions) => {
  const gestureIdRef = useRef<string | null>(null);
  // 드래그 시작값 영수증 - 취소된 제스처는 플러그인 위치를 되돌린다 (옛 선택은 플러그인 요소만)
  const pluginReceiptRef = useRef<ReturnType<
    typeof createPluginPositionDragReceipt
  > | null>(null);
  const companionReceiptRef = useRef<CompanionDragReceipt | null>(null);

  const moveSelectedElementsDrag = (deltaX: number, deltaY: number) => {
    companionReceiptRef.current?.move(deltaX, deltaY);
    const move = () => moveSelectedElements(deltaX, deltaY);
    const pluginReceipt = pluginReceiptRef.current;
    if (pluginReceipt) pluginReceipt.apply(move);
    else move();
  };

  const beginSelectedElementsDrag = () => {
    const gestureId = crypto.randomUUID();
    gestureIdRef.current = gestureId;
    const frozenSelection =
      useDocumentSelectionStore.getState().selectedElements;
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
    // 옛 선택은 트리에 없는 런타임 요소 - 취소면 시작 위치로 (함께 고른 트리 요소는 영수증이 커밋·되돌린다)
    const pluginIds = [
      ...new Set(
        usePluginDisplayElementStore
          .getState()
          .elements.filter((element) =>
            selectedPluginElementIds.has(element.fullId),
          )
          .map((element) => element.pluginId),
      ),
    ];
    return (commit = true) => {
      if (!commit) {
        companionReceipt?.rollback();
        pluginIds.forEach(pluginReceipt.rollback);
      }
      if (gestureIdRef.current === gestureId) {
        gestureIdRef.current = null;
        pluginReceiptRef.current = null;
        companionReceiptRef.current = null;
      }
    };
  };

  const commitSelectedElementsDrag = () => {
    void companionReceiptRef.current?.commit(gestureIdRef.current ?? undefined);
    syncSelectedElementsToOverlay();
  };

  return {
    beginSelectedElementsDrag,
    commitSelectedElementsDrag,
    moveSelectedElementsDrag,
  };
};
