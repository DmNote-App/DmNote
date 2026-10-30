import SpriteRotateHandle from '@components/main/Grid/handles/SpriteRotateHandle';
import type { EditorHandlesProps } from '@src/renderer/elementKinds/defineElementKind';

/** 편집 화면 스프라이트 회전 손잡이 - 옛 스프라이트 회전 경로(옛 패치 + 미리보기)를 그대로 쓴다 */
const SpriteEditorHandles = ({
  sceneId,
  element,
  bounds,
  previewBounds,
  rotation,
  zoom,
  panX,
  panY,
}: EditorHandlesProps) => (
  <SpriteRotateHandle
    elementId={element.id}
    mode={sceneId}
    bounds={previewBounds ?? bounds}
    rotation={rotation}
    zoom={zoom}
    panX={panX}
    panY={panY}
  />
);

export default SpriteEditorHandles;
