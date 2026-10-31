'use no memo';
// 프리뷰 오버레이(모듈 상태)를 previewVersion으로 다시 읽어야 해서 컴파일러 메모 제외
import KnobFaceView, {
  type KnobPosition,
} from '@components/main/Grid/layers/KnobFaceView';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useInPanelSelection } from '@components/main/Grid/document/treeEditedSelection';
import { useTreeElementPosition } from '@src/renderer/elementKinds/runtime/treeElementPosition';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';

// 편집 화면 노브 - 위치·크기는 트리(감싸는 상자), 겉모습 칸은 트리 값과 편집 미리보기에서 그린다
const KnobEditorFace = ({
  element,
}: ElementRenderProps<Record<string, unknown>>) => {
  const mode = useKeyStore((state) => state.selectedKeyType);
  // 일괄 미리보기(그라데이션·상태)는 패널이 편집하는 선택에 든 요소만
  const inPanelSelection = useInPanelSelection(mode, element.id);
  const position = useTreeElementPosition(element, mode) as KnobPosition;
  return (
    <KnobFaceView
      position={position}
      elementId={element.id}
      isSelected={inPanelSelection}
    />
  );
};

export default KnobEditorFace;
