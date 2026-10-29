import { create } from 'zustand';

import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';

// 트리 문서에만 있는 종류(커서 트래커 등)의 캔버스 선택.
// 옛 종류 선택과 동시에 서지 않는다 - 한쪽을 고르면 다른 쪽을 비운다
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
      useGridSelectionStore.getState().clearSelection();
      set({ sceneId, selectedIds: [id] });
    },
    setSelection: (sceneId, ids) => {
      if (ids.length === 0) {
        set({ sceneId: null, selectedIds: [] });
        return;
      }
      useGridSelectionStore.getState().clearSelection();
      set({ sceneId, selectedIds: ids });
    },
    clear: () => set({ sceneId: null, selectedIds: [] }),
  }),
);

// 옛 종류 요소를 고르면 트리 요소 선택을 비운다
useGridSelectionStore.subscribe((state, previous) => {
  if (
    state.selectedElements !== previous.selectedElements &&
    state.selectedElements.length > 0 &&
    useDocumentSelectionStore.getState().selectedIds.length > 0
  ) {
    useDocumentSelectionStore.getState().clear();
  }
});
