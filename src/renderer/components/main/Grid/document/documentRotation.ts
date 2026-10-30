import type { Frame } from '@src/types/generated/elementDocument';
import { setDocumentFrame } from './documentEditActions';
import { useDocumentFramePreviewStore } from './useDocumentFramePreviewStore';

/** 트리 요소 회전 손잡이 - 돌리는 동안 미리보기, 끝낼 때 회전만 커밋 (옛 종류 회전 손잡이와 같은 모양) */
export const startDocumentRotation = (
  sceneId: string,
  id: string,
  frame: Frame,
) => {
  const clear = () => useDocumentFramePreviewStore.getState().clear(id);
  return {
    preview: (rotation: number) => {
      useDocumentFramePreviewStore.getState().set(id, { ...frame, rotation });
      return true;
    },
    commit: async (rotation: number) => {
      try {
        await setDocumentFrame(sceneId, id, { rotation });
      } finally {
        clear();
      }
    },
    cancel: clear,
  };
};
