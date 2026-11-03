import { create } from 'zustand';

// 트리 요소 우클릭 메뉴 대상
interface DocumentContextMenuState {
  target: { sceneId: string; id: string; x: number; y: number } | null;
  open: (target: { sceneId: string; id: string; x: number; y: number }) => void;
  close: () => void;
}

export const useDocumentContextMenuStore = create<DocumentContextMenuState>(
  (set) => ({
    target: null,
    open: (target) => set({ target }),
    close: () => set({ target: null }),
  }),
);
