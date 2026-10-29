// 옛 종류 요소의 트리 모양 ↔ 옛 위치 객체 - 옛 그리기·패널을 트리 요소에 그대로 쓰는 어댑터.
// 기능 묶음 칸 이름이 옛 위치 칸 이름과 같아 칸을 펼치고 모으기만 하면 된다
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import {
  BUILTIN_BUNDLE_FIELDS,
  type JsonValue,
  type Op,
} from '@src/types/generated/elementDocument';
import { elementKindDefinition } from './elementKindRegistry';

type LegacyObject = Record<string, unknown>;

const FRAME_FIELDS = {
  dx: 'x',
  dy: 'y',
  width: 'width',
  height: 'height',
  rotation: 'rotation',
} as const;

interface LegacyInfo {
  index?: number;
  zIndex?: number | null;
  fields?: LegacyObject;
}

/** 트리 요소 → 옛 위치 객체 (칸 이름은 옛 위치와 같다) */
export const legacyPositionOf = (element: ElementNode): LegacyObject => {
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

/** 옛 칸 패치 → 트리 연산 - 위치·공통 정보·고유 값·기능 묶음·입력으로 나눈다 */
export const legacyPatchOps = (
  sceneId: string,
  element: ElementNode,
  patch: LegacyObject,
): Op[] => {
  const definition = elementKindDefinition(element.kind);
  const valueNames = new Set(
    (definition?.fields ?? []).map((field) => field.name),
  );
  const bundleOf = new Map<string, string>();
  for (const bundle of definition?.bundles ?? []) {
    const fields = (BUILTIN_BUNDLE_FIELDS as Record<string, readonly string[]>)[
      bundle
    ];
    for (const field of fields ?? []) bundleOf.set(field, bundle);
  }
  const frame: Record<string, number> = {};
  const common: Record<string, unknown> = {};
  const values: Record<string, JsonValue> = {};
  const bundles = new Map<string, Record<string, JsonValue>>();
  let input: Op | null = null;
  for (const [name, value] of Object.entries(patch)) {
    if (name in FRAME_FIELDS && typeof value === 'number') {
      frame[FRAME_FIELDS[name as keyof typeof FRAME_FIELDS]] = value;
    } else if (name === 'layerName') {
      common.name = value ?? null;
    } else if (
      name === 'hidden' ||
      name === 'className' ||
      name === 'useInlineStyles'
    ) {
      common[name] = value ?? null;
    } else if (name === 'axisId' && element.kind === 'knob') {
      input = {
        op: 'setInput',
        scene: sceneId,
        id: element.id,
        input:
          typeof value === 'string' && value
            ? { type: 'axis', axisId: value }
            : null,
      };
    } else if (valueNames.has(name)) {
      values[name] = (value ?? null) as JsonValue;
    } else if (bundleOf.has(name)) {
      const bundle = bundleOf.get(name)!;
      bundles.set(bundle, {
        ...(bundles.get(bundle) ?? {}),
        [name]: (value ?? null) as JsonValue,
      });
    }
  }
  const ops: Op[] = [];
  const target = { scene: sceneId, id: element.id };
  if (Object.keys(frame).length > 0) {
    ops.push({ op: 'setFrame', ...target, frame });
  }
  if (Object.keys(common).length > 0) {
    ops.push({ op: 'setCommon', ...target, ...common } as Op);
  }
  if (Object.keys(values).length > 0) {
    ops.push({ op: 'setValues', ...target, values });
  }
  for (const [bundle, fields] of bundles) {
    ops.push({ op: 'setBundle', ...target, bundle, fields });
  }
  if (input) ops.push(input);
  return ops;
};
