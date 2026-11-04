// 옛 종류 요소의 트리 모양 → 옛 위치 객체 - 플러그인 공개 API(키 메뉴 맥락)가 받는 옛 모양 하나만 남긴 변환.
// 화면·패널은 트리 칸 보기(fieldView)를 읽는다. 기능 묶음 칸 이름이 옛 위치 칸 이름과 같아 칸을 펼치기만 하면 된다
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { elementKindDefinition } from './elementKindRegistry';

type LegacyObject = Record<string, unknown>;

interface LegacyInfo {
  index?: number;
  zIndex?: number | null;
  fields?: LegacyObject;
}

// 같은 요소면 같은 객체 - 읽는 쪽 effect·메모가 참조로 비교한다 (트리 스토어는 바뀐 요소만 새 객체)
const positionCache = new WeakMap<ElementNode, LegacyObject>();

/** 트리 요소 → 옛 위치 객체 (칸 이름은 옛 위치와 같다) */
export const legacyPositionOf = (element: ElementNode): LegacyObject => {
  const cached = positionCache.get(element);
  if (cached) return cached;
  const position = buildLegacyPosition(element);
  positionCache.set(element, position);
  return position;
};

const buildLegacyPosition = (element: ElementNode): LegacyObject => {
  const info = (element.legacy ?? {}) as LegacyInfo;
  // 정의에 있는 묶음만 - 백엔드 옛 모양 보기와 같게 (정의 밖 묶음은 보존만 된다)
  const owned = elementKindDefinition(element.kind)?.bundles ?? [];
  const bundles = owned.reduce<LegacyObject>((all, name) => {
    const bundle = element.bundles?.[name];
    return bundle && typeof bundle === 'object' && !Array.isArray(bundle)
      ? { ...all, ...(bundle as LegacyObject) }
      : all;
  }, {});
  const input = element.input;
  return {
    ...(info.fields ?? {}),
    ...(element.values ?? {}),
    ...bundles,
    id: element.id,
    dx: element.frame.x,
    dy: element.frame.y,
    width: element.frame.width,
    height: element.frame.height,
    rotation: element.frame.rotation,
    hidden: element.hidden === true,
    ...(element.name != null ? { layerName: element.name } : {}),
    ...(element.className != null ? { className: element.className } : {}),
    ...(element.useInlineStyles != null
      ? { useInlineStyles: element.useInlineStyles }
      : {}),
    ...(info.zIndex != null ? { zIndex: info.zIndex } : {}),
    ...(input?.type === 'axis' ? { axisId: input.axisId } : {}),
  };
};
