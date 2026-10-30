import React, { Profiler, useRef, useState } from 'react';

import GridMinimap from '@components/main/Grid/core/GridMinimap';
import { useGridViewStore } from '@stores/grid/useGridViewStore';
import type { Scene } from '@src/types/generated/elementDocument';

interface GridMinimapBenchmarkSurfaceProps {
  strategy: 'legacy' | 'frame';
  itemCount: number;
  onRender?: (durationMs: number) => void;
}

export const GridMinimapBenchmarkSurface = ({
  strategy,
  itemCount,
  onRender = () => undefined,
}: GridMinimapBenchmarkSurfaceProps) => {
  const view = useGridViewStore((state) => state.viewStates.benchmark)!;
  const containerRef = useRef<HTMLDivElement>({
    getBoundingClientRect: () => ({
      width: 400,
      height: 300,
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  } as HTMLDivElement);
  // 미니맵은 트리 장면에서 요소를 읽는다 - 같은 수의 키 요소
  const [scene] = useState<Scene>(() => ({
    nodes: Array.from({ length: itemCount }, (_, index) => ({
      type: 'element' as const,
      id: `benchmark-key-${index}`,
      kind: 'key',
      frame: {
        x: index % 20,
        y: Math.floor(index / 20),
        width: 60,
        height: 60,
        rotation: 0,
      },
    })),
  }));

  return (
    <Profiler
      id="grid-minimap-benchmark"
      onRender={(_, __, duration) => onRender(duration)}
    >
      <div data-benchmark-grid-minimap="true" data-pan-x={view.panX}>
        <GridMinimap
          sceneOverride={scene}
          zoom={view.zoom}
          panX={view.panX}
          panY={view.panY}
          containerRef={containerRef}
          mode="benchmark"
          visible
          onZoomIn={() => undefined}
          onZoomOut={() => undefined}
          onResetZoom={() => undefined}
          continuousInputStrategy={strategy}
        />
      </div>
    </Profiler>
  );
};
