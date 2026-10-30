// 트리 요소 여러 개의 정렬·분배·간격·크기 일괄 - 옛 종류 일괄과 같은 계획(batchGeometryPlan)으로 트리에 쓴다
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import {
  computeBatchGeometryPlan,
  computeBatchSpacingValue,
  type BatchGeometryOperation,
} from '@src/renderer/editor/runtime/geometry/batchGeometryPlan';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import type {
  Frame,
  FramePatch,
  Op,
} from '@src/types/generated/elementDocument';
import { editDocument } from './documentEditActions';
import { useDocumentFramePreviewStore } from './useDocumentFramePreviewStore';

// 비율을 잠근 종류는 크기 일괄에서도 지금 비율을 지킨다
const keepAspect = (element: ElementNode, patch: FramePatch): FramePatch => {
  const definition = elementKindDefinition(element.kind);
  if (definition?.lockAspect?.((element.values ?? {}) as never) !== true) {
    return patch;
  }
  const { width, height } = element.frame;
  if (width <= 0 || height <= 0) return patch;
  if (typeof patch.width === 'number' && patch.height == null) {
    return {
      ...patch,
      height: Math.max(1, Math.round((patch.width * height) / width)),
    };
  }
  if (typeof patch.height === 'number' && patch.width == null) {
    return {
      ...patch,
      width: Math.max(1, Math.round((patch.height * width) / height)),
    };
  }
  return patch;
};

// 실제로 바뀌는 칸만 - 하나도 없으면 null
const changedFrame = (element: ElementNode, patch: FramePatch) => {
  const frame: FramePatch = {};
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const value = patch[key];
    if (typeof value === 'number' && value !== element.frame[key]) {
      frame[key] = value;
    }
  }
  return Object.keys(frame).length > 0 ? frame : null;
};

export const documentBatchGeometry = (
  sceneId: string,
  elements: readonly ElementNode[],
) => {
  const layout = elements.map((element) => ({
    key: element.id,
    x: element.frame.x,
    y: element.frame.y,
    width: element.frame.width,
    height: element.frame.height,
  }));
  const planFrames = (operation: BatchGeometryOperation) => {
    const plan = computeBatchGeometryPlan(layout, operation);
    if (!plan) return [];
    return plan.updates.flatMap(({ key, patch }) => {
      const element = elements.find((node) => node.id === key);
      if (!element) return [];
      const frame = changedFrame(
        element,
        keepAspect(element, {
          x: patch.dx,
          y: patch.dy,
          width: patch.width,
          height: patch.height,
        }),
      );
      return frame ? [{ element, frame }] : [];
    });
  };
  const clearPreview = () => {
    const preview = useDocumentFramePreviewStore.getState();
    for (const element of elements) preview.clear(element.id);
  };
  const commit = (
    operation: BatchGeometryOperation,
    options?: { gestureId?: string },
  ) => {
    const ops: Op[] = planFrames(operation).map(({ element, frame }) => ({
      op: 'setFrame',
      scene: sceneId,
      id: element.id,
      frame,
    }));
    clearPreview();
    if (ops.length > 0) void editDocument(ops, options);
  };
  // 입력 중 미리보기 - 확정하거나 취소하면 걷는다
  const preview = (operation: BatchGeometryOperation) => {
    const frames = useDocumentFramePreviewStore.getState();
    for (const { element, frame } of planFrames(operation)) {
      frames.set(element.id, { ...element.frame, ...frame } as Frame);
    }
  };
  return {
    commit,
    preview,
    clearPreview,
    spacingValue: () => computeBatchSpacingValue(layout),
  };
};
