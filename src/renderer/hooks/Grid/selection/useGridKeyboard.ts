/**
 * Grid 키보드 이벤트 핸들링 훅
 * - 방향키로 선택된 요소 이동
 * - Delete 키로 선택된 요소 삭제
 * - Escape 키로 선택 해제
 * - Ctrl+C/V 복사/붙여넣기
 * - Ctrl+Z/Shift+Z Undo/Redo
 */

import { markGridKeyHandled } from '@stores/grid/gridKeyHandled';
import { useEffect, useRef } from 'react';
import {
  useGridSelectionStore,
  type SelectedElement,
} from '@stores/grid/useGridSelectionStore';
import { reportElementOpError } from '@src/renderer/editor/runtime/intent/elementIntent';
import { isMac } from '@utils/core/platform';
import { useHistoryShortcuts } from './useHistoryShortcuts';
import { isHistoryEditorFlushLocked } from '@src/renderer/editor/runtime/lifecycle/historyEditorFlushLock';
import { isModalLayerActive } from '@components/main/Modal/popupLayer';

interface UseGridKeyboardParams {
  selectedElements: SelectedElement[];
  // 옛 선택(트리에 없는 런타임 요소) 이동 - 저장하지 않는다 (트리 요소는 트리 키보드가 옮긴다)
  moveSelectedElements: (deltaX: number, deltaY: number) => void;
  deleteSelectedElements: () => void;
  clearSelection: () => void;
  copySelectedElements: () => void;
  pasteElements: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  continuousInputStrategy?: 'sync' | 'frame';
  // 함께 고른 다른 선택(트리 요소)의 키 처리 - 이 처리기가 끝난 뒤 같은 이벤트로 부른다
  afterKeyDown?: (event: KeyboardEvent) => void;
}

/**
 * 키보드 핸들러 훅
 */
export function useGridKeyboard({
  selectedElements,
  moveSelectedElements,
  deleteSelectedElements,
  clearSelection,
  copySelectedElements,
  pasteElements,
  onUndo,
  onRedo,
  continuousInputStrategy = 'frame',
  afterKeyDown,
}: UseGridKeyboardParams): void {
  const macOS = isMac();
  const pendingArrowMove = useRef<{ deltaX: number; deltaY: number } | null>(
    null,
  );
  const arrowMoveFrame = useRef<number | null>(null);

  useHistoryShortcuts({ onUndo, onRedo });

  // 선택 요소 키보드 조작
  useEffect(() => {
    const flushArrowMove = () => {
      if (arrowMoveFrame.current !== null) {
        cancelAnimationFrame(arrowMoveFrame.current);
        arrowMoveFrame.current = null;
      }
      const pending = pendingArrowMove.current;
      pendingArrowMove.current = null;
      if (pending && !isModalLayerActive()) {
        moveSelectedElements(pending.deltaX, pending.deltaY);
      }
    };

    const scheduleArrowMove = (deltaX: number, deltaY: number) => {
      if (continuousInputStrategy === 'sync') {
        moveSelectedElements(deltaX, deltaY);
        return;
      }

      const pending = pendingArrowMove.current;
      pendingArrowMove.current = pending
        ? { deltaX: pending.deltaX + deltaX, deltaY: pending.deltaY + deltaY }
        : { deltaX, deltaY };
      if (arrowMoveFrame.current !== null) return;
      arrowMoveFrame.current = requestAnimationFrame(() => {
        arrowMoveFrame.current = null;
        flushArrowMove();
      });
    };

    const handleGridKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (isHistoryEditorFlushLocked()) return;
      if (isModalLayerActive()) return;
      if (typeof window !== 'undefined' && window.__dmn_isKeyListening) {
        return;
      }
      // 입력 요소에서는 무시
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const isPrimaryModifierPressed = macOS ? e.metaKey : e.ctrlKey;

      // Ctrl+C: 복사 (선택된 요소가 있을 때)
      if (isPrimaryModifierPressed && e.key.toLowerCase() === 'c') {
        if (selectedElements.length > 0) {
          e.preventDefault();
          markGridKeyHandled(e);
          copySelectedElements();
        }
        return;
      }

      // Ctrl+V: 붙여넣기 (스토어에서 직접 클립보드 확인)
      if (isPrimaryModifierPressed && e.key.toLowerCase() === 'v') {
        const currentClipboard = useGridSelectionStore.getState().clipboard;
        if (currentClipboard.length > 0) {
          e.preventDefault();
          markGridKeyHandled(e);
          void Promise.resolve(pasteElements()).catch(reportElementOpError);
        }
        return;
      }

      // 선택된 요소가 없으면 무시
      if (selectedElements.length === 0) return;

      // 방향키 처리
      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (arrowKeys.includes(e.key)) {
        e.preventDefault();

        let deltaX = 0;
        let deltaY = 0;

        switch (e.key) {
          case 'ArrowUp':
            deltaY = -1;
            break;
          case 'ArrowDown':
            deltaY = 1;
            break;
          case 'ArrowLeft':
            deltaX = -1;
            break;
          case 'ArrowRight':
            deltaX = 1;
            break;
        }

        // 함께 고른 트리 요소는 트리 키보드가 옮긴다 (되돌리기 묶음도 그쪽)
        markGridKeyHandled(e);

        scheduleArrowMove(deltaX, deltaY);
        return;
      }

      // Delete 키로 선택 요소 삭제
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        markGridKeyHandled(e);
        void Promise.resolve(deleteSelectedElements()).catch(
          reportElementOpError,
        );
        return;
      }

      // Escape 키로 선택 해제 — 상위 레이어(메뉴·패널 페이지)가 소비했으면 양보
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        clearSelection();
        return;
      }
    };

    // 리스너 순서와 무관하게 옛 종류가 먼저, 트리 요소가 다음
    const handleKeyDown = (e: KeyboardEvent) => {
      handleGridKeyDown(e);
      afterKeyDown?.(e);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow')) flushArrowMove();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      flushArrowMove();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    macOS,
    selectedElements,
    moveSelectedElements,
    deleteSelectedElements,
    clearSelection,
    copySelectedElements,
    pasteElements,
    continuousInputStrategy,
    afterKeyDown,
  ]);
}
