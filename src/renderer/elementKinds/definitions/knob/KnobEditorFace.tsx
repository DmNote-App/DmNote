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

// 편집 화면 노브 - 트리 요소를 옛 겉모습으로 그린다.
// 패널 입력 중 값은 옛 미리보기(편집 제스처)를 그대로 쓴다 - 옛 모양 보기 위에서 바뀐 칸만 얹는다
const KnobEditorFace = ({
  element,
  selected,
}: ElementRenderProps<Record<string, unknown>>) => {
  useSyncExternalStore(subscribePreviewOverlay, getPreviewOverlayVersion);
  const mode = useKeyStore((state) => state.selectedKeyType);
  const positions = useKnobItemStore((state) => state.positions);
  const base = positions[mode]?.find(({ id }) => id === element.id);
  const composed = composePreviewPositions('knobPosition', positions)[
    mode
  ]?.find(({ id }) => id === element.id);
  const preview: Record<string, unknown> = {};
  if (base && composed && composed !== base) {
    for (const [name, value] of Object.entries(composed)) {
      if (value !== (base as Record<string, unknown>)[name]) {
        preview[name] = value;
      }
    }
  }
  const position = { ...legacyPositionOf(element), ...preview };
  return (
    <KnobFaceView
      position={position as KnobPosition}
      elementId={element.id}
      isSelected={selected === true}
    />
  );
};

export default KnobEditorFace;
