import { renderPreviewFace } from '@src/renderer/elementKinds/runtime/previewFaces';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import SpriteLive from './SpriteLive';
import { spriteViewOf } from './spriteView';

// 스프라이트 그리기 - 오버레이·OBS는 키 입력에 따라 자세를 바꾸고(SpriteLive), 편집 화면은 자세 편집 미리보기로
// 그린다(SpritePreviewFace - 편집 창만 등록해 오버레이 번들에 편집 코드가 따라오지 않는다).
// 고유 값이 스프라이트 배치 모양과 같아 트리 값과 상자로 그 모양을 만들어 넘긴다

type SpriteFaceProps = ElementRenderProps<Record<string, unknown>>;

const EMPTY_KEY_MAP: ReadonlyMap<string, string> = new Map();

const SpriteElementFace = (props: SpriteFaceProps) => {
  if (!props.live) return renderPreviewFace(props);
  return (
    <SpriteLive
      position={spriteViewOf(props.element, props.placement)}
      // 트리거(키 요소 id) → 키는 오버레이 맥락
      keyCanonicalMap={props.context?.spriteKeyCanonicalMap ?? EMPTY_KEY_MAP}
    />
  );
};

export default SpriteElementFace;
