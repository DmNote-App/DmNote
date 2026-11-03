'use no memo';
// 프리뷰 오버레이(모듈 상태)를 버전으로 다시 읽어야 해서 컴파일러 메모 제외
import { useDocumentElement } from '@src/renderer/editor/document/elementDocumentRuntime';
import { useEditorPreviewElement } from '@src/renderer/elementKinds/runtime/editorPreviewElement';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import { useKeyStore } from '@stores/data/useKeyStore';
import { projectSpriteResize } from '@utils/sprite/resizeProjection';
import SpritePreview from './SpritePreview';
import { spriteViewOf } from './spriteView';

// 편집 화면 스프라이트 - 자세 편집 미리보기로 그린다. 편집 창만 읽는다(editorPreviewFaces)

type SpriteFaceProps = ElementRenderProps<Record<string, unknown>>;

// 편집 화면 - 이동값의 기준 크기는 저장된 요소(편집 미리보기 포함). 받은 요소는 끄는 중 미리보기 틀일 수 있다
const SpritePreviewFace = ({ element, selected }: SpriteFaceProps) => {
  const mode = useKeyStore((state) => state.selectedKeyType);
  const stored = useDocumentElement(mode, element.id) ?? element;
  const base = useEditorPreviewElement(stored, mode);
  const { frame } = element;
  return (
    <SpritePreview
      // 그림 배치는 상자 크기 기준 - 끄는 중·반영 전 크기 변경도 이동값을 같은 비율로 (커밋과 같은 projection)
      position={projectSpriteResize(spriteViewOf(base), {
        dx: frame.x,
        dy: frame.y,
        width: frame.width,
        height: frame.height,
      })}
      elementId={element.id}
      isSelected={selected === true}
    />
  );
};

export default SpritePreviewFace;
