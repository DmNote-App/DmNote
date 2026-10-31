'use no memo';
// 프리뷰 오버레이(모듈 상태)를 previewVersion으로 다시 읽어야 해서 컴파일러 메모 제외
import { useInPanelSelection } from '@components/main/Grid/document/treeEditedSelection';
import KeyFaceView, {
  type KeyFacePosition,
} from '@components/shared/key/KeyFaceView';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useTreeElementPosition } from '@src/renderer/elementKinds/runtime/treeElementPosition';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import { getLooseStatTypeLabel } from '@utils/grid/statTypeLabel';

// 편집 화면 스탯 - 위치·크기·회전·클래스는 트리(감싸는 상자), 겉모습 칸은 트리 값과 편집 미리보기에서 그린다.
// 바깥 카운터는 편집 화면의 카운터 레이어가 트리 틀을 따라 그린다
const StatEditorFace = ({
  element,
}: ElementRenderProps<Record<string, unknown>>) => {
  const mode = useKeyStore((state) => state.selectedKeyType);
  // 일괄 미리보기(그라데이션·상태)는 패널이 편집하는 선택에 든 요소만
  const inPanelSelection = useInPanelSelection(mode, element.id);
  const position = useTreeElementPosition(
    element,
    mode,
  ) as unknown as KeyFacePosition & {
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
