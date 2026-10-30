// 트리로 옮긴 옛 종류의 옛 패널 커밋 - 옛 패널 패치를 같은 칸 규칙으로 풀어 트리 연산으로 보낸다.
// 미리보기는 옛 편집 제스처를 그대로 쓰고, 트리에 낙관 반영한 직후 제스처를 끝낸다 (깜빡임 없음)
import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import type { GeometryField } from '@src/renderer/editor/runtime/operations/elementGeometryOps';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { legacyFieldPatch } from '@src/renderer/elementKinds/runtime/legacyFieldPatch';
import {
  legacyPatchOps,
  legacyPositionOf,
} from '@src/renderer/elementKinds/runtime/legacyPosition';
import type {
  EditorElementPropertyPatchV1,
  EditorElementTypeV1,
} from '@src/types/editor';
import type { FramePatch } from '@src/types/generated/elementDocument';
import {
  editDocument,
  setDocumentFrame,
} from '../../document/documentEditActions';
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
  elementType: EditorElementTypeV1,
) => {
  const current = () =>
    getElementDocumentStore()?.getElement(sceneId, elementId);

  const commitFields = (
    fields: Record<string, unknown>,
    gestureId?: string,
  ) => {
    const element = current();
    const ops = element ? legacyPatchOps(sceneId, element, fields) : [];
    if (ops.length > 0) {
      void editDocument(ops, {
        gestureId:
          gestureId ?? editGestureController.activeGestureId() ?? undefined,
      });
    }
    // 트리에 낙관 반영된 뒤 미리보기를 걷는다
    editGestureController.cancel();
  };

  const commitPatch = (
    patch: EditorElementPropertyPatchV1,
    options?: { gestureId?: string },
  ) => {
    const element = current();
    if (!element) return;
    commitFields(
      legacyFieldPatch(
        elementType,
        legacyPositionOf(element) as Record<string, unknown> & { id: string },
        patch,
      ),
      options?.gestureId,
    );
  };

  return {
    onElementPropertyCommit: commitPatch,
    onStylePropertyCommit: (patch: unknown) =>
      commitPatch(patch as EditorElementPropertyPatchV1),
    onPaintCommit: (patch: unknown) =>
      commitPatch(patch as EditorElementPropertyPatchV1),
    onShadowCommit: (patch: unknown) =>
      commitPatch(patch as EditorElementPropertyPatchV1),
    onInactiveImageCommit: (inactiveImage: string) =>
      commitFields({ inactiveImage }),
    onActiveImageCommit: (activeImage: string) => commitFields({ activeImage }),
    onIdleTransparentCommit: (idleTransparent: boolean) =>
      commitFields({ idleTransparent }),
    onActiveTransparentCommit: (activeTransparent: boolean) =>
      commitFields({ activeTransparent }),
    onIdleImageFitCommit: (idleImageFit: string) =>
      commitFields({ idleImageFit }),
    onActiveImageFitCommit: (activeImageFit: string) =>
      commitFields({ activeImageFit }),
    handleGeometryPreview: (field: GeometryField, value: number) => {
      const element = current();
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
  };
};
