import { useInPanelSelection } from '@components/main/Grid/document/treeEditedSelection';
import KeyFaceView, {
  type KeyFacePosition,
} from '@components/shared/key/KeyFaceView';
import { treeKeySlot } from '@src/renderer/editor/runtime/operations/keySlotOps';
import { bundleFieldViewOf } from '@src/renderer/elementKinds/runtime/bundleFieldView';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { slotDisplayName } from '@utils/keySlot';

// 편집 화면 키 - 편집 미리보기(그라데이션 세션·눌림·축 손잡이)를 그린다. 편집 창만 읽는다(editorPreviewFaces)

type KeyFaceProps = ElementRenderProps<Record<string, unknown>>;

const KeyPreview = ({ element }: KeyFaceProps) => {
  const mode = useKeyStore((state) => state.selectedKeyType);
  const counterEnabled = useSettingsStore((state) => state.keyCounterEnabled);
  // 일괄 미리보기(그라데이션·상태)는 패널이 편집하는 선택에 든 요소만
  const inPanelSelection = useInPanelSelection(mode, element.id);
  return (
    <KeyFaceView
      anchorKind="key"
      elementId={element.id}
      // 축 핸들 원점은 요소의 틀, 클래스는 상태 속성과 같은 노드에 (옛 키와 같다)
      position={bundleFieldViewOf(element) as KeyFacePosition}
      keyName={slotDisplayName(treeKeySlot(element) ?? '')}
      isSelected={inPanelSelection}
      counterEnabled={counterEnabled}
      counterPreviewValue={0}
      placement={{ dx: 0, dy: 0, zIndex: 0 }}
    />
  );
};

export default KeyPreview;
