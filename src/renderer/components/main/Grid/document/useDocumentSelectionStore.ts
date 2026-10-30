import { create } from 'zustand';

import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import {
  isKeepingOtherSelection,
  setOtherSelectionClearer,
  setOtherSelectionSetter,
} from '@stores/grid/keepOtherSelection';

// 트리 문서에만 있는 종류(커서 트래커 등)의 캔버스 선택.
// 옛 종류 선택과 함께 하나의 선택이다 (keepOtherSelection 참고)
const clearLegacySelection = () => {
  if (!isKeepingOtherSelection()) {
    useGridSelectionStore.getState().clearSelection();
  }
};

interface DocumentSelectionState {
  sceneId: string | null;
  selectedIds: string[];
  select: (sceneId: string, id: string) => void;
  // 여러 개를 한 번에 - 비어 있으면 선택을 푼다
  setSelection: (sceneId: string, ids: string[]) => void;
  clear: () => void;
}

export const useDocumentSelectionStore = create<DocumentSelectionState>(
  (set) => ({
    sceneId: null,
    selectedIds: [],
    select: (sceneId, id) => {
      clearLegacySelection();
      set({ sceneId, selectedIds: [id] });
    },
    setSelection: (sceneId, ids) => {
      if (ids.length === 0) {
        set({ sceneId: null, selectedIds: [] });
        return;
      }
      clearLegacySelection();
      set({ sceneId, selectedIds: ids });
    },
    clear: () => set({ sceneId: null, selectedIds: [] }),
  }),
);

// 옛 종류 요소를 바꿔 고르면 트리 요소 선택을 비운다 (옛 선택 스토어가 바꿔 고를 때 부른다)
setOtherSelectionClearer(() => {
  if (useDocumentSelectionStore.getState().selectedIds.length > 0) {
    useDocumentSelectionStore.getState().clear();
  }
});

// 옛 그룹째 고를 때 그 그룹의 트리 가족 멤버를 함께 고른다
setOtherSelectionSetter((sceneId, ids) => {
  const selection = useDocumentSelectionStore.getState();
  const current = selection.sceneId === sceneId ? selection.selectedIds : [];
  selection.setSelection(sceneId, [
    ...current,
    ...ids.filter((id) => !current.includes(id)),
  ]);
});
