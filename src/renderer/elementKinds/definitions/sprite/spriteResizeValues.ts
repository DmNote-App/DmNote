import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { JsonValue } from '@src/types/generated/elementDocument';
import type { SpriteTransform } from '@src/types/key/sprites';
import { projectSpriteResize } from '@utils/sprite/resizeProjection';

/** 크기를 바꾸면 기본·자세 이동값을 같은 비율로 (옛 resizeSprite와 같은 계산 - projectSpriteResize 하나) */
export const spriteResizeValues = (
  element: ElementNode,
  bounds: { x: number; y: number; width: number; height: number },
): Record<string, JsonValue> | null => {
  // 이동값과 기준 크기는 트리 요소 하나에서 (낙관 적용 포함 - 자세·기준점·이미지 편집이 확인 전에도 반영)
  const values = (element.values ?? {}) as {
    idleTransform?: SpriteTransform;
    poses?: Array<{ transform: SpriteTransform }>;
  };
  // 이동만이면 이동값은 그대로다
  if (
    !values.idleTransform ||
    (bounds.width === element.frame.width &&
      bounds.height === element.frame.height)
  ) {
    return null;
  }
  const basis = {
    dx: element.frame.x,
    dy: element.frame.y,
    width: element.frame.width,
    height: element.frame.height,
  };
  const position = {
    dx: basis.dx,
    dy: basis.dy,
    width: basis.width,
    height: basis.height,
    idleTransform: values.idleTransform,
    poses: values.poses ?? [],
  };
  const next = projectSpriteResize(position, {
    dx: bounds.x,
    dy: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
  return {
    idleTransform: next.idleTransform as unknown as JsonValue,
    poses: next.poses as unknown as JsonValue,
  };
};
