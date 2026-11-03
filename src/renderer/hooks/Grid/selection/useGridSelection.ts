/**
 * Grid 선택 관련 로직 훅
 * - 선택된 요소들 이동
 * - 선택된 요소들 삭제
 * - 복사/붙여넣기
 */

import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import {
  useGridSelectionStore,
  type SelectedElement,
  type ClipboardItem,
} from '@stores/grid/useGridSelectionStore';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { sendBridgeMessageBestEffort } from '@utils/plugin/bridgeMessages';
import { moveSelectedPluginElements } from '@utils/grid/selectionMovement';
import { createSelectionClipboardItems } from '@utils/grid/selectionClipboard';
import { pasteSelection } from './pasteSelection';

interface UseGridSelectionParams {
  selectedElements: SelectedElement[];
  selectedKeyType: string;
}

interface UseGridSelectionReturn {
  moveSelectedElements: (
    deltaX: number,
    deltaY: number,
    syncToOverlay?: boolean,
  ) => void;
  copySelectedElements: () => void;
  pasteElements: () => Promise<void>;
  syncSelectedElementsToOverlay: () => void;
  clipboard: ClipboardItem[];
}

/**
 * 선택된 요소들 관리 훅
 */
export function useGridSelection({
  selectedElements,
  selectedKeyType,
}: UseGridSelectionParams): UseGridSelectionReturn {
  const setSelectedElements = useDocumentSelectionStore(
    (state) => state.setSelectedElements,
  );
  const clipboard = useGridSelectionStore((state) => state.clipboard);
  const setClipboard = useGridSelectionStore((state) => state.setClipboard);

  // 옛 선택(트리에 없는 런타임 요소)은 저장하지 않는다 - 끝낼 때 오버레이에만 알린다
  // (드래그 종료 시 skipSync로 인해 동기화되지 않았을 수 있음)
  const syncSelectedElementsToOverlay = () => {
    sendBridgeMessageBestEffort('overlay', 'plugin:displayElements:sync', {
      elements: usePluginDisplayElementStore.getState().elements,
    });
  };

  // 선택된 요소들 일괄 이동 함수 (배치 업데이트)
  const moveSelectedElements = (
    deltaX: number,
    deltaY: number,
    syncToOverlay = true,
  ) => {
    if (selectedElements.length === 0) return;

    // 플러그인 요소 배치 업데이트
    const pluginUpdateIds = new Set(
      selectedElements
        .filter((element) => element.type === 'plugin')
        .map((element) => element.id),
    );
    // 옛 선택은 트리에 없는 런타임 요소 - 런타임 스토어만 (저장된 인스턴스는 트리 선택 끌기가 옮긴다)
    if (pluginUpdateIds.size > 0) {
      usePluginDisplayElementStore
        .getState()
        .setElements(
          moveSelectedPluginElements(
            usePluginDisplayElementStore.getState().elements,
            pluginUpdateIds,
            deltaX,
            deltaY,
          ),
          { skipSync: !syncToOverlay },
        );
    }

    if (syncToOverlay) syncSelectedElementsToOverlay();
  };

  // 선택된 요소들 복사
  const copySelectedElements = () => {
    const items = createSelectionClipboardItems(
      selectedElements,
      usePluginDisplayElementStore.getState().elements,
    );
    if (items.length > 0) setClipboard(items);
  };

  const pasteElements = () =>
    pasteSelection({ selectedKeyType, setSelectedElements });

  return {
    moveSelectedElements,
    copySelectedElements,
    pasteElements,
    syncSelectedElementsToOverlay,
    clipboard,
  };
}
