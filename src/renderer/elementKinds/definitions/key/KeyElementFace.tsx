import { Key } from '@components/shared/key/LiveKey';
import type { KeyElementPosition } from '@hooks/overlay/useKeyElementStyles';
import { bundleFieldViewOf } from '@src/renderer/elementKinds/runtime/bundleFieldView';
import { renderPreviewFace } from '@src/renderer/elementKinds/runtime/previewFaces';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import type { KeySlot } from '@src/types/key/keys';
import { slotCanonical, slotDisplayName } from '@utils/keySlot';

// 키 그리기 - 오버레이·OBS는 키 신호로 눌림을 그리고(Key), 편집 화면은 편집 미리보기로 그린다(KeyPreview -
// 편집 창만 등록해 오버레이 번들에 편집 코드가 따라오지 않는다).
// 키 이름·입력은 트리 입력 슬롯. 바깥 카운터는 창마다 카운터 층이 트리 틀을 따라 그린다

type KeyFaceProps = ElementRenderProps<Record<string, unknown>>;

const KeyElementFace = (props: KeyFaceProps) => {
  if (!props.live) return renderPreviewFace(props);
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
