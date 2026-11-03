import { useInPanelSelection } from '@components/main/Grid/document/treeEditedSelection';
import KeyFaceView, {
  type KeyFacePosition,
} from '@components/shared/key/KeyFaceView';
import { Key } from '@components/shared/key/LiveKey';
import type { KeyElementPosition } from '@hooks/overlay/useKeyElementStyles';
import { treeKeySlot } from '@src/renderer/editor/runtime/operations/keySlotOps';
import { bundleFieldViewOf } from '@src/renderer/elementKinds/runtime/bundleFieldView';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import type { KeySlot } from '@src/types/key/keys';
import { slotCanonical, slotDisplayName } from '@utils/keySlot';

// 키 그리기 - 오버레이·OBS는 키 신호로 눌림을 그리고(Key), 편집 화면은 편집 미리보기로 그린다(KeyFaceView).
// 키 이름·입력은 트리 입력 슬롯. 바깥 카운터는 창마다 카운터 층이 트리 틀을 따라 그린다

type KeyFaceProps = ElementRenderProps<Record<string, unknown>>;

const PreviewKey = ({ element }: KeyFaceProps) => {
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

const KeyElementFace = (props: KeyFaceProps) => {
  if (!props.live) return <PreviewKey {...props} />;
  const { element, placement, context } = props;
  const slot = (
    element.input?.type === 'key' ? element.input.slot : ''
  ) as KeySlot;
  return (
    <Key
      position={bundleFieldViewOf(element, placement) as KeyElementPosition}
      keyName={slotDisplayName(slot)}
      globalKey={slotCanonical(slot)}
      mode={context?.mode}
      counterEnabled={context?.keyCounterEnabled}
    />
  );
};

export default KeyElementFace;
