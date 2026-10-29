// 트리 요소 끌기 맞추기 - 옛 종류 다중 끌기(useSelectionDrag)와 같은 규칙.
// 여럿이면 묶음 상자, 하나면 그 요소를 다른 요소 가장자리에 맞추고, 안 붙는 축은 누른 요소를 격자에 맞춘다
import { snapToGrid } from '@hooks/Grid/utils';
import {
  calculateBounds,
  calculateGroupBounds,
  calculateSnapPoints,
  type ElementBounds,
  type GuideLine,
  type SpacingGuide,
} from '@utils/grid/smartGuides';
import type { Frame } from '@src/types/generated/elementDocument';

interface DocumentDragSnapInput {
  origins: ReadonlyArray<{ id: string; frame: Frame }>;
  // 누른 요소
  selfId: string;
  dx: number;
  dy: number;
  others: readonly ElementBounds[];
  gridSize: number;
  alignment: boolean;
  spacing: boolean;
}

export interface DocumentDragSnap {
  offsetX: number;
  offsetY: number;
  guides: {
    dragged: ElementBounds;
    active: GuideLine[];
    spacing: SpacingGuide[];
  } | null;
}

export const documentDragSnap = ({
  origins,
  selfId,
  dx,
  dy,
  others,
  gridSize,
  alignment,
  spacing,
}: DocumentDragSnapInput): DocumentDragSnap => {
  const self = origins.find(({ id }) => id === selfId)?.frame;
  if (!self) return { offsetX: dx, offsetY: dy, guides: null };
  const moved = origins.map(({ id, frame }) =>
    calculateBounds(frame.x + dx, frame.y + dy, frame.width, frame.height, id),
  );
  const group = moved.length > 1 ? calculateGroupBounds(moved) : null;
  const target =
    group ??
    calculateBounds(self.x + dx, self.y + dy, self.width, self.height, selfId);
  const snap = alignment
    ? calculateSnapPoints(target, [...others], undefined, {
        groupBounds: group ?? undefined,
        disableSpacing: !spacing,
        gridSnapSize: gridSize,
      })
    : null;
  const offsetX = snap?.didSnapX
    ? dx + snap.snappedX - target.left
    : snapToGrid(self.x + dx, gridSize) - self.x;
  const offsetY = snap?.didSnapY
    ? dy + snap.snappedY - target.top
    : snapToGrid(self.y + dy, gridSize) - self.y;
  if (!snap || (!snap.didSnapX && !snap.didSnapY)) {
    return { offsetX, offsetY, guides: null };
  }
  return {
    offsetX,
    offsetY,
    guides: {
      dragged: calculateBounds(
        target.left + (snap.didSnapX ? snap.snappedX - target.left : 0),
        target.top + (snap.didSnapY ? snap.snappedY - target.top : 0),
        target.width,
        target.height,
        group ? 'group' : selfId,
      ),
      active: snap.guides,
      spacing: spacing ? snap.spacingGuides : [],
    },
  };
};
