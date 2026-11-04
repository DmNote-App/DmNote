// 패널이 읽고 쓰는 칸 모양 - 기능 묶음을 펼친 칸 보기에 노브 축을 더하고, 칸 패치를 트리 연산으로 나눈다.
// 기능 묶음 칸 이름이 옛 위치 칸 이름과 같아 칸을 펼치고 모으기만 하면 된다
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import {
  BUILTIN_BUNDLE_FIELDS,
  type JsonValue,
  type Op,
} from '@src/types/generated/elementDocument';
import { bundleFieldViewOf, type BundleFieldView } from './bundleFieldView';
import { elementKindDefinition } from './elementKindRegistry';

export type PanelFieldView = BundleFieldView & { axisId?: string };

const FRAME_FIELDS = {
  dx: 'x',
  dy: 'y',
  width: 'width',
  height: 'height',
  rotation: 'rotation',
} as const;

// 같은 요소면 같은 객체 - 읽는 쪽 메모가 참조로 비교한다
const viewCache = new WeakMap<ElementNode, PanelFieldView>();

/** 패널 칸 보기 - 고유 값·종류가 쓰는 묶음 칸·틀·공통 정보, 축 입력은 axisId로 */
export const panelFieldViewOf = (element: ElementNode): PanelFieldView => {
  const cached = viewCache.get(element);
  if (cached) return cached;
  const view = bundleFieldViewOf(element);
  const input = element.input;
  const next =
    input?.type === 'axis' ? { ...view, axisId: input.axisId } : view;
  viewCache.set(element, next);
  return next;
};

/** 칸 패치 → 트리 연산 - 위치·공통 정보·고유 값·기능 묶음·입력으로 나눈다.
 * 트리에 자리가 없는 칸(겹침 순서·그룹·종류가 쓰지 않는 칸)은 unowned로 돌려준다 */
export const fieldPatchOps = (
  sceneId: string,
  element: ElementNode,
  patch: Record<string, unknown>,
): { ops: Op[]; unowned: string[] } => {
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
  const unowned: string[] = [];
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
    } else {
      unowned.push(name);
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
  return { ops, unowned };
};
