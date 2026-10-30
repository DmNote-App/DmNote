import { useEffect } from 'react';

import { useTranslation } from '@contexts/useTranslation';

import { isModalLayerActive } from '@components/main/Modal/popupLayer';
import { useKeyStore } from '@stores/data/useKeyStore';
import { isGridKeyHandled } from '@stores/grid/gridKeyHandled';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
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
      // 옛 종류 키보드가 처리한 편집 키는 섞인 선택이므로 트리 요소에도 같은 동작을 한다
      if (event.defaultPrevented && !isGridKeyHandled(event)) return;
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
      // 붙여넣기는 고른 것이 없어도 된다 - 트리 클립보드가 있을 때만.
      // 옛 종류 클립보드도 함께 붙이면(섞어 복사) 붙인 옛 요소 선택을 지킨다
      if (primaryModifier && event.key.toLowerCase() === 'v') {
        if (useDocumentClipboardStore.getState().nodes.length === 0) return;
        event.preventDefault();
        void pasteDocumentClipboard(useKeyStore.getState().selectedKeyType, {
          keepOther: useGridSelectionStore.getState().clipboard.length > 0,
        });
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
