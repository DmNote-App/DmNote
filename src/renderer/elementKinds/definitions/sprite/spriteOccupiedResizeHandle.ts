import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { ReactiveSpritePosition } from '@src/types/key/sprites';
import { treeElementPositionOf } from '../../runtime/treeElementPosition';
import { matchSpriteAnchorPreset } from '@utils/sprite/spriteGeometry';

/** 기준점 표식이 프리셋 자리에 앉아 있으면(기본 자세가 제자리) 그 자리 크기 조절 손잡이를 비운다 */
export const spriteOccupiedResizeHandle = (
  element: ElementNode,
  sceneId: string,
) => {
  // 트리 값 + 편집 미리보기
  const sprite = treeElementPositionOf(
    element,
    sceneId,
  ) as unknown as Partial<ReactiveSpritePosition>;
  return sprite.idleTransform &&
    sprite.pivot &&
    Math.abs(sprite.idleTransform.x) < 1e-6 &&
    Math.abs(sprite.idleTransform.y) < 1e-6
    ? matchSpriteAnchorPreset(sprite.pivot)
    : null;
};
