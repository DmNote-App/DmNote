// 오버레이 스크롤 막대의 순수 계산 - DOM 없이 썸 크기·위치, 끌기·트랙 누름 환산, 표시 상태를 정한다

export type OverlayScrollbarState =
  | 'none'
  | 'hidden'
  | 'thin'
  | 'expanded'
  | 'dragging';

// scrollHeight는 정수로 반올림돼 clientHeight보다 1px 크게 나오는 경우가 있다
const OVERFLOW_EPSILON = 1;

// 트랙 누름 한 번에 넘기는 양. 한 줄 남짓 겹쳐 이어 읽을 자리를 남긴다
const PAGE_RATIO = 0.9;

const LINE_HEIGHT_PX = 16;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export interface ThumbGeometryInput {
  viewportSize: number;
  contentSize: number;
  scrollOffset: number;
  /** 썸이 움직이는 트랙 길이 (레일 위아래 여백 제외) */
  trackSize: number;
  minThumbSize: number;
}

export interface ThumbGeometry {
  overflow: boolean;
  /** 스크롤할 수 있는 거리 */
  range: number;
  size: number;
  /** 썸이 움직일 수 있는 거리 */
  travel: number;
  /** 트랙 시작점 기준 썸 위치 */
  offset: number;
}

export const computeThumbGeometry = ({
  viewportSize,
  contentSize,
  scrollOffset,
  trackSize,
  minThumbSize,
}: ThumbGeometryInput): ThumbGeometry => {
  const track = Math.max(0, trackSize);
  const rawRange = Math.max(0, contentSize - viewportSize);
  if (rawRange <= OVERFLOW_EPSILON || contentSize <= 0) {
    return { overflow: false, range: 0, size: track, travel: 0, offset: 0 };
  }
  const proportional = (track * viewportSize) / contentSize;
  const size = clamp(proportional, Math.min(minThumbSize, track), track);
  const travel = Math.max(0, track - size);
  const offset = clamp(scrollOffset / rawRange, 0, 1) * travel;
  return { overflow: true, range: rawRange, size, travel, offset };
};

export const scrollOffsetForThumbDrag = ({
  startScroll,
  pointerDelta,
  range,
  travel,
}: {
  startScroll: number;
  pointerDelta: number;
  range: number;
  travel: number;
}): number => {
  if (travel <= 0) return startScroll;
  return clamp(startScroll + (pointerDelta * range) / travel, 0, range);
};

/**
 * 트랙(썸 바깥)을 눌렀을 때 갈 스크롤 위치. 기본은 한 화면 이동,
 * jumpToSpot이면 썸 가운데가 누른 자리에 오도록 바로 이동한다.
 * pointer는 트랙 시작점 기준 좌표. 썸 위를 눌렀으면 null
 */
export const resolveTrackPressTarget = ({
  pointer,
  geometry,
  scrollOffset,
  viewportSize,
  jumpToSpot,
}: {
  pointer: number;
  geometry: ThumbGeometry;
  scrollOffset: number;
  viewportSize: number;
  jumpToSpot: boolean;
}): number | null => {
  const { range, size, travel, offset } = geometry;
  if (range <= 0) return null;
  if (jumpToSpot) {
    if (travel <= 0) return null;
    return clamp((pointer - size / 2) / travel, 0, 1) * range;
  }
  if (pointer >= offset && pointer <= offset + size) return null;
  const direction = pointer < offset ? -1 : 1;
  return clamp(scrollOffset + direction * viewportSize * PAGE_RATIO, 0, range);
};

export const resolveOverlayScrollbarState = ({
  overflow,
  dragging,
  hovering,
  revealed,
}: {
  overflow: boolean;
  dragging: boolean;
  hovering: boolean;
  revealed: boolean;
}): OverlayScrollbarState => {
  if (!overflow) return 'none';
  if (dragging) return 'dragging';
  if (hovering) return 'expanded';
  if (revealed) return 'thin';
  return 'hidden';
};

// WheelEvent.deltaMode 단위(0 픽셀, 1 줄, 2 페이지)를 픽셀로
export const wheelDeltaToPixels = (
  delta: number,
  deltaMode: number,
  pageSize: number,
): number => {
  if (deltaMode === 1) return delta * LINE_HEIGHT_PX;
  if (deltaMode === 2) return delta * pageSize;
  return delta;
};
