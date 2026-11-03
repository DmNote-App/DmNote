import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { elementKindDefinition } from './elementKindRegistry';
import type { ElementPlacement } from './renderTypes';

// 틀·공통 정보는 늘 있고 나머지는 종류가 쓰는 칸
export type BundleFieldView = Record<string, unknown> & {
  id: string;
  dx: number;
  dy: number;
  width: number;
  height: number;
  rotation: number;
  hidden: boolean;
};
type FieldView = BundleFieldView;

// 같은 요소·같은 자리면 같은 객체 - 오버레이 잎의 React.memo가 identity로 비교한다
const cache = new WeakMap<ElementNode, { key: string; view: FieldView }>();

/** 기능 묶음을 펼친 칸 모양의 그리기 입력 - 키·스탯처럼 묶음 칸 이름 그대로 읽는 그리기가 받는다.
 * 고유 값·종류가 쓰는 묶음 칸·틀(오버레이는 받은 자리)·공통 정보 (정의 밖 묶음은 보존만 된다) */
export const bundleFieldViewOf = (
  element: ElementNode,
  placement?: ElementPlacement,
): FieldView => {
  const key = placement
    ? `${placement.x},${placement.y},${placement.zIndex}`
    : '';
  const cached = cache.get(element);
  if (cached?.key === key) return cached.view;
  const owned = elementKindDefinition(element.kind)?.bundles ?? [];
  const bundles = owned.reduce<Record<string, unknown>>((all, name) => {
    const bundle = element.bundles?.[name];
    return bundle && typeof bundle === 'object' && !Array.isArray(bundle)
      ? { ...all, ...(bundle as Record<string, unknown>) }
      : all;
  }, {});
  const { x, y, width, height, rotation } = element.frame;
  const view: FieldView = {
    ...(element.values ?? {}),
    ...bundles,
    id: element.id,
    dx: placement?.x ?? x,
    dy: placement?.y ?? y,
    width,
    height,
    rotation,
    hidden: element.hidden === true,
    ...(element.name != null ? { layerName: element.name } : {}),
    ...(element.className != null ? { className: element.className } : {}),
    ...(element.useInlineStyles != null
      ? { useInlineStyles: element.useInlineStyles }
      : {}),
    ...(placement ? { zIndex: placement.zIndex } : {}),
  };
  cache.set(element, { key, view });
  return view;
};
