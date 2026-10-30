import SpriteRotateHandle from '@components/main/Grid/handles/SpriteRotateHandle';
import { useSpriteStore } from '@stores/data/useSpriteStore';
import { composePreviewPositions } from '@src/renderer/editor/runtime/gesture/previewOverlay';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { EditorHandlesProps } from '@src/renderer/elementKinds/defineElementKind';
import { matchSpriteAnchorPreset } from '@utils/sprite/spriteGeometry';

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

/** 기준점 표식이 프리셋 자리에 앉아 있으면(기본 자세가 제자리) 그 자리 크기 조절 손잡이를 비운다 */
export const spriteOccupiedResizeHandle = (
  element: ElementNode,
  sceneId: string,
) => {
  const sprite = composePreviewPositions(
    'spritePosition',
    useSpriteStore.getState().positions,
  )[sceneId]?.find(({ id }) => id === element.id);
  return sprite &&
    Math.abs(sprite.idleTransform.x) < 1e-6 &&
    Math.abs(sprite.idleTransform.y) < 1e-6
    ? matchSpriteAnchorPreset(sprite.pivot)
    : null;
};

export default SpriteEditorHandles;
