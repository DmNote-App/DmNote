import React, { useMemo } from "react";
import { useSmartGuidesStore } from "@stores/useSmartGuidesStore";
import { calculateGuideLineExtent } from "@utils/smartGuides";
import { useKeyStore } from "@stores/useKeyStore";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import { calculateBounds, type ElementBounds } from "@utils/smartGuides";

interface SmartGuidesOverlayProps {
  zoom?: number;
  panX?: number;
  panY?: number;
}

/**
 * 스마트 가이드 오버레이 컴포넌트
 * 드래그 중 다른 요소와 정렬될 때 가이드라인을 표시
 */
export const SmartGuidesOverlay: React.FC<SmartGuidesOverlayProps> = ({
  zoom = 1,
  panX = 0,
  panY = 0,
}) => {
  const activeGuides = useSmartGuidesStore((state) => state.activeGuides);
  const draggedBounds = useSmartGuidesStore((state) => state.draggedBounds);
  const isActive = useSmartGuidesStore((state) => state.isActive);

  // 현재 탭의 키 위치 정보
  const positions = useKeyStore((state) => state.positions);
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);

  // 플러그인 요소 정보
  const pluginElements = usePluginDisplayElementStore(
    (state) => state.elements
  );

  // 모든 요소의 bounds 계산
  const allElementBounds = useMemo<ElementBounds[]>(() => {
    const bounds: ElementBounds[] = [];

    // 키 요소 bounds
    const keyPositions = positions[selectedKeyType] || [];
    keyPositions.forEach((pos, index) => {
      bounds.push(
        calculateBounds(
          pos.dx,
          pos.dy,
          pos.width || 60,
          pos.height || 60,
          `key-${index}`
        )
      );
    });

    // 플러그인 요소 bounds (main 윈도우에 표시되는 것만)
    pluginElements.forEach((el) => {
      if (el.measuredSize) {
        bounds.push(
          calculateBounds(
            el.position.x,
            el.position.y,
            el.measuredSize.width,
            el.measuredSize.height,
            el.fullId
          )
        );
      }
    });

    return bounds;
  }, [positions, selectedKeyType, pluginElements]);

  if (!isActive || !draggedBounds || activeGuides.length === 0) {
    return null;
  }

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "visible",
        zIndex: 9999,
      }}
    >
      <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
        {activeGuides.map((guide, index) => {
          const extent = calculateGuideLineExtent(
            guide,
            draggedBounds,
            allElementBounds
          );

          if (guide.type === "vertical") {
            return (
              <line
                key={`guide-${index}`}
                x1={guide.position}
                y1={extent.start}
                x2={guide.position}
                y2={extent.end}
                stroke="#FF6B6B"
                strokeWidth={1 / zoom}
                strokeDasharray={`${4 / zoom} ${2 / zoom}`}
                style={{
                  filter: "drop-shadow(0 0 2px rgba(255, 107, 107, 0.5))",
                }}
              />
            );
          } else {
            return (
              <line
                key={`guide-${index}`}
                x1={extent.start}
                y1={guide.position}
                x2={extent.end}
                y2={guide.position}
                stroke="#FF6B6B"
                strokeWidth={1 / zoom}
                strokeDasharray={`${4 / zoom} ${2 / zoom}`}
                style={{
                  filter: "drop-shadow(0 0 2px rgba(255, 107, 107, 0.5))",
                }}
              />
            );
          }
        })}
      </g>
    </svg>
  );
};

export default SmartGuidesOverlay;
