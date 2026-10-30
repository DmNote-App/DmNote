import { useSyncExternalStore } from 'react';

import KnobFaceView, {
  type KnobPosition,
} from '@components/main/Grid/layers/KnobFaceView';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useKnobItemStore } from '@stores/data/useKnobItemStore';
import {
  composePreviewPositions,
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { legacyPositionOf } from '@src/renderer/elementKinds/runtime/legacyPosition';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';

// 편집 화면 노브 - 위치·크기는 트리(감싸는 상자), 겉모습 칸은 옛 패널이 낙관 반영하는
// 옛 모양 보기와 그 미리보기에서 그린다 (스타일 칸 쓰기는 아직 옛 경로 - 4단계에서 트리로)
const KnobEditorFace = ({
  element,
  selected,
}: ElementRenderProps<Record<string, unknown>>) => {
  useSyncExternalStore(subscribePreviewOverlay, getPreviewOverlayVersion);
  const mode = useKeyStore((state) => state.selectedKeyType);
  const positions = useKnobItemStore((state) => state.positions);
  const composed = composePreviewPositions('knobPosition', positions)[
    mode
  ]?.find(({ id }) => id === element.id);
  return (
    <KnobFaceView
      position={(composed ?? legacyPositionOf(element)) as KnobPosition}
      elementId={element.id}
      isSelected={selected === true}
    />
  );
};

export default KnobEditorFace;
