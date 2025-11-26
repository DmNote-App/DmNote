import { useState, useEffect, useCallback, useRef } from "react";

export const useDraggable = ({
  gridSize,
  initialX = 0,
  initialY = 0,
  onPositionChange,
  zoom = 1, // 줌 레벨 (기본값 1)
  panX = 0, // 팬 X 오프셋
  panY = 0, // 팬 Y 오프셋
}) => {
  const [node, setNode] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [wasMoved, setWasMoved] = useState(false);
  const [{ dx, dy }, setOffset] = useState({ dx: initialX, dy: initialY });

  // 마지막 스냅 좌표를 ref로 보관 (mouseup 시 커밋)
  const lastSnappedRef = useRef({ dx: initialX, dy: initialY });
  // 드래그 감지를 위한 최소 거리 임계값
  const dragThresholdRef = useRef(5);

  // 줌/팬 값을 ref로 저장 (드래그 중 최신 값 참조)
  const zoomRef = useRef(zoom);
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);

  useEffect(() => {
    zoomRef.current = zoom;
    panXRef.current = panX;
    panYRef.current = panY;
  }, [zoom, panX, panY]);

  // initialX, initialY 변경 시 동기화
  useEffect(() => {
    setOffset({ dx: initialX, dy: initialY });
    lastSnappedRef.current = { dx: initialX, dy: initialY };
  }, [initialX, initialY]);

  const ref = useCallback((nodeEle) => {
    setNode(nodeEle);
  }, []);

  const handleMouseOver = () => {
    if (node && !isDragging) node.style.cursor = "grab";
  };

  const handleMouseOut = () => {
    if (node && !isDragging) node.style.cursor = "default";
  };

  const handleMouseDown = useCallback(
    (e) => {
      if (!node) return;

      // 마우스 다운 시점의 위치 저장
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      let actuallyDragging = false;

      setIsDragging(true);
      setWasMoved(false);

      // 현재 줌/팬 값 캡처
      const currentZoom = zoomRef.current;

      // 무한 캔버스에서는 경계 제한 없음
      // 시작 위치 계산 (줌 반영)
      const startPos = {
        x: e.clientX - dx * currentZoom,
        y: e.clientY - dy * currentZoom,
      };
      const initialPosition = { dx, dy };

      let rafId = null;

      const handleMouseMove = (moveEvent) => {
        // 드래그 임계값 체크
        const deltaX = Math.abs(moveEvent.clientX - startClientX);
        const deltaY = Math.abs(moveEvent.clientY - startClientY);

        if (
          !actuallyDragging &&
          (deltaX > dragThresholdRef.current ||
            deltaY > dragThresholdRef.current)
        ) {
          actuallyDragging = true;
          node.style.cursor = "grabbing";
          // 실제 드래그가 시작될 때만 최적화 적용
          node.style.pointerEvents = "none";
          node.style.userSelect = "none";
        }

        if (!actuallyDragging) return;

        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;

          // 줌 레벨을 고려한 좌표 계산
          const newDx = (moveEvent.clientX - startPos.x) / currentZoom;
          const newDy = (moveEvent.clientY - startPos.y) / currentZoom;

          // 그리드 스냅 (경계 제한 없음 - 무한 캔버스)
          const snappedX = Math.round(newDx / gridSize) * gridSize;
          const snappedY = Math.round(newDy / gridSize) * gridSize;

          if (
            snappedX !== initialPosition.dx ||
            snappedY !== initialPosition.dy
          ) {
            setWasMoved(true);
          }

          lastSnappedRef.current = { dx: snappedX, dy: snappedY };
          setOffset({ dx: snappedX, dy: snappedY });
        });
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);

        setIsDragging(false);

        // 실제 드래그가 발생했을 때만 복구
        if (actuallyDragging) {
          node.style.cursor = "grab";
          node.style.pointerEvents = "auto";
          node.style.userSelect = "auto";

          // 최종 위치만 부모에 커밋
          const { dx: finalDx, dy: finalDy } = lastSnappedRef.current;
          onPositionChange?.(finalDx, finalDy);
        } else {
          // 클릭만 했을 경우 커서만 복구
          node.style.cursor = "grab";
        }
      };

      document.addEventListener("mousemove", handleMouseMove, {
        passive: true,
      });
      document.addEventListener("mouseup", handleMouseUp, { once: true });
    },
    [node, dx, dy, gridSize, onPositionChange]
  );

  useEffect(() => {
    if (!node) return;

    node.addEventListener("mousedown", handleMouseDown);
    node.addEventListener("mouseover", handleMouseOver);
    node.addEventListener("mouseout", handleMouseOut);

    return () => {
      node.removeEventListener("mousedown", handleMouseDown);
      node.removeEventListener("mouseover", handleMouseOver);
      node.removeEventListener("mouseout", handleMouseOut);
    };
  }, [node, handleMouseDown]);

  return { ref, dx, dy, wasMoved, isDragging };
};
