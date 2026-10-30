import type { EditorElementTypeV1 } from '@src/types/editor';
import type { Frame } from '@src/types/generated/elementDocument';
import { scaleDocumentFrames } from './documentGroupResize';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 섞인 선택 묶음 크기 조절 - 두 가족을 한 틀로 비례해 옮기고, 옛 종류는 종류별 위치 패치로 나눈다 */
export const mixedResizeTargets = (
  legacy: ReadonlyArray<{
    type: EditorElementTypeV1;
    id: string;
    frame: Frame;
  }>,
  document: ReadonlyArray<{ id: string; frame: Frame }>,
  from: Box,
  to: Box,
) => {
  const types = new Map(legacy.map(({ id, type }) => [id, type]));
  const byType = new Map<
    EditorElementTypeV1,
    {
      id: string;
      patch: { dx: number; dy: number; width: number; height: number };
    }[]
  >();
  for (const { id, frame } of scaleDocumentFrames(legacy, from, to)) {
    const type = types.get(id)!;
    byType.set(type, [
      ...(byType.get(type) ?? []),
      {
        id,
        patch: {
          dx: frame.x,
          dy: frame.y,
          width: frame.width,
          height: frame.height,
        },
      },
    ]);
  }
  return {
    legacy: byType,
    document: scaleDocumentFrames(document, from, to),
  };
};
