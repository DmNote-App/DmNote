import type { Frame } from '@src/types/generated/elementDocument';
import {
  pointsAabb,
  rotatePointAround,
  wrapDegrees,
  type Point,
} from '@utils/element/rotation';
import { editDocument } from './documentEditActions';
import { useDocumentFramePreviewStore } from './useDocumentFramePreviewStore';

export interface DocumentRotationEntry {
  id: string;
  frame: Frame;
}

const ORIGIN = { x: 0, y: 0 };

const corners = (frame: Frame): Point[] => {
  const center = {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  };
  const halfWidth = frame.width / 2;
  const halfHeight = frame.height / 2;
  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((point) => {
    const rotated = rotatePointAround(point, ORIGIN, frame.rotation);
    return { x: center.x + rotated.x, y: center.y + rotated.y };
  });
};

/** 여러 트리 요소의 선택틀 - 회전한 꼭짓점을 감싸는 상자, 기준 회전은 첫 요소 (옛 종류와 같다) */
export const documentSelectionFrame = (
  entries: readonly DocumentRotationEntry[],
) => {
  if (entries.length === 0) return null;
  const { minX, minY, maxX, maxY } = pointsAabb(
    entries.flatMap(({ frame }) => corners(frame)),
  );
  return {
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    rotation: entries[0].frame.rotation,
  };
};

const rotated = (
  entries: readonly DocumentRotationEntry[],
  center: Point,
  delta: number,
) =>
  entries.map(({ id, frame }) => {
    const offset = rotatePointAround(
      {
        x: frame.x + frame.width / 2 - center.x,
        y: frame.y + frame.height / 2 - center.y,
      },
      ORIGIN,
      delta,
    );
    return {
      id,
      frame: {
        ...frame,
        x: center.x + offset.x - frame.width / 2,
        y: center.y + offset.y - frame.height / 2,
        rotation: wrapDegrees(frame.rotation + delta),
      },
    };
  });

/** 묶음 회전 손잡이 - 시작 선택틀 중심을 축으로 위치·회전을 함께 돌린다. 끝낼 때 한 커밋 */
export const startDocumentGroupRotation = (
  sceneId: string,
  entries: readonly DocumentRotationEntry[],
  selection: NonNullable<ReturnType<typeof documentSelectionFrame>>,
) => {
  const center = {
    x: selection.bounds.x + selection.bounds.width / 2,
    y: selection.bounds.y + selection.bounds.height / 2,
  };
  const clear = () => {
    const preview = useDocumentFramePreviewStore.getState();
    for (const { id } of entries) preview.clear(id);
  };
  return {
    preview: (rotation: number) => {
      const preview = useDocumentFramePreviewStore.getState();
      for (const { id, frame } of rotated(
        entries,
        center,
        rotation - selection.rotation,
      )) {
        preview.set(id, frame);
      }
      return true;
    },
    commit: async (rotation: number) => {
      try {
        await editDocument(
          rotated(entries, center, rotation - selection.rotation).map(
            ({ id, frame }) => ({
              op: 'setFrame' as const,
              scene: sceneId,
              id,
              frame: { x: frame.x, y: frame.y, rotation: frame.rotation },
            }),
          ),
        );
      } finally {
        clear();
      }
    },
    cancel: clear,
  };
};
