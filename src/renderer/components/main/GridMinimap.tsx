import React, {
  useMemo,
  useCallback,
  useState,
  useRef,
  useEffect,
} from "react";
import { useGridViewStore } from "@stores/useGridViewStore";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import { useKeyStore } from "@stores/useKeyStore";

interface Position {
  dx: number;
  dy: number;
  width?: number;
  height?: number;
}

interface PluginElementPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GridMinimapProps {
  positions: Position[];
  zoom: number;
  panX: number;
  panY: number;
  containerRef: React.RefObject<HTMLDivElement>;
  mode: string;
}

const MINIMAP_WIDTH = 120;
const MINIMAP_HEIGHT = 80;
const MINIMAP_PADDING = 10;

export default function GridMinimap({
  positions,
  zoom,
  panX,
  panY,
  containerRef,
  mode,
}: GridMinimapProps) {
  const { setPan } = useGridViewStore();
  const [isDragging, setIsDragging] = useState(false);
  const minimapRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({
    width: 400,
    height: 300,
  });

  // 플러그인 요소들 가져오기
  const pluginElements = usePluginDisplayElementStore(
    (state) => state.elements
  );
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);

  // 현재 탭의 플러그인 요소만 필터링
  const filteredPluginElements = useMemo(() => {
    return pluginElements.filter((el) => {
      if (el.tabId) {
        return el.tabId === selectedKeyType;
      }
      return true;
    });
  }, [pluginElements, selectedKeyType]);

  // 플러그인 요소들의 위치 정보 추출
  const pluginPositions: PluginElementPosition[] = useMemo(() => {
    return filteredPluginElements.map((el) => ({
      x: el.position?.x || 0,
      y: el.position?.y || 0,
      width: el.measuredSize?.width || el.estimatedSize?.width || 50,
      height: el.measuredSize?.height || el.estimatedSize?.height || 50,
    }));
  }, [filteredPluginElements]);

  // 컨테이너 크기 추적 (ResizeObserver 사용)
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    // 초기 크기 설정
    updateSize();

    // ResizeObserver로 크기 변경 감지
    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef]);

  // 모든 키 + 플러그인 요소의 바운딩 박스 계산
  const contentBounds = useMemo(() => {
    if (positions.length === 0 && pluginPositions.length === 0) {
      return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // 키들의 바운딩 박스 계산
    positions.forEach((pos) => {
      const x = pos.dx || 0;
      const y = pos.dy || 0;
      const w = pos.width || 60;
      const h = pos.height || 60;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    });

    // 플러그인 요소들의 바운딩 박스 계산
    pluginPositions.forEach((pos) => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + pos.height);
    });

    return { minX, minY, maxX, maxY };
  }, [positions, pluginPositions]);

  // 초기 뷰포트(panX=0, panY=0, zoom=1)와 컨텐츠를 합친 고정 바운딩 박스
  // panX/panY에 의존하지 않아 드래그 중에도 크기가 변하지 않음
  const bounds = useMemo(() => {
    // 초기 상태(pan=0, zoom=1)의 뷰포트 영역: (0,0) ~ (containerSize)
    const initialViewX = 0;
    const initialViewY = 0;
    const initialViewWidth = containerSize.width;
    const initialViewHeight = containerSize.height;

    // 컨텐츠 bounds와 초기 뷰포트 영역을 합침
    const minX = Math.min(contentBounds.minX, initialViewX);
    const minY = Math.min(contentBounds.minY, initialViewY);
    const maxX = Math.max(contentBounds.maxX, initialViewX + initialViewWidth);
    const maxY = Math.max(contentBounds.maxY, initialViewY + initialViewHeight);

    return { minX, minY, maxX, maxY };
  }, [contentBounds, containerSize]);

  // 미니맵 스케일 및 오프셋 계산 (중앙 정렬)
  const { minimapScale, offsetX, offsetY } = useMemo(() => {
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;
    const scaleX = (MINIMAP_WIDTH - MINIMAP_PADDING * 2) / contentWidth;
    const scaleY = (MINIMAP_HEIGHT - MINIMAP_PADDING * 2) / contentHeight;
    const scale = Math.min(scaleX, scaleY, 1);

    // 컨텐츠를 미니맵 중앙에 정렬하기 위한 오프셋
    const scaledWidth = contentWidth * scale;
    const scaledHeight = contentHeight * scale;
    const oX = (MINIMAP_WIDTH - scaledWidth) / 2;
    const oY = (MINIMAP_HEIGHT - scaledHeight) / 2;

    return { minimapScale: scale, offsetX: oX, offsetY: oY };
  }, [bounds]);

  // 뷰포트 영역 계산
  const viewport = useMemo(() => {
    // 화면에 보이는 그리드 영역 (줌/팬 역산)
    const viewX = -panX / zoom;
    const viewY = -panY / zoom;
    const viewWidth = containerSize.width / zoom;
    const viewHeight = containerSize.height / zoom;

    // 미니맵 좌표로 변환 (중앙 정렬 오프셋 적용)
    const x = (viewX - bounds.minX) * minimapScale + offsetX;
    const y = (viewY - bounds.minY) * minimapScale + offsetY;
    const width = viewWidth * minimapScale;
    const height = viewHeight * minimapScale;

    return { x, y, width, height };
  }, [containerSize, panX, panY, zoom, bounds, minimapScale, offsetX, offsetY]);

  // 미니맵 좌표를 팬 값으로 변환
  const minimapToGridPan = useCallback(
    (minimapX: number, minimapY: number) => {
      // 미니맵 좌표를 그리드 좌표로 변환 (중앙 정렬 오프셋 적용)
      const gridX = (minimapX - offsetX) / minimapScale + bounds.minX;
      const gridY = (minimapY - offsetY) / minimapScale + bounds.minY;

      // 뷰포트 중앙이 해당 위치로 오도록 팬 설정
      const newPanX = -(gridX * zoom - containerSize.width / 2);
      const newPanY = -(gridY * zoom - containerSize.height / 2);

      return { panX: newPanX, panY: newPanY };
    },
    [containerSize, minimapScale, bounds, zoom, offsetX, offsetY]
  );

  // 미니맵 클릭으로 팬 이동
  const handleMinimapClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isDragging) return; // 드래그 중에는 클릭 무시

      const minimapRect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - minimapRect.left;
      const clickY = e.clientY - minimapRect.top;

      const { panX: newPanX, panY: newPanY } = minimapToGridPan(clickX, clickY);
      setPan(mode, newPanX, newPanY);
    },
    [isDragging, minimapToGridPan, mode, setPan]
  );

  // 드래그 시작
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(true);

      const minimapRect = e.currentTarget.getBoundingClientRect();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const clickX = moveEvent.clientX - minimapRect.left;
        const clickY = moveEvent.clientY - minimapRect.top;

        const { panX: newPanX, panY: newPanY } = minimapToGridPan(
          clickX,
          clickY
        );
        setPan(mode, newPanX, newPanY);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [minimapToGridPan, mode, setPan]
  );

  // 키 개수와 플러그인 요소가 모두 없으면 미니맵 숨김
  if (positions.length === 0 && pluginPositions.length === 0) {
    return null;
  }

  return (
    <div
      ref={minimapRef}
      className="absolute bottom-2 right-2 bg-black/60 rounded cursor-pointer select-none"
      style={{
        width: MINIMAP_WIDTH,
        height: MINIMAP_HEIGHT,
        outline: "1px solid rgba(255, 255, 255, 0.2)",
        outlineOffset: "-1px",
      }}
      onClick={handleMinimapClick}
      onMouseDown={handleMouseDown}
    >
      {/* 키 및 플러그인 요소 표시 */}
      <svg
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        className="absolute inset-0"
      >
        {/* 키 표시 */}
        {positions.map((pos, index) => {
          const x = ((pos.dx || 0) - bounds.minX) * minimapScale + offsetX;
          const y = ((pos.dy || 0) - bounds.minY) * minimapScale + offsetY;
          const w = (pos.width || 60) * minimapScale;
          const h = (pos.height || 60) * minimapScale;

          return (
            <rect
              key={`key-${index}`}
              x={x}
              y={y}
              width={Math.max(w, 2)}
              height={Math.max(h, 2)}
              fill="rgba(255, 255, 255, 0.6)"
              rx={1}
            />
          );
        })}
        {/* 플러그인 요소 표시 (다른 색상으로 구분) */}
        {pluginPositions.map((pos, index) => {
          const x = (pos.x - bounds.minX) * minimapScale + offsetX;
          const y = (pos.y - bounds.minY) * minimapScale + offsetY;
          const w = pos.width * minimapScale;
          const h = pos.height * minimapScale;

          return (
            <rect
              key={`plugin-${index}`}
              x={x}
              y={y}
              width={Math.max(w, 2)}
              height={Math.max(h, 2)}
              fill="rgba(168, 85, 247, 0.6)"
              rx={1}
            />
          );
        })}
        {/* 현재 뷰포트 표시 */}
        <rect
          x={viewport.x}
          y={viewport.y}
          width={viewport.width}
          height={viewport.height}
          fill="rgba(59, 130, 246, 0.2)"
          stroke="rgba(59, 130, 246, 0.8)"
          strokeWidth={1}
          rx={2}
        />
      </svg>
    </div>
  );
}
