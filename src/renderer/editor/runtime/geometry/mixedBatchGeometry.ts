// 혼합(native+plugin) 배치 기하 진입점: 정렬·분배·간격 결과를 native는
// setBounds op의 트리 커밋, 플러그인은 트리 노드 틀 커밋으로 - 같은 동작 id라
// 한 번에 되돌린다

import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import {
  applyPluginElementEdit,
  commitPluginFrames,
} from '@plugins/runtime/displayElement/pluginTreeGeometry';
import { isPluginVisibleInMode } from '@utils/layerGroupUtils';
import { resolveResizablePluginElementSize } from '@utils/plugin/layout/pluginElementMeasurement';
import { isNativeElementId } from '../../model/elementId';
import {
  computeBatchGeometryPlan,
  type BatchGeometryLayoutElement,
} from './batchGeometryPlan';
import {
  commitBatchGeometryByIds,
  elementBoundsOp,
  type BatchGeometryDescriptor,
} from '../operations/elementOps';

import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  isEditorElementType,
} from '@src/types/editor';
import type { CanonicalEditorDocumentV1, EditorOpV1 } from '@src/types/editor';
import type { NativeElementType } from '../../model/elementIdMap';
import {
  captureEditorDocument,
  commitSemanticOps,
} from '../operations/editorSemanticOps';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';

const MAX_BATCH_GEOMETRY_TARGETS = 4096;
const PLUGIN_KEY_PREFIX = 'plugin:';

const validStructuralText = (value: string, maxBytes: number): boolean =>
  value.length > 0 && new TextEncoder().encode(value).length <= maxBytes;

const nativeLayoutKey = (type: NativeElementType, id: string): string =>
  `${type}:${id}`;

const pluginLayoutKey = (fullId: string): string =>
  `${PLUGIN_KEY_PREFIX}${fullId}`;

// native 대상은 0개도 허용 (plugin 단독 배치) - 최소 개수는 진입점이
// native+plugin 합산으로 판정한다
const validNativeGeometryTargets = (
  descriptor: BatchGeometryDescriptor,
): boolean =>
  descriptor.targets.length <= MAX_BATCH_GEOMETRY_TARGETS &&
  descriptor.targets.every(
    ({ type, id }) => isEditorElementType(type) && isNativeElementId(id),
  ) &&
  new Set(descriptor.targets.map(({ id }) => id)).size ===
    descriptor.targets.length;

type PositionSlice = Record<
  string,
  ReadonlyArray<Record<string, unknown>> | undefined
>;

// 지금 트리 값 - 시작 계획의 바탕
const readStorePositions = (type: NativeElementType): PositionSlice =>
  readDocumentPositions(captureEditorDocument())(type);

const readDocumentPositions =
  (base: CanonicalEditorDocumentV1) =>
  (type: NativeElementType): PositionSlice =>
    base[EDITOR_ELEMENT_POSITION_FIELDS[type]] as unknown as PositionSlice;

// native 대상 bounds 수집 - 지정 모드에서의 소실·비유한 값은 전체 거절
const readNativeLayoutElements = (
  read: (type: NativeElementType) => PositionSlice,
  descriptor: BatchGeometryDescriptor,
): BatchGeometryLayoutElement[] | null => {
  const elements: BatchGeometryLayoutElement[] = [];
  for (const target of descriptor.targets) {
    const position = (read(target.type)[descriptor.mode] ?? []).find(
      (candidate) => candidate.id === target.id,
    );
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
      key: nativeLayoutKey(target.type, target.id),
      x: position.dx,
      y: position.dy,
      width: position.width,
      height: position.height,
    });
  }
  return elements;
};

// 플러그인 대상 bounds 수집 - 크기는 measuredSize ?? estimatedSize ?? 기본값
// 폴백(캔버스 렌더 크기와 동일). 대상 소실·모드 이탈은 전체 거절 (fail-closed)
const readPluginLayoutElements = (
  projection: readonly PluginDisplayElementInternal[],
  mode: string,
  fullIds: readonly string[],
): BatchGeometryLayoutElement[] | null => {
  const byFullId = new Map(
    projection.map((element) => [element.fullId, element]),
  );
  const elements: BatchGeometryLayoutElement[] = [];
  for (const fullId of fullIds) {
    const element = byFullId.get(fullId);
    if (
      !element ||
      !isPluginVisibleInMode(element, mode) ||
      !Number.isFinite(element.position.x) ||
      !Number.isFinite(element.position.y)
    ) {
      return null;
    }
    const size = resolveResizablePluginElementSize(element);
    elements.push({
      key: pluginLayoutKey(fullId),
      x: element.position.x,
      y: element.position.y,
      width: size.width,
      height: size.height,
    });
  }
  return elements;
};

interface MixedGeometryPlanned {
  updates: Array<{ key: string; patch: Record<string, unknown> }>;
  nativeOps: EditorOpV1[];
  pluginPositions: Map<string, { x: number; y: number }>;
}

// 혼합 입력 위에서 순수 plan을 계산해 native op와 plugin 목표 위치로 분해
const planMixedBatchGeometry = (
  nativeElements: readonly BatchGeometryLayoutElement[],
  pluginElements: readonly BatchGeometryLayoutElement[],
  descriptor: BatchGeometryDescriptor,
): MixedGeometryPlanned | null => {
  const plan = computeBatchGeometryPlan(
    [...nativeElements, ...pluginElements],
    descriptor.operation,
  );
  if (!plan) return null;
  const targetByKey = new Map(
    descriptor.targets.map(
      (target) => [nativeLayoutKey(target.type, target.id), target] as const,
    ),
  );
  const nativeOps: EditorOpV1[] = [];
  const pluginPositions = new Map<string, { x: number; y: number }>();
  for (const { key, bounds } of plan.bounds) {
    const native = targetByKey.get(key);
    if (native) {
      // 스프라이트는 resizeSprite - 이 경로는 치수 불변 연산만 통과하므로
      // 배율 1이지만 정산 경로 전체와 op 종류를 통일한다
      nativeOps.push(elementBoundsOp(native.type, native.id, bounds));
      continue;
    }
    if (key.startsWith(PLUGIN_KEY_PREFIX)) {
      pluginPositions.set(key.slice(PLUGIN_KEY_PREFIX.length), {
        x: bounds.dx,
        y: bounds.dy,
      });
    }
  }
  return {
    updates: plan.updates.map(({ key, patch }) => ({
      key,
      patch: patch as Record<string, unknown>,
    })),
    nativeOps,
    pluginPositions,
  };
};

/**
 * 선택된 native+plugin 요소의 배치 기하 조작 (main 창 전용)
 * plugin 대상이 없으면 기존 native 전용 경로에 위임.
 * resize는 native 전용 - 플러그인 크기는 content-driven이라 fail-closed 거절
 */
export const commitMixedBatchGeometry = (
  descriptor: BatchGeometryDescriptor,
  pluginFullIds: readonly string[],
  options: { gestureId?: string; preflight?: () => void } = {},
): Promise<boolean> => {
  if (pluginFullIds.length === 0) {
    return commitBatchGeometryByIds(descriptor, options);
  }
  if (
    descriptor.operation.kind === 'resize' ||
    !validStructuralText(descriptor.mode, 128) ||
    !validNativeGeometryTargets(descriptor) ||
    // 최소 개수는 native+plugin 합산 - plugin 단독도 2개 이상이면 성립
    descriptor.targets.length + pluginFullIds.length < 2 ||
    pluginFullIds.length > MAX_BATCH_GEOMETRY_TARGETS ||
    pluginFullIds.some((fullId) => fullId.trim().length === 0) ||
    new Set(pluginFullIds).size !== pluginFullIds.length
  ) {
    return Promise.resolve(false);
  }
  const frozenDescriptor = structuredClone(descriptor);
  const fullIds = [...pluginFullIds];

  const pluginElements = usePluginDisplayElementStore.getState().elements;
  const targetedPlugins = fullIds.flatMap((fullId) => {
    const element = pluginElements.find(
      (candidate) => candidate.fullId === fullId,
    );
    return element ? [element] : [];
  });
  // 대상 소실·모드 이탈은 부분 적용 대신 전체 거절 (fail-closed)
  if (
    targetedPlugins.length !== fullIds.length ||
    targetedPlugins.some(
      (element) => !isPluginVisibleInMode(element, frozenDescriptor.mode),
    )
  ) {
    return Promise.resolve(false);
  }

  // 현재 스토어 기준 초기 계획 - eager 반영과 no-op 게이트에 사용
  const initialNative = readNativeLayoutElements(
    readStorePositions,
    frozenDescriptor,
  );
  const initialPlugins = readPluginLayoutElements(
    pluginElements,
    frozenDescriptor.mode,
    fullIds,
  );
  const initialPlanned =
    initialNative && initialPlugins
      ? planMixedBatchGeometry(initialNative, initialPlugins, frozenDescriptor)
      : null;
  if (!initialPlanned || initialPlanned.updates.length === 0) {
    return Promise.resolve(false);
  }

  options.preflight?.();
  const gestureId = options.gestureId ?? crypto.randomUUID();
  const { nativeOps, pluginPositions } = initialPlanned;
  const writes: Promise<unknown>[] = [];
  if (nativeOps.length > 0) {
    writes.push(commitSemanticOps(nativeOps, { gestureId }));
  }
  // 플러그인 위치는 바로 보이게(자동 저장 없이) 고치고 트리 노드 틀로 저장
  applyPluginElementEdit(
    frozenDescriptor.mode,
    new Set(pluginPositions.keys()),
    (ids) => {
      const store = usePluginDisplayElementStore.getState();
      store.setElements(
        store.elements.map((element) => {
          const next = ids.has(element.fullId)
            ? pluginPositions.get(element.fullId)
            : undefined;
          return next
            ? { ...element, position: { ...element.position, ...next } }
            : element;
        }),
      );
    },
  );
  writes.push(
    commitPluginFrames(
      frozenDescriptor.mode,
      pluginPositions.keys(),
      gestureId,
    ),
  );
  return Promise.all(writes).then(() => true);
};
