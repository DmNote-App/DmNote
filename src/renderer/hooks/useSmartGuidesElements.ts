/**
 * 스마트 가이드를 위한 모든 요소의 bounds를 제공하는 훅
 */
import { useCallback } from "react";
import { useKeyStore } from "@stores/useKeyStore";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import { calculateBounds, type ElementBounds } from "@utils/smartGuides";

/**
 * 현재 탭의 모든 요소(키 + 플러그인 요소)의 bounds를 반환하는 함수를 제공하는 훅
 */
export function useSmartGuidesElements() {
  const positions = useKeyStore((state) => state.positions);
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  const pluginElements = usePluginDisplayElementStore(
    (state) => state.elements
  );

  /**
   * 특정 요소를 제외한 모든 요소의 bounds를 반환
   * @param excludeId 제외할 요소의 ID
   */
  const getOtherElements = useCallback(
    (excludeId: string): ElementBounds[] => {
      const bounds: ElementBounds[] = [];

      // 키 요소 bounds
      const keyPositions = positions[selectedKeyType] || [];
      keyPositions.forEach((pos, index) => {
        const id = `key-${index}`;
        if (id !== excludeId) {
          bounds.push(
            calculateBounds(
              pos.dx,
              pos.dy,
              pos.width || 60,
              pos.height || 60,
              id
            )
          );
        }
      });

      // 플러그인 요소 bounds
      pluginElements.forEach((el) => {
        if (el.fullId !== excludeId && el.measuredSize) {
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
    },
    [positions, selectedKeyType, pluginElements]
  );

  return { getOtherElements };
}
