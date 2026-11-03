import { useEffect, useRef, useState } from 'react';

import GraphPanel from '@components/shared/graph/GraphPanel';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import { getStatValueSignal } from '@stores/signals/statsSignals';
import type { GradientSpec } from '@src/types/color';
import type { StatItemType } from '@src/types/key/statItems';
import { resolveImageSource } from '@utils/media/imageSource';

// 그래프 그리기 한 벌 - 편집 화면은 고정 미리보기 기록, 오버레이·OBS는 스탯 신호로 쌓은 기록을 같은 그리기로 그린다

interface GraphValues {
  statType: string;
  graphType: string;
  graphSpeed: number;
  graphColor: string;
  showAvgLine: boolean;
  graphAnimationEnabled: boolean | null;
}

interface SurfaceFields {
  backgroundColor?: string;
  borderColor?: string;
  backgroundGradient?: GradientSpec | null;
  borderGradient?: GradientSpec | null;
  borderWidth?: number;
  borderRadius?: number;
}

interface ImageFields {
  inactiveImage?: string;
  activeImage?: string;
  idleImageFit?: string;
  imageFit?: string;
}

interface GraphHistory {
  history: number[];
  avg: number;
  maxval: number;
}

type GraphFaceProps = ElementRenderProps<GraphValues>;

const GRAPH_UPDATE_MS = 100;
const GRAPH_TICK_MS = 50;

// 편집 화면 미리보기 기록
const PREVIEW: GraphHistory = {
  history: [8, 10, 11, 13, 12, 14, 15, 16, 14, 13, 12, 14, 15, 14, 14],
  avg: 12,
  maxval: 18,
};

const normalizeGraphSpeed = (speed: number | undefined): number => {
  const numeric = Number(speed);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1000;
  return Math.max(500, Math.min(60000, Math.round(numeric)));
};

const createInitialHistory = (speed: number | undefined): number[] =>
  new Array(
    Math.max(1, Math.ceil(normalizeGraphSpeed(speed) / GRAPH_UPDATE_MS)),
  ).fill(0);

// 오버레이·OBS 동작 - 스탯 값을 일정 간격으로 쌓는다 (편집 화면에서는 돌지 않는다)
const useLiveGraphHistory = (
  statType: string,
  graphSpeed: number | undefined,
): GraphHistory => {
  const statSignal = getStatValueSignal(statType as StatItemType);
  const graphSpeedRef = useRef<number>(normalizeGraphSpeed(graphSpeed));
  const historyBufferRef = useRef<number[]>(createInitialHistory(graphSpeed));
  const maxValueRef = useRef<number>(1);
  const valueSumRef = useRef<number>(0);
  const valueCountRef = useRef<number>(0);
  const wasIdleRef = useRef<boolean>(false);

  const [graphState, setGraphState] = useState<GraphHistory>(() => ({
    history: createInitialHistory(graphSpeed),
    avg: 0,
    maxval: 1,
  }));

  useEffect(() => {
    graphSpeedRef.current = normalizeGraphSpeed(graphSpeed);
  }, [graphSpeed]);

  useEffect(() => {
    historyBufferRef.current = createInitialHistory(graphSpeedRef.current);
    maxValueRef.current = 1;
    valueSumRef.current = 0;
    valueCountRef.current = 0;
    setGraphState({
      history: [...historyBufferRef.current],
      avg: 0,
      maxval: 1,
    });
    wasIdleRef.current = false;
  }, [statType]);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentValue = (statSignal.value ?? 0) | 0;
      const history = historyBufferRef.current;

      if (currentValue > maxValueRef.current) {
        maxValueRef.current = currentValue;
      }

      if (currentValue > 0) {
        valueSumRef.current += currentValue;
        valueCountRef.current += 1;
      }
      const avg =
        valueCountRef.current > 0
          ? Math.round(valueSumRef.current / valueCountRef.current)
          : 0;

      history.shift();
      history.push(currentValue);

      const targetSize = Math.max(
        1,
        Math.ceil(graphSpeedRef.current / GRAPH_UPDATE_MS),
      );
      while (history.length > targetSize) history.shift();
      while (history.length < targetSize) history.unshift(0);

      // 유휴(현재 값 0 + 히스토리 전부 0)면 이전 커밋과 동일 상태 — 재커밋 생략
      const isIdle =
        currentValue === 0 && !history.some((value) => value !== 0);
      if (isIdle && wasIdleRef.current) return;
      wasIdleRef.current = isIdle;

      setGraphState({
        history: [...history],
        avg,
        maxval: Math.max(maxValueRef.current, 1),
      });
    }, GRAPH_TICK_MS);

    return () => clearInterval(interval);
  }, [statSignal]);

  return graphState;
};

const GraphDrawing = ({
  element,
  values,
  bundles,
  placement,
  graph,
  uidPrefix,
}: GraphFaceProps & { graph: GraphHistory; uidPrefix: string }) => {
  const surface = (bundles.surface ?? {}) as SurfaceFields;
  const image = (bundles.image ?? {}) as ImageFields;
  const [uid] = useState(
    () => `${uidPrefix}-${Math.random().toString(36).slice(2, 11)}`,
  );
  const imageSrc =
    resolveImageSource(image.inactiveImage) ||
    resolveImageSource(image.activeImage) ||
    null;
  return (
    <GraphPanel
      // 오버레이·OBS는 스스로 자리를 잡는다 (편집 화면은 감싸는 상자가 잡는다)
      {...(placement
        ? {
            dx: placement.x,
            dy: placement.y,
            rotation: element.frame.rotation,
            zIndex: placement.zIndex,
            withOffsetVars: true,
            overlayHitRegion: true,
          }
        : {})}
      width={element.frame.width}
      height={element.frame.height}
      // 클래스는 상태 속성과 같은 노드에 (옛 그래프와 같다)
      className={element.className ?? undefined}
      graphType={(values.graphType ?? 'line') as 'line' | 'bar'}
      graphColor={values.graphColor || '#86EFAC'}
      showAvgLine={values.showAvgLine ?? true}
      animationEnabled={values.graphAnimationEnabled ?? true}
      backgroundColor={surface.backgroundColor}
      borderColor={surface.borderColor}
      backgroundGradient={surface.backgroundGradient}
      borderGradient={surface.borderGradient}
      borderWidth={surface.borderWidth}
      borderRadius={surface.borderRadius}
      imageSrc={imageSrc}
      imageFit={image.idleImageFit || image.imageFit || 'cover'}
      useInlineStyles={element.useInlineStyles ?? false}
      history={graph.history}
      avg={graph.avg}
      maxval={graph.maxval}
      uid={uid}
      interactive={!placement}
    />
  );
};

const LiveGraph = (props: GraphFaceProps) => {
  const graph = useLiveGraphHistory(
    props.values.statType,
    props.values.graphSpeed,
  );
  return <GraphDrawing {...props} graph={graph} uidPrefix="graph-overlay" />;
};

const GraphFace = (props: GraphFaceProps) =>
  props.live ? (
    <LiveGraph {...props} />
  ) : (
    <GraphDrawing {...props} graph={PREVIEW} uidPrefix="graph-preview" />
  );

export default GraphFace;
