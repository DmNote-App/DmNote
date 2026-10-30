import type { Frame, Node, Scene } from '@src/types/generated/elementDocument';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import { isPluginKind } from '@src/types/elementKinds';
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

const findElement = (nodes: readonly Node[], id: string) => {
  for (const node of nodes) {
    if (node.type === 'element') {
      if (node.id === id) return node;
    } else {
      const inner: Extract<Node, { type: 'element' }> | undefined = findElement(
        node.children,
        id,
      );
      if (inner) return inner;
    }
  }
  return undefined;
};

/** 묶음 회전 대상 - 고른 순서대로 트리 요소의 틀. 플러그인·회전 없는 종류가 섞이면 돌릴 수 없다 */
export const documentRotationEntries = (
  scene: Scene | undefined,
  ids: readonly string[],
) => {
  if (!scene)
    return { entries: [] as DocumentRotationEntry[], rotatable: false };
  const elements = ids.flatMap((id) => {
    const element = findElement(scene.nodes, id);
    return element ? [element] : [];
  });
  return {
    entries: elements.map(({ id, frame }) => ({ id, frame })),
    rotatable: elements.every(
      ({ kind }) =>
        !isPluginKind(kind) && elementKindDefinition(kind)?.rotatable !== false,
    ),
  };
};

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
    // gestureId - 섞인 선택에서 옛 종류 회전과 한 되돌리기 단계로
    commit: async (rotation: number, gestureId?: string) => {
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
          { gestureId },
        );
      } finally {
        clear();
      }
    },
    cancel: clear,
  };
};
