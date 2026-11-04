import { isNativeElementId } from '../../model/elementId';
import type { NativeElementType } from '../../model/elementIdMap';
import { type PropertyIntents } from '../intent/elementIntent';
import { commitFrames, sceneOfElement } from './treeEditCommit';
import {
  computeBatchGeometryPlan,
  type BatchGeometryOperation,
} from '../geometry/batchGeometryPlan';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import type { EditorBoundsV1 } from '@src/types/editor';
import type { FramePatch } from '@src/types/generated/elementDocument';

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

/** 비율을 지키는 요소인지 - 종류 선언 (그림 레이어는 늘리지 않는다) */
export const isAspectLockedNode = (element: ElementNode): boolean =>
  elementKindDefinition(element.kind)?.lockAspect?.(
    (element.values ?? {}) as never,
  ) === true;

// 대상들의 지금 틀 (트리 낙관 반영 포함, 미리보기 없음) - 모두 그 탭에 그 종류로 있어야 한다
const readBatchGeometryElements = (descriptor: BatchGeometryDescriptor) => {
  const store = getElementDocumentStore();
  if (!store) return null;
  const seen = new Set<string>();
  const elements: Array<{
    key: string;
    type: NativeElementType;
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    lockAspect: boolean;
  }> = [];
  for (const target of descriptor.targets) {
    if (!isNativeElementId(target.id) || seen.has(target.id)) return null;
    seen.add(target.id);
    const element = store.getElement(descriptor.mode, target.id);
    if (!element || element.kind !== target.type) return null;
    const { x, y, width, height } = element.frame;
    elements.push({
      key: target.id,
      type: target.type,
      id: target.id,
      x,
      y,
      width,
      height,
      lockAspect: isAspectLockedNode(element),
    });
  }
  return elements;
};

/** bounds → 틀 (스프라이트는 크기와 함께 자세 이동값이 비례한다 - 트리 커밋 입구가 붙인다) */
export const boundsFrame = (bounds: EditorBoundsV1): FramePatch => ({
  x: bounds.dx,
  y: bounds.dy,
  width: bounds.width,
  height: bounds.height,
});

const planBatchGeometry = (descriptor: BatchGeometryDescriptor) => {
  const elements = readBatchGeometryElements(descriptor);
  if (!elements) return null;
  const plan = computeBatchGeometryPlan(elements, descriptor.operation);
  if (!plan) return null;
  const targetById = new Map(
    elements.map((element) => [element.id, element] as const),
  );
  return {
    ...plan,
    frames: plan.bounds.flatMap(({ key, bounds }) => {
      const target = targetById.get(key);
      return target
        ? [
            {
              elementType: target.type,
              id: target.id,
              frame: boundsFrame(bounds),
            },
          ]
        : [];
    }),
  };
};

export const commitBatchGeometryByIds = (
  descriptor: BatchGeometryDescriptor,
  options: { gestureId?: string; preflight?: () => void } = {},
): Promise<boolean> => {
  const plan = planBatchGeometry(structuredClone(descriptor));
  if (!plan || plan.updates.length === 0) {
    return Promise.resolve(false);
  }
  return commitFrames(plan.frames, {
    ...(options.gestureId ? { gestureId: options.gestureId } : {}),
    ...(options.preflight ? { preflight: options.preflight } : {}),
  }).then((statuses) => statuses.every((status) => status !== 'targetMissing'));
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

  // 지금 틀(트리 낙관 반영 포함)에 고친 칸을 얹는다
  const store = getElementDocumentStore();
  const scene = store ? sceneOfElement(store, id) : undefined;
  const element = scene ? store!.getElement(scene, id) : undefined;
  if (!element || element.kind !== type) return Promise.resolve(false);
  const { x, y, width, height } = element.frame;
  const bounds: EditorBoundsV1 = {
    dx: x,
    dy: y,
    width,
    height,
    ...Object.fromEntries(entries),
  };
  return commitFrames([{ elementType: type, id, frame: boundsFrame(bounds) }], {
    ...(options.gestureId ? { gestureId: options.gestureId } : {}),
    ...(options.preflight ? { preflight: options.preflight } : {}),
  }).then(([status]) => status !== 'targetMissing');
};

// 리사이즈 완료 전용: 시작 시 동결한 대상 id들에 최종 bounds를 한 커밋으로 (트리가 낙관 반영, 오류는 전파)
export const commitElementBoundsById = (
  intents: PropertyIntents,
  gestureId?: string,
): Promise<boolean> => {
  const frames: Array<{
    elementType: NativeElementType;
    id: string;
    frame: FramePatch;
  }> = [];
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
      frames.push({
        elementType,
        id,
        frame: boundsFrame({
          dx: patch.dx,
          dy: patch.dy,
          width: patch.width,
          height: patch.height,
        }),
      });
    }
  }
  if (frames.length === 0) return Promise.resolve(false);

  return commitFrames(frames, {
    ...(gestureId ? { gestureId } : {}),
  }).then((statuses) => statuses.some((status) => status !== 'targetMissing'));
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
  return commitFrames([{ elementType: type, id, frame: boundsFrame(bounds) }], {
    ...(gestureId ? { gestureId } : {}),
  }).then(([status]) => status !== 'targetMissing');
};
