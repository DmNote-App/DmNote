'use no memo';
// 프리뷰 오버레이(모듈 상태)를 previewVersion으로 다시 읽어야 해서 컴파일러 메모 제외
import { usePanelSelection } from '@components/main/Grid/document/treeEditedSelection';
import KeyFaceView, {
  type KeyFacePosition,
} from '@components/shared/key/KeyFaceView';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useTreeElementPosition } from '@src/renderer/elementKinds/runtime/treeElementPosition';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import { slotDisplayName } from '@utils/keySlot';

// 편집 화면 키 - 위치·크기·회전은 트리(감싸는 상자), 겉모습 칸은 트리 값과 편집 미리보기에서 그린다.
// 키 이름은 키 매핑(키 위치와 인덱스 결합, 바꾸기는 아직 옛 경로)에서, 매핑에 아직 없으면 트리 입력에서.
// 바깥 카운터는 편집 화면의 카운터 레이어가 트리 틀을 따라 그린다
const KeyEditorFace = ({
  element,
}: ElementRenderProps<Record<string, unknown>>) => {
  const mode = useKeyStore((state) => state.selectedKeyType);
  const positions = useKeyStore((state) => state.canonicalPositions);
  const keyMappings = useKeyStore((state) => state.keyMappings);
  const counterEnabled = useSettingsStore((state) => state.keyCounterEnabled);
  // 일괄 미리보기(그라데이션·상태)는 패널이 편집하는 선택에 든 요소만
  const inPanelSelection = usePanelSelection(mode).some(
    ({ id }) => id === element.id,
  );
  const index = (positions[mode] ?? []).findIndex(
    ({ id }) => id === element.id,
  );
  const position = useTreeElementPosition(
    element,
    mode,
  ) as unknown as KeyFacePosition;
  const { frame } = element;
  return (
    <KeyFaceView
      anchorKind="key"
      elementId={element.id}
      // 축 핸들 원점은 요소의 틀, 클래스는 상태 속성과 같은 노드에 (옛 키와 같다)
      position={{
        ...position,
        dx: frame.x,
        dy: frame.y,
        width: frame.width,
        height: frame.height,
        rotation: frame.rotation,
        className: element.className ?? undefined,
      }}
      keyName={slotDisplayName(
        (index >= 0 ? keyMappings[mode]?.[index] : undefined) ??
          // 트리로 막 붙여넣어 옛 모양 보기에 아직 없는 키 - 트리 입력의 슬롯
          (element.input?.type === 'key' ? (element.input.slot as never) : ''),
      )}
      isSelected={inPanelSelection}
      counterEnabled={counterEnabled}
      counterPreviewValue={0}
      placement={{ dx: 0, dy: 0, zIndex: 0 }}
    />
  );
};

export default KeyEditorFace;
