import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { ElementPlacement } from '@src/renderer/elementKinds/runtime/renderTypes';
import type { CanonicalReactiveSpritePosition } from '@src/types/editor';

// 같은 요소·같은 자리면 같은 객체 - 오버레이 잎의 React.memo가 identity로 비교한다
const viewCache = new WeakMap<
  ElementNode,
  { key: string; view: CanonicalReactiveSpritePosition }
>();

/** 트리 값 + 상자 → 스프라이트 배치 모양 (오버레이는 받은 자리, 편집 화면은 요소 틀) */
export const spriteViewOf = (
  element: ElementNode,
  placement?: ElementPlacement,
): CanonicalReactiveSpritePosition => {
  const key = placement
    ? `${placement.x},${placement.y},${placement.zIndex}`
    : '';
  const cached = viewCache.get(element);
  if (cached?.key === key) return cached.view;
  const { x, y, width, height, rotation } = element.frame;
  const view = {
    ...(element.values ?? {}),
    id: element.id,
    dx: placement?.x ?? x,
    dy: placement?.y ?? y,
    width,
    height,
    rotation,
    hidden: element.hidden === true,
    ...(element.className != null ? { className: element.className } : {}),
    ...(element.useInlineStyles != null
      ? { useInlineStyles: element.useInlineStyles }
      : {}),
    ...(placement ? { zIndex: placement.zIndex } : {}),
  } as unknown as CanonicalReactiveSpritePosition;
  viewCache.set(element, { key, view });
  return view;
};
