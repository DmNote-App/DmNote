/**
 * Grid 유틸리티 함수들
 */

import { GRID_SNAP } from "./constants";

/**
 * 값을 그리드 스냅에 맞춰 반올림
 * @param value - 스냅할 값
 * @returns 스냅된 값
 */
export const snapToGrid = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / GRID_SNAP) * GRID_SNAP;
};

/**
 * 커서 좌표를 그리드에 스냅
 * @param x - X 좌표
 * @param y - Y 좌표
 * @returns 스냅된 좌표
 */
export const snapCursorToGrid = (
  x: number,
  y: number
): { x: number; y: number } => ({
  x: snapToGrid(x),
  y: snapToGrid(y),
});
