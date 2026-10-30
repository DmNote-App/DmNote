'use no memo';
// 프리뷰 오버레이(모듈 상태)를 previewVersion으로 다시 읽어야 해서 컴파일러 메모 제외
import { useSyncExternalStore } from 'react';

import { usePanelSelection } from '@components/main/Grid/document/treeEditedSelection';
import KeyFaceView, {
  type KeyFacePosition,
} from '@components/shared/key/KeyFaceView';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useStatItemStore } from '@stores/data/useStatItemStore';
import {
  composePreviewPositions,
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { legacyPositionOf } from '@src/renderer/elementKinds/runtime/legacyPosition';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import { getLooseStatTypeLabel } from '@utils/grid/statTypeLabel';

// 편집 화면 스탯 - 위치·크기·회전·클래스는 트리(감싸는 상자), 겉모습 칸은 옛 패널이 낙관 반영하는
// 옛 모양 보기와 그 미리보기에서 그린다 (스타일 칸 쓰기는 아직 옛 경로 - 4단계에서 트리로).
// 바깥 카운터는 편집 화면의 카운터 레이어가 트리 틀을 따라 그린다
const StatEditorFace = ({
  element,
}: ElementRenderProps<Record<string, unknown>>) => {
  useSyncExternalStore(subscribePreviewOverlay, getPreviewOverlayVersion);
  const mode = useKeyStore((state) => state.selectedKeyType);
  // 일괄 미리보기(그라데이션·상태)는 패널이 편집하는 선택에 든 요소만
  const inPanelSelection = usePanelSelection(mode).some(
    ({ id }) => id === element.id,
  );
  const positions = useStatItemStore((state) => state.positions);
  const composed = composePreviewPositions('statPosition', positions)[
    mode
  ]?.find(({ id }) => id === element.id);
  const position = (composed ??
    legacyPositionOf(element)) as KeyFacePosition & {
    statType?: string;
  };
  const { frame } = element;
  return (
    <KeyFaceView
      anchorKind="stat"
      elementId={element.id}
      // 축 핸들 원점은 요소의 틀, 클래스는 상태 속성과 같은 노드에 (옛 스탯과 같다)
      position={{
        ...position,
        dx: frame.x,
        dy: frame.y,
        width: frame.width,
        height: frame.height,
        rotation: frame.rotation,
        className: element.className ?? undefined,
      }}
      keyName={getLooseStatTypeLabel(position.statType)}
      isSelected={inPanelSelection}
      counterEnabled={true}
      counterPreviewValue={0}
      placement={{ dx: 0, dy: 0, zIndex: 0 }}
    />
  );
};

export default StatEditorFace;
