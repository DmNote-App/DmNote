import { useInPanelSelection } from '@components/main/Grid/document/treeEditedSelection';
import KeyFaceView, {
  type KeyFacePosition,
} from '@components/shared/key/KeyFaceView';
import { bundleFieldViewOf } from '@src/renderer/elementKinds/runtime/bundleFieldView';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import { useKeyStore } from '@stores/data/useKeyStore';
import type { StatItemType } from '@src/types/key/statItems';
import { getLooseStatTypeLabel } from '@utils/grid/statTypeLabel';

// 편집 화면 스탯 - 편집 미리보기(그라데이션 세션·축 손잡이)를 그린다. 편집 창만 읽는다(editorPreviewFaces)

type StatFaceProps = ElementRenderProps<Record<string, unknown>>;
type StatView = KeyFacePosition & {
  statType?: StatItemType | null;
};

const StatPreview = ({ element }: StatFaceProps) => {
  const mode = useKeyStore((state) => state.selectedKeyType);
  // 일괄 미리보기(그라데이션·상태)는 패널이 편집하는 선택에 든 요소만
  const inPanelSelection = useInPanelSelection(mode, element.id);
  const position = bundleFieldViewOf(element) as StatView;
  return (
    <KeyFaceView
      anchorKind="stat"
      elementId={element.id}
      // 축 핸들 원점은 요소의 틀, 클래스는 상태 속성과 같은 노드에 (옛 스탯과 같다)
      position={position}
      keyName={getLooseStatTypeLabel(position.statType)}
      isSelected={inPanelSelection}
      counterEnabled={true}
      counterPreviewValue={0}
      placement={{ dx: 0, dy: 0, zIndex: 0 }}
    />
  );
};

export default StatPreview;
