import { isNativeElementId } from '../../model/elementId';
import type { NativeElementType } from '../../model/elementIdMap';
import { type PropertyIntents } from '../intent/elementIntent';
import {
  captureEditorDocument,
  commitGeneratedSemanticOps,
  commitSemanticOps,
} from './editorSemanticOps';
import {
  computeBatchGeometryPlan,
  type BatchGeometryOperation,
} from '../geometry/batchGeometryPlan';
import { EDITOR_ELEMENT_POSITION_FIELDS } from '@src/types/editor';
import type {
  CanonicalEditorDocumentV1,
  EditorBoundsV1,
  EditorOpV1,
} from '@src/types/editor';
import { findInRecord, type LooseRecord } from '../intent/elementDocumentModel';

// 다중 선택 정산: 대상 id들의 현재 canonical 기하(dx·dy)를 의도로 캡처해
// 슬롯 안에서 id 재해석으로 적용한다. 4컬렉션 full-record 캡처는 배타
// mutation(카운터 프리셋 삭제 등)의 IPC 창과 겹치면 직렬화 때문에 그 직후에
// 확정적으로 착지해 무관 필드 재작성을 되돌린다 - 기하만 실어 그 결합을 끊는다
export type GeometryField = 'dx' | 'dy' | 'width' | 'height';
type GeometryPatch = Partial<Record<GeometryField, number>>;

export interface BatchGeometryTarget {
  type: NativeElementType;
  id: string;
}

export interface BatchGeometryDescriptor {
  mode: string;
  targets: readonly BatchGeometryTarget[];
  operation: BatchGeometryOperation;
}

const readBatchGeometryElements = (
  base: CanonicalEditorDocumentV1,
  descriptor: BatchGeometryDescriptor,
) => {
  const seen = new Set<string>();
  const elements: Array<{
    key: string;
    type: NativeElementType;
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  for (const target of descriptor.targets) {
    if (!isNativeElementId(target.id) || seen.has(target.id)) return null;
    seen.add(target.id);
    const record = base[
      EDITOR_ELEMENT_POSITION_FIELDS[target.type]
    ] as unknown as LooseRecord;
    const locator = findInRecord(record, target.id);
    if (!locator || locator.mode !== descriptor.mode) return null;
    const position = record[locator.mode]?.[locator.index];
    if (
      !position ||
      typeof position.dx !== 'number' ||
      typeof position.dy !== 'number' ||
      typeof position.width !== 'number' ||
      typeof position.height !== 'number'
    ) {
      return null;
    }
    elements.push({
      key: target.id,
      type: target.type,
      id: target.id,
      x: position.dx,
      y: position.dy,
      width: position.width,
      height: position.height,
    });
  }
  return elements;
};

// bounds 정산 op - 스프라이트는 bounds와 콘텐츠 스케일을 한 몸으로 갖는
// resizeSprite, 나머지는 setBounds
export const elementBoundsOp = (
  elementType: NativeElementType,
  id: string,
  bounds: EditorBoundsV1,
): EditorOpV1 =>
  elementType === 'sprite'
    ? { kind: 'resizeSprite', id, bounds }
    : { kind: 'setBounds', elementType, id, bounds };

const planBatchGeometry = (
  base: CanonicalEditorDocumentV1,
  descriptor: BatchGeometryDescriptor,
) => {
  const elements = readBatchGeometryElements(base, descriptor);
  if (!elements) return null;
  const plan = computeBatchGeometryPlan(elements, descriptor.operation);
  if (!plan) return null;
  const targetById = new Map(
    elements.map((element) => [element.id, element] as const),
  );
  return {
    ...plan,
    // 스프라이트는 배치에서도 resizeSprite - 치수가 변하는 연산(resize)은
    // 콘텐츠가 함께 스케일되고, 이동 계열은 배율 1이라 setBounds와 동일
    ops: plan.bounds.flatMap(({ key, bounds }) => {
      const target = targetById.get(key);
      return target ? [elementBoundsOp(target.type, target.id, bounds)] : [];
    }),
  };
};

export const commitBatchGeometryByIds = (
  descriptor: BatchGeometryDescriptor,
  options: { gestureId?: string; preflight?: () => void } = {},
): Promise<boolean> => {
  const frozenDescriptor = structuredClone(descriptor);
  const initialPlan = planBatchGeometry(
    captureEditorDocument(),
    frozenDescriptor,
  );
  if (!initialPlan || initialPlan.updates.length === 0) {
    return Promise.resolve(false);
  }
  return commitGeneratedSemanticOps(
    (base) => planBatchGeometry(base, frozenDescriptor)?.ops ?? null,
    {
      ...(options.gestureId ? { gestureId: options.gestureId } : {}),
      ...(options.preflight ? { preflight: options.preflight } : {}),
    },
  ).then((outcome) => {
    if (!outcome) {
      return false;
    }
    return outcome.opResults.every(({ status }) => status !== 'targetMissing');
  });
};

export const commitElementGeometryById = (
  type: NativeElementType,
  id: string,
  patch: GeometryPatch,
  options: { gestureId?: string; preflight?: () => void } = {},
): Promise<boolean> => {
  const entries = Object.entries(patch) as Array<[GeometryField, number]>;
  if (
    !isNativeElementId(id) ||
    entries.length === 0 ||
    entries.some(
      ([field, value]) =>
        !['dx', 'dy', 'width', 'height'].includes(field) ||
        !Number.isFinite(value) ||
        ((field === 'width' || field === 'height') && value <= 0),
    )
  ) {
    return Promise.resolve(false);
  }

  const frozenPatch = Object.fromEntries(entries) as GeometryPatch;
  return commitGeneratedSemanticOps(
    (base) => {
      const record = base[
        EDITOR_ELEMENT_POSITION_FIELDS[type]
      ] as unknown as LooseRecord;
      const locator = findInRecord(record, id);
      if (!locator) return null;
      const position = record[locator.mode]?.[locator.index];
      if (!position) return null;
      const bounds: EditorBoundsV1 = {
        dx: position.dx as number,
        dy: position.dy as number,
        width: position.width as number,
        height: position.height as number,
        ...frozenPatch,
      };
      return [{ kind: 'setBounds', elementType: type, id, bounds }];
    },
    {
      ...(options.gestureId ? { gestureId: options.gestureId } : {}),
      ...(options.preflight ? { preflight: options.preflight } : {}),
    },
  ).then((outcome) => {
    if (!outcome) {
      return false;
    }
    return outcome.opResults[0]?.status !== 'targetMissing';
  });
};

// 리사이즈 완료 전용: 시작 시 동결한 대상 id들에 최종 bounds를 한 커밋으로 (트리가 낙관 반영, 오류는 전파)
export const commitElementBoundsById = (
  intents: PropertyIntents,
  gestureId?: string,
): Promise<boolean> => {
  const ops: EditorOpV1[] = [];
  const boundsKeys = new Set(['dx', 'dy', 'width', 'height']);
  const seenIds = new Set<string>();
  for (const [elementType, byId] of intents) {
    for (const [id, patch] of byId) {
      if (
        !isNativeElementId(id) ||
        seenIds.has(id) ||
        Object.keys(patch).some((key) => !boundsKeys.has(key)) ||
        typeof patch.dx !== 'number' ||
        typeof patch.dy !== 'number' ||
        typeof patch.width !== 'number' ||
        typeof patch.height !== 'number' ||
        !Number.isFinite(patch.dx) ||
        !Number.isFinite(patch.dy) ||
        !Number.isFinite(patch.width) ||
        !Number.isFinite(patch.height) ||
        patch.width <= 0 ||
        patch.height <= 0
      ) {
        return Promise.resolve(false);
      }
      seenIds.add(id);
      ops.push(
        elementBoundsOp(elementType, id, {
          dx: patch.dx,
          dy: patch.dy,
          width: patch.width,
          height: patch.height,
        }),
      );
    }
  }
  if (ops.length === 0) return Promise.resolve(false);

  return commitSemanticOps(ops, {
    ...(gestureId ? { gestureId } : {}),
  }).then(({ opResults }) =>
    opResults.some(({ status }) => status !== 'targetMissing'),
  );
};

export const commitSingleElementBoundsById = (
  type: NativeElementType,
  id: string,
  bounds: EditorBoundsV1,
  gestureId?: string,
): Promise<boolean> => {
  if (
    !isNativeElementId(id) ||
    !Number.isFinite(bounds.dx) ||
    !Number.isFinite(bounds.dy) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return Promise.resolve(false);
  }
  return commitSemanticOps([elementBoundsOp(type, id, bounds)], {
    ...(gestureId ? { gestureId } : {}),
  }).then(({ opResults }) => opResults[0]?.status !== 'targetMissing');
};
