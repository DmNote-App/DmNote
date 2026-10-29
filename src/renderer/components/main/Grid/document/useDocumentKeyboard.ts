import { useEffect } from 'react';

import { isModalLayerActive } from '@components/main/Modal/popupLayer';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  moveDocumentElements,
  removeDocumentElements,
} from './documentEditActions';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

const ARROW_STEP = 1;
const ARROW_STEP_LARGE = 10;

/** 트리 요소 선택 중 키보드 - 삭제·화살표 이동·선택 해제 (옛 종류 선택과 같은 키) */
export const useDocumentKeyboard = () => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { sceneId, selectedIds, clear } =
        useDocumentSelectionStore.getState();
      if (!sceneId || selectedIds.length === 0 || event.defaultPrevented)
        return;
      if (isModalLayerActive() || window.__dmn_isKeyListening) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'Escape') {
        clear();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        clear();
        void removeDocumentElements(sceneId, selectedIds);
        return;
      }
      const step = event.shiftKey ? ARROW_STEP_LARGE : ARROW_STEP;
      const delta =
        event.key === 'ArrowLeft'
          ? { x: -step, y: 0 }
          : event.key === 'ArrowRight'
          ? { x: step, y: 0 }
          : event.key === 'ArrowUp'
          ? { x: 0, y: -step }
          : event.key === 'ArrowDown'
          ? { x: 0, y: step }
          : null;
      if (!delta) return;
      event.preventDefault();
      const store = getElementDocumentStore();
      const moves = selectedIds.flatMap((id) => {
        const element = store?.getElement(sceneId, id);
        return element
          ? [
              {
                id,
                x: element.frame.x + delta.x,
                y: element.frame.y + delta.y,
              },
            ]
          : [];
      });
      void moveDocumentElements(sceneId, moves);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
};
