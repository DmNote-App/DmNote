import { forwardRef, useState } from 'react';
import type { GradientSpec } from '@src/types/color';
import { useGradientPreviewSession } from '@stores/grid/useGradientEditStore';
import GraphPanel, {
  type GraphPanelProps,
} from '@components/shared/graph/GraphPanel';
import { resolveImageSource } from '@utils/media/imageSource';

export interface GraphPosition {
  hidden?: boolean;
  rotation?: number;
  dx?: number;
  dy?: number;
  width?: number;
  height?: number;
  className?: string;
  graphType?: string;
  graphColor?: string;
  showAvgLine?: boolean;
  graphAnimationEnabled?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  backgroundGradient?: GradientSpec | null;
  borderGradient?: GradientSpec | null;
  borderWidth?: number;
  borderRadius?: number;
  inactiveImage?: string;
  activeImage?: string;
  idleImageFit?: string;
  imageFit?: string;
  useInlineStyles?: boolean;
  zIndex?: number;
}

// 위치·회전·상호작용은 부르는 쪽이 정한다 (옛 그래프 요소는 자기 상자, 트리 요소는 감싸는 상자)
type GraphFacePlacement = Pick<
  GraphPanelProps,
  | 'dx'
  | 'dy'
  | 'rotation'
  | 'zIndex'
  | 'className'
  | 'withOffsetVars'
  | 'dataEditing'
  | 'onClick'
  | 'onPointerDown'
  | 'onDoubleClick'
  | 'onContextMenu'
  | 'onDragStart'
>;

interface GraphFaceViewProps extends GraphFacePlacement {
  position: GraphPosition;
  elementId: string;
  isSelected: boolean;
}

const PREVIEW_HISTORY_BASE: number[] = [
  8, 10, 11, 13, 12, 14, 15, 16, 14, 13, 12, 14, 15, 14, 14,
];
const PREVIEW_AVG = 12;
const PREVIEW_MAX = 18;

/** 편집 화면 그래프 겉모습 - 옛 그래프 요소와 트리 요소가 같이 쓴다 (그라데이션 편집 미리보기 포함) */
const GraphFaceView = forwardRef<HTMLDivElement, GraphFaceViewProps>(
  function GraphFaceView(
    { position, elementId, isSelected, ...placement },
    ref,
  ) {
    const {
      width = 200,
      height = 100,
      graphType = 'line',
      graphColor = '#86EFAC',
      showAvgLine = true,
      graphAnimationEnabled = true,
      backgroundColor,
      borderColor,
      borderWidth,
      borderRadius,
      inactiveImage,
      activeImage,
      idleImageFit,
      imageFit,
      useInlineStyles = false,
    } = position;

    // 편집 세션 일시 페인트 — 저장·히스토리를 거치지 않는 드래그 프리뷰
    const previewSession = useGradientPreviewSession(
      'graph',
      elementId,
      isSelected,
    );
    const previewBgSpec =
      previewSession?.surface === 'background' ? previewSession.spec : null;
    const previewBorderSpec =
      previewSession?.surface === 'border' ? previewSession.spec : null;
    const [uid] = useState(
      () => `graph-preview-${Math.random().toString(36).slice(2, 11)}`,
    );
    const previewImageSrc =
      resolveImageSource(inactiveImage) ||
      resolveImageSource(activeImage) ||
      null;

    return (
      <GraphPanel
        ref={ref}
        {...placement}
        width={width}
        height={height}
        graphType={graphType as 'line' | 'bar'}
        graphColor={graphColor || '#86EFAC'}
        showAvgLine={showAvgLine}
        animationEnabled={graphAnimationEnabled ?? true}
        backgroundColor={backgroundColor}
        borderColor={borderColor}
        backgroundGradient={previewBgSpec ?? position.backgroundGradient}
        borderGradient={previewBorderSpec ?? position.borderGradient}
        borderWidth={borderWidth}
        borderRadius={borderRadius}
        imageSrc={previewImageSrc}
        imageFit={idleImageFit || imageFit || 'cover'}
        useInlineStyles={useInlineStyles}
        history={[...PREVIEW_HISTORY_BASE]}
        avg={PREVIEW_AVG}
        maxval={PREVIEW_MAX}
        uid={uid}
        interactive={true}
      />
    );
  },
);

export default GraphFaceView;
