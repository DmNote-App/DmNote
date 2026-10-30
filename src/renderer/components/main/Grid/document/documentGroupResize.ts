import type { Frame } from '@src/types/generated/elementDocument';
import {
  calculateMinGroupSize,
  GROUP_RESIZE_MIN_SIZE,
} from '../handles/groupResizePlan';

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

/** 요소가 옛 종류 묶음과 같은 최소 크기 아래로 줄지 않게 새 틀을 막는다 - 붙잡은 손잡이 반대편을 지킨다 */
export const clampGroupResize = (
  entries: ReadonlyArray<{ id: string; frame: Frame }>,
  from: Box,
  to: Box,
  handle: { dx: -1 | 0 | 1; dy: -1 | 0 | 1 },
): Box => {
  const bounds = entries.map(({ id, frame }) => ({
    // 축소 하한 판정에는 종류 정보가 필요 없다 - 비율 고정이 아닌 요소로 넘긴다
    element: { type: 'plugin' as const, id },
    bounds: frame,
  }));
  const minWidth = calculateMinGroupSize(
    bounds,
    from.width,
    'x',
    GROUP_RESIZE_MIN_SIZE,
  );
  const minHeight = calculateMinGroupSize(
    bounds,
    from.height,
    'y',
    GROUP_RESIZE_MIN_SIZE,
  );
  const width = Math.max(to.width, Math.min(minWidth, from.width));
  const height = Math.max(to.height, Math.min(minHeight, from.height));
  return {
    x: handle.dx === -1 ? to.x + to.width - width : to.x,
    y: handle.dy === -1 ? to.y + to.height - height : to.y,
    width,
    height,
  };
};
