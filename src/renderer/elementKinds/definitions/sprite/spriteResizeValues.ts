import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { JsonValue } from '@src/types/generated/elementDocument';
import type { SpriteTransform } from '@src/types/key/sprites';
import { projectSpriteResize } from '@utils/sprite/resizeProjection';
import { useSpriteStore } from '@stores/data/useSpriteStore';

/** 크기를 바꾸면 기본·자세 이동값을 같은 비율로 (옛 resizeSprite와 같은 계산 - projectSpriteResize 하나) */
export const spriteResizeValues = (
  element: ElementNode,
  bounds: { x: number; y: number; width: number; height: number },
): Record<string, JsonValue> | null => {
  // 이동값은 옛 스토어에서 - 패널의 자세·기준점 편집은 옛 경로로 먼저 반영돼 트리 값보다 새롭다
  const legacy = Object.values(useSpriteStore.getState().positions)
    .flat()
    .find((position) => position.id === element.id);
  const values = (legacy ?? element.values ?? {}) as {
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
  // 이동값과 비율의 기준 크기는 같은 곳에서 - 옛 스토어 값이면 그 크기 기준(패널 크기 변경은 옛 스토어에
  // 이미 비례 반영돼 있어 비율 1), 트리 값이면 트리 틀 기준
  const basis = legacy ?? {
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
