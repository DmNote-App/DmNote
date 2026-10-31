import { useRef } from 'react';
import { useKeyStore } from '@stores/data/useKeyStore';
import {
  useHistoryStatusStore,
  syncHistoryStatus,
} from '@stores/data/useHistoryStatusStore';
import { historyApi } from '@api/modules/editor/historyApi';
import { rebindKeySlotById } from '@src/renderer/editor/runtime/operations/keySlotOps';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { treeModeArrays } from '@src/renderer/elementKinds/runtime/treeModeArrays';
import {
  reportElementOpError,
  reportElementOpSkipped,
} from '@src/renderer/editor/runtime/intent/elementIntent';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { setUndoRedoInProgress } from '@api/pluginDisplayElements';
import type { KeySlot } from '@src/types/key/keys';
import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import { keysApi } from '@api/modules/editor/keysApi';

export function useKeyManager() {
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);

  // undo/redo 로컬 single-flight 가드
  const historyActionInFlightRef = useRef(false);

  const handleKeyMappingChange = (index: number, newSlot: KeySlot) => {
    // 순번은 패널이 보는 트리 순서(treePanelRecords와 같다) - 그 자리 키의 안정 id로 커밋
    const positionId = treeModeArrays(
      getElementDocumentStore()?.getScene(selectedKeyType),
    ).keyPositions[index]?.id;
    if (!positionId) {
      reportElementOpSkipped('missing canonical key position id');
      return;
    }
    void rebindKeySlotById(positionId, newSlot)
      .then((applied) => {
        if (!applied) reportElementOpSkipped('key mapping target disappeared');
      })
      .catch(reportElementOpError);
  };

  // ────────────────────────────────────────────────────────────────────────
  // 리셋 / undo / redo
  // ────────────────────────────────────────────────────────────────────────

  const handleResetCurrentMode = async () => {
    try {
      const res = await keysApi.resetMode(selectedKeyType);
      // 백엔드가 초기화를 수행한 경우에만 후속 정리 — 커스텀 탭도 이제 지원됨
      if (!res.success) return;
      useDocumentSelectionStore.getState().clearSelection();
    } catch (error) {
      console.error('Failed to reset current mode', error);
    }
  };

  // undo/redo는 백엔드 authority가 실행 - 복원 결과는 canonical 이벤트로 각 창에 전파
  const executeHistoryAction = async (
    direction: 'undo' | 'redo',
  ): Promise<void> => {
    // 로컬 single-flight - 연타가 busy 검사를 동시에 통과하는 것 방지
    if (historyActionInFlightRef.current) return;
    if (useHistoryStatusStore.getState().busy) return;
    historyActionInFlightRef.current = true;
    setUndoRedoInProgress(true);
    try {
      // 현재 창 프리뷰 취소 후 백엔드가 모든 편집 창의 저장을 정산
      editGestureController.cancel();

      const operationId = crypto.randomUUID();
      const status =
        direction === 'undo'
          ? await historyApi.undo(operationId)
          : await historyApi.redo(operationId);
      useHistoryStatusStore.getState().applyStatus(status);
    } catch (error) {
      const message = String(error);
      const nothingToApply =
        message.includes('HISTORY_NOTHING_TO_UNDO') ||
        message.includes('HISTORY_NOTHING_TO_REDO');
      if (!nothingToApply) {
        console.error(`Failed to apply ${direction}`, error);
      }
      void syncHistoryStatus();
    } finally {
      historyActionInFlightRef.current = false;
      setUndoRedoInProgress(false);
    }
  };

  const handleUndo = () => void executeHistoryAction('undo');
  const handleRedo = () => void executeHistoryAction('redo');

  return {
    handleKeyMappingChange,
    handleResetCurrentMode,
    handleUndo,
    handleRedo,
  };
}
