import { useSyncExternalStore } from 'react';

import GraphFaceView, {
  type GraphPosition,
} from '@components/main/Grid/layers/GraphFaceView';
import { useGraphItemStore } from '@stores/data/useGraphItemStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import {
  composePreviewPositions,
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { legacyPositionOf } from '@src/renderer/elementKinds/runtime/legacyPosition';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';

// 편집 화면 그래프 - 위치·크기·회전·클래스는 트리(감싸는 상자), 겉모습 칸은 옛 패널이 낙관 반영하는
// 옛 모양 보기와 그 미리보기에서 그린다 (스타일 칸 쓰기는 아직 옛 경로 - 4단계에서 트리로)
const GraphEditorFace = ({
  element,
  selected,
}: ElementRenderProps<Record<string, unknown>>) => {
  useSyncExternalStore(subscribePreviewOverlay, getPreviewOverlayVersion);
  const mode = useKeyStore((state) => state.selectedKeyType);
  const positions = useGraphItemStore((state) => state.positions);
  const composed = composePreviewPositions('graphPosition', positions)[
    mode
  ]?.find(({ id }) => id === element.id);
  const position = (composed ?? legacyPositionOf(element)) as GraphPosition;
  return (
    <GraphFaceView
      position={{
        ...position,
        width: element.frame.width,
        height: element.frame.height,
      }}
      elementId={element.id}
      isSelected={selected === true}
    />
  );
};

export default GraphEditorFace;
