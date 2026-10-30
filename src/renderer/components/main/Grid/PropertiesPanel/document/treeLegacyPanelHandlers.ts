// 트리로 옮긴 옛 종류의 옛 패널 위치·크기 칸 - 트리에 쓴다 (편집 화면이 감싸는 상자를 트리에서 그린다)
import type { GeometryField } from '@src/renderer/editor/runtime/operations/elementGeometryOps';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import type { FramePatch } from '@src/types/generated/elementDocument';
import { setDocumentFrame } from '../../document/documentEditActions';
import { useDocumentFramePreviewStore } from '../../document/useDocumentFramePreviewStore';

const FRAME_FIELD: Record<GeometryField, keyof FramePatch> = {
  dx: 'x',
  dy: 'y',
  width: 'width',
  height: 'height',
};

export const treeLegacyPanelHandlers = (
  sceneId: string,
  elementId: string,
) => ({
  handleGeometryPreview: (field: GeometryField, value: number) => {
    const element = getElementDocumentStore()?.getElement(sceneId, elementId);
    if (!element) return;
    const preview = useDocumentFramePreviewStore.getState();
    preview.set(elementId, {
      ...(preview.frames[elementId] ?? element.frame),
      [FRAME_FIELD[field]]: value,
    });
  },
  handleGeometryCommit: (field: GeometryField, value: number) => {
    void setDocumentFrame(sceneId, elementId, {
      [FRAME_FIELD[field]]: value,
    });
    useDocumentFramePreviewStore.getState().clear(elementId);
  },
});
