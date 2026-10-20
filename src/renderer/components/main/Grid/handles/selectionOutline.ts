import {
  rotatedRectCorners,
  rotatePointAround,
  type Point,
} from '@utils/element/rotation';
import type { Bounds } from './groupResizeUtils';
import type { GroupRotationFrame } from './rotatedGroupResize';

// 선택 테두리 규격 - 상자 바깥쪽에 선을 두르고 선 중심은 두께의 절반만큼 바깥에 배치
// 테두리·리사이즈 핸들·스프라이트 기준점 표식이 같은 프레임에 놓이도록 한 곳에서 정한다
export const SELECTION_BORDER_WIDTH = 1;
export const SELECTION_BORDER_CENTER = SELECTION_BORDER_WIDTH / 2;
export const GROUP_SELECTION_BORDER_WIDTH = SELECTION_BORDER_WIDTH;
export const GROUP_SELECTION_BORDER_COLOR = 'var(--ui-selection-border-strong)';

// 개별 변의 양 끝을 그룹 로컬 좌표로 옮겨 실제로 겹치는 변만 생략
export const getSelectionOutlineEdges = (
  bounds: Bounds,
  rotation: number,
  groupFrame: GroupRotationFrame | null,
) => {
  const edges = { top: true, right: true, bottom: true, left: true };
  if (!groupFrame) return edges;

  const group = groupFrame.bounds;
  const center = {
    x: group.x + group.width / 2,
    y: group.y + group.height / 2,
  };
  const corners = rotatedRectCorners(
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    rotation,
  ).map((point) => rotatePointAround(point, center, -groupFrame.rotation));
  const epsilon = 1e-5;
  const onGroupEdge = (a: Point, b: Point) => {
    const horizontal = [group.y, group.y + group.height].some(
      (y) =>
        Math.abs(a.y - y) <= epsilon &&
        Math.abs(b.y - y) <= epsilon &&
        Math.min(a.x, b.x) >= group.x - epsilon &&
        Math.max(a.x, b.x) <= group.x + group.width + epsilon,
    );
    const vertical = [group.x, group.x + group.width].some(
      (x) =>
        Math.abs(a.x - x) <= epsilon &&
        Math.abs(b.x - x) <= epsilon &&
        Math.min(a.y, b.y) >= group.y - epsilon &&
        Math.max(a.y, b.y) <= group.y + group.height + epsilon,
    );
    return horizontal || vertical;
  };
  edges.top = !onGroupEdge(corners[0], corners[1]);
  edges.right = !onGroupEdge(corners[1], corners[2]);
  edges.bottom = !onGroupEdge(corners[2], corners[3]);
  edges.left = !onGroupEdge(corners[3], corners[0]);
  return edges;
};
