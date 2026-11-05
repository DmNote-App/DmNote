import React from 'react';
import type { Bounds } from './groupResizeUtils';
import {
  GROUP_SELECTION_BORDER_COLOR,
  GROUP_SELECTION_BORDER_WIDTH,
  SELECTION_BORDER_WIDTH,
} from './selectionOutline';

interface GroupSelectionOutlineProps {
  bounds: Bounds;
  zoom: number;
  panX: number;
  panY: number;
}

// 여러 요소를 고른 묶음 바깥 윤곽 - 내부 요소 테두리와 같은 위치에 겹치게 (옛 종류·트리 요소 공용)
const GroupSelectionOutline = ({
  bounds,
  zoom,
  panX,
  panY,
}: GroupSelectionOutlineProps) => (
  <div
    data-group-resize-outline=""
    style={{
      position: 'absolute',
      left: bounds.x * zoom + panX - SELECTION_BORDER_WIDTH,
      top: bounds.y * zoom + panY - SELECTION_BORDER_WIDTH,
      width: bounds.width * zoom + SELECTION_BORDER_WIDTH * 2,
      height: bounds.height * zoom + SELECTION_BORDER_WIDTH * 2,
      boxSizing: 'border-box',
      border: `${GROUP_SELECTION_BORDER_WIDTH}px solid ${GROUP_SELECTION_BORDER_COLOR}`,
      borderRadius: '6px',
      pointerEvents: 'none',
      zIndex: 'var(--z-canvas-group-outline)',
    }}
  />
);

export default GroupSelectionOutline;
