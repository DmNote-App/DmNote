import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { moveDocumentElements } from './documentEditActions';
import { useDocumentFramePreviewStore } from './useDocumentFramePreviewStore';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';

/** 섞인 선택 끌기 - 고른 트리 요소를 증분 이동으로 미리 보이고 끝낼 때 한 번 커밋한다 */
export const createDocumentDragReceipt = (sceneId: string) => {
  const selection = useDocumentSelectionStore.getState();
  const ids = selection.sceneId === sceneId ? selection.selectedIds : [];
  const store = getElementDocumentStore();
  const origins = ids.flatMap((id) => {
    const frame = store?.getElement(sceneId, id)?.frame;
    return frame ? [{ id, frame }] : [];
  });
  let offsetX = 0;
  let offsetY = 0;
  const clear = () => {
    const preview = useDocumentFramePreviewStore.getState();
    for (const { id } of origins) preview.clear(id);
  };
  return {
    move: (deltaX: number, deltaY: number) => {
      if (origins.length === 0) return;
      offsetX += deltaX;
      offsetY += deltaY;
      const preview = useDocumentFramePreviewStore.getState();
      for (const { id, frame } of origins) {
        preview.set(id, {
          ...frame,
          x: frame.x + offsetX,
          y: frame.y + offsetY,
        });
      }
    },
    // gestureId - 같은 끌기의 옛 종류 편집과 한 되돌리기 단계로 합친다
    commit: async (gestureId?: string) => {
      if (origins.length === 0 || (offsetX === 0 && offsetY === 0)) {
        clear();
        return;
      }
      try {
        await moveDocumentElements(
          sceneId,
          origins.map(({ id, frame }) => ({
            id,
            x: frame.x + offsetX,
            y: frame.y + offsetY,
          })),
          { gestureId },
        );
      } finally {
        clear();
      }
    },
    rollback: clear,
  };
};
