import type { Frame } from '@src/types/generated/elementDocument';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 묶음 크기 조절 - 시작 선택틀 안의 상대 위치·크기를 새 틀에 비례로 옮긴다 (회전 없는 요소) */
export const scaleDocumentFrames = (
  entries: ReadonlyArray<{ id: string; frame: Frame }>,
  from: Box,
  to: Box,
) => {
  const scaleX = from.width > 0 ? to.width / from.width : 1;
  const scaleY = from.height > 0 ? to.height / from.height : 1;
  return entries.map(({ id, frame }) => ({
    id,
    frame: {
      ...frame,
      x: to.x + (frame.x - from.x) * scaleX,
      y: to.y + (frame.y - from.y) * scaleY,
      width: frame.width * scaleX,
      height: frame.height * scaleY,
    },
  }));
};
