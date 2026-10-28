import { create } from 'zustand';

import type { Frame } from '@src/types/generated/elementDocument';

// 드래그·크기 조절 중 미리보기 위치 - 끝낼 때 한 번만 커밋한다
interface DocumentFramePreviewState {
  frames: Record<string, Frame>;
  set: (id: string, frame: Frame) => void;
  clear: (id: string) => void;
}

export const useDocumentFramePreviewStore = create<DocumentFramePreviewState>(
  (set) => ({
    frames: {},
    set: (id, frame) =>
      set((state) => ({ frames: { ...state.frames, [id]: frame } })),
    clear: (id) =>
      set((state) => {
        if (!(id in state.frames)) return state;
        const frames = { ...state.frames };
        delete frames[id];
        return { frames };
      }),
  }),
);
