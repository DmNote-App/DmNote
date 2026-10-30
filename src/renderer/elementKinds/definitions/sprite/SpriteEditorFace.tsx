'use no memo';
// 프리뷰 오버레이(모듈 상태)를 previewVersion으로 다시 읽어야 해서 컴파일러 메모 제외
import SpriteFaceView from '@components/main/Grid/layers/SpriteFaceView';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useDocumentElement } from '@src/renderer/editor/document/elementDocumentRuntime';
import { useTreeElementPosition } from '@src/renderer/elementKinds/runtime/treeElementPosition';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import type { CanonicalReactiveSpritePosition } from '@src/types/editor';
import { projectSpriteResize } from '@utils/sprite/resizeProjection';

// 편집 화면 스프라이트 - 위치·크기·회전·클래스는 트리(감싸는 상자), 그림·기준점·자세는 트리 값과
// 편집 미리보기에서 그린다. 이동값의 기준 크기는 저장된 요소 - 받은 요소는 끄는 중 미리보기 틀일 수 있다
const SpriteEditorFace = ({
  element,
  selected,
}: ElementRenderProps<Record<string, unknown>>) => {
  const mode = useKeyStore((state) => state.selectedKeyType);
  const stored = useDocumentElement(mode, element.id) ?? element;
  const position = useTreeElementPosition(
    stored,
    mode,
  ) as unknown as CanonicalReactiveSpritePosition;
  const { frame } = element;
  return (
    <SpriteFaceView
      // 그림 배치는 상자 크기 기준 - 끄는 중·반영 전 크기 변경도 이동값을 같은 비율로 (커밋과 같은 projection)
      position={projectSpriteResize(position, {
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

export default SpriteEditorFace;
