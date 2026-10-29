import { useEffect } from 'react';

import { useTranslation } from '@contexts/useTranslation';

import { isModalLayerActive } from '@components/main/Modal/popupLayer';
import { useKeyStore } from '@stores/data/useKeyStore';
import { isMac } from '@utils/core/platform';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  groupDocumentElements,
  moveDocumentElements,
  removeDocumentElements,
  ungroupDocumentElements,
} from './documentEditActions';
import {
  copyDocumentSelection,
  pasteDocumentClipboard,
  useDocumentClipboardStore,
} from './documentClipboard';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

const ARROW_STEP = 1;
const ARROW_STEP_LARGE = 10;

/** 트리 요소 키보드 - 복사·붙여넣기·삭제·화살표 이동·선택 해제 (옛 종류 선택과 같은 키) */
export const useDocumentKeyboard = () => {
  const { t } = useTranslation();
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
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
      const primaryModifier = isMac() ? event.metaKey : event.ctrlKey;
      // 붙여넣기는 고른 것이 없어도 된다 - 트리 클립보드가 있을 때만 (옛 종류 클립보드와 함께 서지 않는다)
      if (primaryModifier && event.key.toLowerCase() === 'v') {
        if (useDocumentClipboardStore.getState().nodes.length === 0) return;
        event.preventDefault();
        void pasteDocumentClipboard(useKeyStore.getState().selectedKeyType);
        return;
      }
      const { sceneId, selectedIds, clear } =
        useDocumentSelectionStore.getState();
      if (!sceneId || selectedIds.length === 0) return;
      if (primaryModifier && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copyDocumentSelection();
        return;
      }
      // Cmd+G 묶기, Shift+Cmd+G 풀기 (옛 종류와 같은 키)
      if (primaryModifier && event.code === 'KeyG') {
        event.preventDefault();
        void (event.shiftKey
          ? ungroupDocumentElements(sceneId, selectedIds)
          : groupDocumentElements(
              sceneId,
              selectedIds,
              t('layerGroup.newGroup') || 'New Group',
            ));
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
  }, [t]);
};
