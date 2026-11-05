// 선언 패널의 옛 종류 쓰기 - 옛 단일·일괄 패널과 같은 처리기(칸 규칙은 applyPropertyPatch)·미리보기를 쓴다.
// 트리에만 있는 종류는 패널이 트리 연산으로 쓴다
import type { ElementIdSelection } from '@hooks/pickers/useBatchElementBinding';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import type { GeometryField } from '@src/renderer/editor/runtime/operations/elementOps';
import { patchElementPropertyByTargets } from '@src/renderer/editor/runtime/operations/elementPropertyCore';
import {
  isEditorElementType,
  type EditorElementPropertyPatchV1,
  type EditorElementTypeV1,
  type EditorPaintPropertyPatchV1,
  type EditorPreviewStylePropertyPatchV1,
  type EditorShadowPropertyPatchV1,
  type EditorStylePropertyPreviewPatchV1,
} from '@src/types/editor';
import { isSurfaceStyledElementType } from '@src/types/elementKinds';
import { supportsActiveVisualState } from '@stores/grid/useGradientEditStore';
import type { ImageFit } from '@src/types/key/keys';
import type { JsonValue } from '@src/types/generated/elementDocument';
import { PREVIEW_DOMAIN_BY_ELEMENT_TYPE } from '@src/types/preview';
import {
  commitBoundActiveImage,
  commitBoundActiveTransparent,
  commitBoundIdleTransparent,
  commitBoundInactiveImage,
  createPaintHandlers,
  createShadowCommitHandler,
  createStylePropertyHandlers,
} from '../batch/batchPanelShared';
import { singleSelectionHandlers } from '../selection/singleSelectionHandlers';

export interface PanelWriter {
  // 고유 값 칸 - settlesPreview면 그 칸의 미리보기 제스처를 이 커밋으로 정산한다
  commitField: (
    field: string,
    value: JsonValue,
    options?: { settlesPreview?: boolean },
  ) => void;
  previewField: (field: string, value: JsonValue) => void;
  // 고르는 중 미리보기 취소 (Esc)
  cancelPreview: () => void;
  commitPaint: (patch: EditorPaintPropertyPatchV1) => void;
  previewPaint: (patch: EditorPaintPropertyPatchV1) => void;
  commitStyle: (patch: EditorPreviewStylePropertyPatchV1) => void;
  previewStyle: (patch: EditorStylePropertyPreviewPatchV1) => void;
  commitShadow: (patch: EditorShadowPropertyPatchV1) => void;
  commitInactiveImage: (image: string) => void;
  commitIdleTransparent: (value: boolean) => void;
  commitIdleImageFit: (fit: ImageFit) => void;
  // 눌림 이미지 - 눌림 그림이 있는 종류(키·노브)만 쓴다
  commitActiveImage: (image: string) => void;
  commitActiveTransparent: (value: boolean) => void;
  commitActiveImageFit: (fit: ImageFit) => void;
}

// 단일 선택 위치·크기 칸 - 입력 중 미리보기, 확정은 그 제스처를 정산한다
export interface SingleGeometryWriter {
  commitGeometry?: (field: GeometryField, value: number) => void;
  previewGeometry?: (field: GeometryField, value: number) => void;
}

const fieldPatch = (field: string, value: JsonValue) =>
  ({ property: field, value } as EditorElementPropertyPatchV1);

// 고유 값 미리보기 - 옛 칸 이름 그대로 편집 미리보기에 얹는다 (그래프 색 등)
const previewFields = (
  sceneId: string,
  elements: readonly ElementNode[],
  field: string,
  value: JsonValue,
) => {
  const kind = elements[0]?.kind;
  if (!kind || !isSurfaceStyledElementType(kind)) return;
  editGestureController.preview(
    sceneId,
    elements.map(({ id }) => ({ id, patch: { [field]: value } })),
    { domain: PREVIEW_DOMAIN_BY_ELEMENT_TYPE[kind] },
  );
};

/** 옛 종류 하나 - 옛 단일 패널 처리기 그대로 */
const legacySingleWriter = (
  sceneId: string,
  element: ElementNode,
): PanelWriter & SingleGeometryWriter => {
  const type = element.kind as EditorElementTypeV1;
  const { id } = element;
  const handlers = singleSelectionHandlers;
  const commitProperty = handlers.stableElementPropertyCommitHandler(type, id);
  const commitPaint = handlers.stablePaintCommitHandler(type, id);
  const previewPaint = handlers.stablePaintPreviewHandler(type, id);
  const commitStyle = handlers.stableStylePropertyCommitHandler(type, id);
  const previewStyle = handlers.stableStylePropertyPreviewHandler(type, id);
  const commitShadow =
    type === 'key' || type === 'stat' || type === 'knob'
      ? handlers.stableShadowCommitHandler(type, id)
      : undefined;
  const commitInactiveImage = handlers.stableInactiveImageHandler(type, id);
  const commitIdleTransparent = handlers.stableIdleTransparentHandler(type, id);
  const commitIdleImageFit = handlers.stableIdleImageFitHandler(type, id);
  const activeType = supportsActiveVisualState(type) ? type : null;
  const commitActiveImage = activeType
    ? handlers.stableActiveImageHandler(activeType, id)
    : undefined;
  const commitActiveTransparent = activeType
    ? handlers.stableActiveTransparentHandler(activeType, id)
    : undefined;
  const commitActiveImageFit = activeType
    ? handlers.stableActiveImageFitHandler(activeType, id)
    : undefined;
  return {
    // 미리보기 제스처 정산은 옛 처리기가 칸으로 정한다 (그래프 색 등)
    commitField: (field, value) => commitProperty?.(fieldPatch(field, value)),
    previewField: (field, value) =>
      previewFields(sceneId, [element], field, value),
    cancelPreview: () => editGestureController.cancel(),
    commitPaint: (patch) => commitPaint?.(patch),
    previewPaint: (patch) => previewPaint?.(patch),
    commitStyle: (patch) => commitStyle?.(patch),
    previewStyle: (patch) => previewStyle?.(patch),
    commitShadow: (patch) => commitShadow?.(patch),
    commitInactiveImage: (image) => commitInactiveImage?.(image),
    commitIdleTransparent: (value) => commitIdleTransparent?.(value),
    commitIdleImageFit: (fit) => commitIdleImageFit?.(fit),
    commitActiveImage: (image) => commitActiveImage?.(image),
    commitActiveTransparent: (value) => commitActiveTransparent?.(value),
    commitActiveImageFit: (fit) => commitActiveImageFit?.(fit),
    commitGeometry: handlers.stableGeometryHandler(type, id),
    previewGeometry: handlers.stableGeometryPreviewHandler(type, id),
  };
};

/** 옛 종류 여럿 - 옛 일괄 패널 처리기 그대로 (고른 요소 전부 한 커밋) */
const legacyBatchWriter = (
  sceneId: string,
  elements: readonly ElementNode[],
): PanelWriter => {
  const targets = elements.map((element) => ({
    elementType: element.kind as EditorElementTypeV1,
    id: element.id,
  }));
  // 표면 칠·스타일은 표면을 그리는 종류만 (스프라이트는 아니다)
  const surfaceTargets = elements.flatMap((element) =>
    isSurfaceStyledElementType(element.kind)
      ? [{ elementType: element.kind, id: element.id }]
      : [],
  );
  const paint = createPaintHandlers(surfaceTargets, sceneId);
  const style = createStylePropertyHandlers(surfaceTargets, sceneId);
  // 그림자는 그래프에 없다 - 키·통계·노브만 (통계는 눌림 그림자를 받지 않는다)
  const commitShadow = createShadowCommitHandler(
    surfaceTargets.flatMap((target) =>
      target.elementType === 'graph'
        ? []
        : [{ elementType: target.elementType, id: target.id }],
    ),
  );
  // 이미지 쓰기는 옛 일괄 패널처럼 종류별 id 묶음으로
  const bound: { -readonly [K in keyof ElementIdSelection]?: string[] } = {};
  for (const { elementType, id } of surfaceTargets) {
    (bound[elementType] ??= []).push(id);
  }
  return {
    commitField: (field, value, options) => {
      const patch = fieldPatch(field, value);
      const gestureId = options?.settlesPreview
        ? editGestureController.activeGestureId() ?? undefined
        : undefined;
      const persisted = patchElementPropertyByTargets(
        targets,
        patch,
        gestureId ? { gestureId } : {},
      );
      if (options?.settlesPreview)
        editGestureController.settleCommit(persisted);
      void persisted.catch((error) => {
        console.error('Failed to batch update element property', error);
      });
    },
    previewField: (field, value) =>
      previewFields(sceneId, elements, field, value),
    cancelPreview: () => editGestureController.cancel(),
    commitPaint: paint.commitPaint,
    previewPaint: paint.previewPaint,
    commitStyle: (patch) => style.commitStyleProperty?.(patch),
    previewStyle: (patch) => style.previewStyleProperty?.(patch),
    commitShadow,
    commitInactiveImage: (image) => commitBoundInactiveImage(bound, image),
    commitIdleTransparent: (value) => commitBoundIdleTransparent(bound, value),
    commitActiveImage: (image) => commitBoundActiveImage(bound, image),
    commitActiveTransparent: (value) =>
      commitBoundActiveTransparent(bound, value),
    commitIdleImageFit: (fit) => {
      const persisted = patchElementPropertyByTargets(targets, {
        property: 'idleImageFit',
        value: fit,
      });
      void persisted.catch((error) => {
        console.error('Failed to batch update idle image fit', error);
      });
    },
    commitActiveImageFit: (fit) => {
      const persisted = patchElementPropertyByTargets(
        targets.filter(({ elementType }) =>
          supportsActiveVisualState(elementType),
        ),
        { property: 'activeImageFit', value: fit },
      );
      void persisted.catch((error) => {
        console.error('Failed to batch update active image fit', error);
      });
    },
  };
};

const allLegacy = (elements: readonly ElementNode[]) =>
  elements.length > 0 &&
  elements.every((element) => isEditorElementType(element.kind));

/** 요소 하나 - 옛 종류면 옛 단일 패널 처리기 (아니면 없음 - 패널이 트리 연산으로 쓴다) */
export const singlePanelWriterFor = (
  sceneId: string,
  element: ElementNode,
): (PanelWriter & SingleGeometryWriter) | null =>
  allLegacy([element]) ? legacySingleWriter(sceneId, element) : null;

/** 여러 개 - 모두 옛 종류면 옛 일괄 패널 처리기 (아니면 없음) */
export const batchPanelWriterFor = (
  sceneId: string,
  elements: readonly ElementNode[],
): PanelWriter | null =>
  allLegacy(elements) ? legacyBatchWriter(sceneId, elements) : null;
