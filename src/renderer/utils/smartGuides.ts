/**
 * Smart Guides (스마트 가이드) 유틸리티
 * 드래그 중 다른 요소와 정렬될 때 가이드라인을 표시하고 스냅하는 기능
 */

export interface ElementBounds {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface GuideLine {
  type: "vertical" | "horizontal";
  position: number; // 가이드라인의 x 또는 y 위치
  alignType: "left" | "center" | "right" | "top" | "middle" | "bottom";
}

export interface SnapResult {
  snappedX: number;
  snappedY: number;
  guides: GuideLine[];
  didSnapX: boolean;
  didSnapY: boolean;
}

// 스냅 거리 임계값 (픽셀)
const SNAP_THRESHOLD = 8;

/**
 * 요소의 bounds 정보 계산
 */
export function calculateBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  id: string = ""
): ElementBounds {
  return {
    id,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    centerX: x + width / 2,
    centerY: y + height / 2,
    width,
    height,
  };
}

/**
 * 두 값이 스냅 거리 내에 있는지 확인
 */
function isWithinThreshold(
  value1: number,
  value2: number,
  threshold: number = SNAP_THRESHOLD
): boolean {
  return Math.abs(value1 - value2) <= threshold;
}

/**
 * 드래그 중인 요소와 다른 요소들 사이의 스냅 포인트 계산
 */
export function calculateSnapPoints(
  draggedBounds: ElementBounds,
  otherElements: ElementBounds[],
  threshold: number = SNAP_THRESHOLD
): SnapResult {
  const guides: GuideLine[] = [];
  let snappedX = draggedBounds.left;
  let snappedY = draggedBounds.top;
  let didSnapX = false;
  let didSnapY = false;

  // 가장 가까운 스냅 포인트 추적
  let closestXDiff = Infinity;
  let closestYDiff = Infinity;

  for (const other of otherElements) {
    // 자기 자신은 스킵
    if (other.id === draggedBounds.id) continue;

    // === X축 (수직 가이드라인) 스냅 체크 ===

    // 왼쪽 가장자리 정렬 (left-to-left)
    let diff = Math.abs(draggedBounds.left - other.left);
    if (diff <= threshold && diff < closestXDiff) {
      closestXDiff = diff;
      snappedX = other.left;
      didSnapX = true;
    }

    // 오른쪽 가장자리 정렬 (right-to-right)
    diff = Math.abs(draggedBounds.right - other.right);
    if (diff <= threshold && diff < closestXDiff) {
      closestXDiff = diff;
      snappedX = other.right - draggedBounds.width;
      didSnapX = true;
    }

    // 왼쪽-오른쪽 정렬 (left-to-right) - 임시 비활성화
    // diff = Math.abs(draggedBounds.left - other.right);
    // if (diff <= threshold && diff < closestXDiff) {
    //   closestXDiff = diff;
    //   snappedX = other.right;
    //   didSnapX = true;
    // }

    // 오른쪽-왼쪽 정렬 (right-to-left) - 임시 비활성화
    // diff = Math.abs(draggedBounds.right - other.left);
    // if (diff <= threshold && diff < closestXDiff) {
    //   closestXDiff = diff;
    //   snappedX = other.left - draggedBounds.width;
    //   didSnapX = true;
    // }

    // 중앙 정렬 (center-to-center X)
    diff = Math.abs(draggedBounds.centerX - other.centerX);
    if (diff <= threshold && diff < closestXDiff) {
      closestXDiff = diff;
      snappedX = other.centerX - draggedBounds.width / 2;
      didSnapX = true;
    }

    // === Y축 (수평 가이드라인) 스냅 체크 ===

    // 상단 정렬 (top-to-top)
    diff = Math.abs(draggedBounds.top - other.top);
    if (diff <= threshold && diff < closestYDiff) {
      closestYDiff = diff;
      snappedY = other.top;
      didSnapY = true;
    }

    // 하단 정렬 (bottom-to-bottom)
    diff = Math.abs(draggedBounds.bottom - other.bottom);
    if (diff <= threshold && diff < closestYDiff) {
      closestYDiff = diff;
      snappedY = other.bottom - draggedBounds.height;
      didSnapY = true;
    }

    // 상단-하단 정렬 (top-to-bottom) - 임시 비활성화
    // diff = Math.abs(draggedBounds.top - other.bottom);
    // if (diff <= threshold && diff < closestYDiff) {
    //   closestYDiff = diff;
    //   snappedY = other.bottom;
    //   didSnapY = true;
    // }

    // 하단-상단 정렬 (bottom-to-top) - 임시 비활성화
    // diff = Math.abs(draggedBounds.bottom - other.top);
    // if (diff <= threshold && diff < closestYDiff) {
    //   closestYDiff = diff;
    //   snappedY = other.top - draggedBounds.height;
    //   didSnapY = true;
    // }

    // 중앙 정렬 (center-to-center Y)
    diff = Math.abs(draggedBounds.centerY - other.centerY);
    if (diff <= threshold && diff < closestYDiff) {
      closestYDiff = diff;
      snappedY = other.centerY - draggedBounds.height / 2;
      didSnapY = true;
    }
  }

  // 스냅된 위치를 기준으로 가이드라인 생성
  const snappedBounds = calculateBounds(
    snappedX,
    snappedY,
    draggedBounds.width,
    draggedBounds.height,
    draggedBounds.id
  );

  for (const other of otherElements) {
    if (other.id === draggedBounds.id) continue;

    // X축 가이드라인 (수직선)
    if (didSnapX) {
      // 왼쪽 가장자리 정렬
      if (Math.abs(snappedBounds.left - other.left) < 1) {
        guides.push({
          type: "vertical",
          position: other.left,
          alignType: "left",
        });
      }
      // 오른쪽 가장자리 정렬
      if (Math.abs(snappedBounds.right - other.right) < 1) {
        guides.push({
          type: "vertical",
          position: other.right,
          alignType: "right",
        });
      }
      // 왼쪽-오른쪽 정렬 - 임시 비활성화
      // if (Math.abs(snappedBounds.left - other.right) < 1) {
      //   guides.push({
      //     type: "vertical",
      //     position: other.right,
      //     alignType: "left",
      //   });
      // }
      // 오른쪽-왼쪽 정렬 - 임시 비활성화
      // if (Math.abs(snappedBounds.right - other.left) < 1) {
      //   guides.push({
      //     type: "vertical",
      //     position: other.left,
      //     alignType: "right",
      //   });
      // }
      // 중앙 정렬
      if (Math.abs(snappedBounds.centerX - other.centerX) < 1) {
        guides.push({
          type: "vertical",
          position: other.centerX,
          alignType: "center",
        });
      }
    }

    // Y축 가이드라인 (수평선)
    if (didSnapY) {
      // 상단 정렬
      if (Math.abs(snappedBounds.top - other.top) < 1) {
        guides.push({
          type: "horizontal",
          position: other.top,
          alignType: "top",
        });
      }
      // 하단 정렬
      if (Math.abs(snappedBounds.bottom - other.bottom) < 1) {
        guides.push({
          type: "horizontal",
          position: other.bottom,
          alignType: "bottom",
        });
      }
      // 상단-하단 정렬 - 임시 비활성화
      // if (Math.abs(snappedBounds.top - other.bottom) < 1) {
      //   guides.push({
      //     type: "horizontal",
      //     position: other.bottom,
      //     alignType: "top",
      //   });
      // }
      // 하단-상단 정렬 - 임시 비활성화
      // if (Math.abs(snappedBounds.bottom - other.top) < 1) {
      //   guides.push({
      //     type: "horizontal",
      //     position: other.top,
      //     alignType: "bottom",
      //   });
      // }
      // 중앙 정렬
      if (Math.abs(snappedBounds.centerY - other.centerY) < 1) {
        guides.push({
          type: "horizontal",
          position: other.centerY,
          alignType: "middle",
        });
      }
    }
  }

  // 중복 가이드라인 제거
  const uniqueGuides = guides.filter(
    (guide, index, self) =>
      index ===
      self.findIndex(
        (g) =>
          g.type === guide.type && Math.abs(g.position - guide.position) < 1
      )
  );

  return {
    snappedX,
    snappedY,
    guides: uniqueGuides,
    didSnapX,
    didSnapY,
  };
}

/**
 * 가이드라인의 시작/끝 위치 계산 (시각화용)
 */
export function calculateGuideLineExtent(
  guide: GuideLine,
  draggedBounds: ElementBounds,
  otherElements: ElementBounds[]
): { start: number; end: number } {
  const relevantElements = otherElements.filter((el) => {
    if (el.id === draggedBounds.id) return false;

    if (guide.type === "vertical") {
      // 수직 가이드라인: x 위치가 일치하는 요소
      return (
        Math.abs(el.left - guide.position) < 1 ||
        Math.abs(el.right - guide.position) < 1 ||
        Math.abs(el.centerX - guide.position) < 1
      );
    } else {
      // 수평 가이드라인: y 위치가 일치하는 요소
      return (
        Math.abs(el.top - guide.position) < 1 ||
        Math.abs(el.bottom - guide.position) < 1 ||
        Math.abs(el.centerY - guide.position) < 1
      );
    }
  });

  // 드래그 중인 요소도 포함
  relevantElements.push(draggedBounds);

  if (guide.type === "vertical") {
    const tops = relevantElements.map((el) => el.top);
    const bottoms = relevantElements.map((el) => el.bottom);
    return {
      start: Math.min(...tops) - 20,
      end: Math.max(...bottoms) + 20,
    };
  } else {
    const lefts = relevantElements.map((el) => el.left);
    const rights = relevantElements.map((el) => el.right);
    return {
      start: Math.min(...lefts) - 20,
      end: Math.max(...rights) + 20,
    };
  }
}
