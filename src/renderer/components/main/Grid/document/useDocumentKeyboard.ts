import { useCallback, useRef } from 'react';

import { useTranslation } from '@contexts/useTranslation';

import { isModalLayerActive } from '@components/main/Modal/popupLayer';
import { useKeyStore } from '@stores/data/useKeyStore';
import {
  gridKeyGestureId,
  isGridKeyHandled,
} from '@stores/grid/gridKeyHandled';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { isMac } from '@utils/core/platform';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  groupDocumentElements,
  moveDocumentElements,
  removeDocumentElements,
  stepDocumentElements,
  ungroupDocumentElements,
} from './documentEditActions';
import {
  copyDocumentSelection,
  pasteDocumentClipboard,
  useDocumentClipboardStore,
} from './documentClipboard';
import { structureTargetIds } from './treeEditedSelection';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';

const ARROW_STEP = 1;
const ARROW_STEP_LARGE = 10;
// 옛 종류 방향키와 같은 되돌리기 병합 간격
const ARROW_HISTORY_MERGE_MS = 500;

/** 트리 요소 키보드 - 복사·붙여넣기·삭제·화살표 이동·선택 해제·묶기·겹침 순서 (옛 종류 선택과 같은 키).
 * 옛 종류 키보드가 처리한 다음에 불러야 섞인 선택에서 두 가족이 함께 움직인다 - 처리기를 돌려준다 */
export const useDocumentKeyboard = () => {
  const { t } = useTranslation();
  const arrowBurstRef = useRef<{
    signature: string;
    time: number;
    gestureId: string;
  } | null>(null);
  return useCallback(
    (event: KeyboardEvent) => {
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
      // 구조 편집 - 트리 선택과 옛 선택(플러그인 요소)을 함께 트리 연산 하나로
      const structureScene = useKeyStore.getState().selectedKeyType;
      // Cmd+G 묶기, Shift+Cmd+G 풀기
      if (primaryModifier && event.code === 'KeyG') {
        const targets = structureTargetIds(structureScene);
        if (targets.length === 0) return;
        event.preventDefault();
        void (event.shiftKey
          ? ungroupDocumentElements(structureScene, targets)
          : groupDocumentElements(
              structureScene,
              targets,
              t('layerGroup.newGroup') || 'New Group',
            ));
        return;
      }
      // ] [ 한 칸 앞·뒤로
      if (!primaryModifier && (event.key === ']' || event.key === '[')) {
        const targets = structureTargetIds(structureScene);
        if (targets.length === 0) return;
        event.preventDefault();
        void stepDocumentElements(
          structureScene,
          targets,
          event.key === ']' ? 'forward' : 'backward',
        );
        return;
      }
      const { sceneId, selectedIds, clear } =
        useDocumentSelectionStore.getState();
      if (!sceneId || selectedIds.length === 0) {
        // 플러그인 요소만 복사했으면 지난 트리 복사분이 함께 붙지 않게 비운다
        if (
          primaryModifier &&
          event.key.toLowerCase() === 'c' &&
          isGridKeyHandled(event)
        ) {
          useDocumentClipboardStore.getState().clear();
        }
        return;
      }
      if (primaryModifier && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copyDocumentSelection({ keepLegacyClipboard: isGridKeyHandled(event) });
        return;
      }
      if (event.key === 'Escape') {
        clear();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        // 옛 종류 키보드의 지우기가 트리 요소도 함께 지웠다
        clear();
        if (!isGridKeyHandled(event)) {
          void removeDocumentElements(sceneId, selectedIds);
        }
        return;
      }
      // 섞인 선택은 옛 종류와 같은 거리 (옛 종류는 Shift를 쓰지 않는다)
      const legacyArrow = isGridKeyHandled(event);
      const step =
        event.shiftKey && !legacyArrow ? ARROW_STEP_LARGE : ARROW_STEP;
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
      // 연달아 누른 이동은 한 되돌리기 단계로 - 섞인 선택은 옛 종류 이동과 같은 단계
      const now = Date.now();
      const signature = `${sceneId}:${selectedIds.join(',')}`;
      const burst = arrowBurstRef.current;
      const gestureId =
        gridKeyGestureId(event) ??
        (burst &&
        burst.signature === signature &&
        now - burst.time <= ARROW_HISTORY_MERGE_MS
          ? burst.gestureId
          : crypto.randomUUID());
      arrowBurstRef.current = { signature, time: now, gestureId };
      void moveDocumentElements(sceneId, moves, { gestureId });
    },
    [t],
  );
};
