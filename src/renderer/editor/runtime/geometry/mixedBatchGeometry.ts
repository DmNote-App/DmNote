// 혼합(native+plugin) 배치 기하 진입점: 정렬·분배·간격 결과를 native는
// 틀 트리 커밋, 플러그인은 트리 노드 틀 커밋으로 - 같은 동작 id라
// 한 번에 되돌린다

import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { setPluginElementFrames } from '@plugins/runtime/displayElement/pluginTreeGeometry';
import { isPluginVisibleInMode } from '@utils/layerGroupUtils';
import { resolveResizablePluginElementSize } from '@utils/plugin/layout/pluginElementMeasurement';
import { isNativeElementId } from '../../model/elementId';
import {
  computeBatchGeometryPlan,
  type BatchGeometryLayoutElement,
} from './batchGeometryPlan';
import {
  boundsFrame,
  commitBatchGeometryByIds,
  type BatchGeometryDescriptor,
} from '../operations/elementOps';

import { isEditorElementType } from '@src/types/editor';
import type { FramePatch } from '@src/types/generated/elementDocument';
import type { NativeElementType } from '../../model/elementIdMap';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { commitFrames } from '../operations/treeEditCommit';
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

// native 대상 지금 틀 (트리 낙관 반영 포함) - 지정 모드에서의 소실은 전체 거절
const readNativeLayoutElements = (
  descriptor: BatchGeometryDescriptor,
): BatchGeometryLayoutElement[] | null => {
  const store = getElementDocumentStore();
  const elements: BatchGeometryLayoutElement[] = [];
  for (const target of descriptor.targets) {
    const element = store?.getElement(descriptor.mode, target.id);
    if (!element || element.kind !== target.type) return null;
    const { x, y, width, height } = element.frame;
    elements.push({
      key: nativeLayoutKey(target.type, target.id),
      x,
      y,
      width,
      height,
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
  nativeFrames: Array<{
    elementType: NativeElementType;
    id: string;
    frame: FramePatch;
  }>;
  pluginPositions: Map<string, { x: number; y: number }>;
}

// 혼합 입력 위에서 순수 plan을 계산해 native 틀과 plugin 목표 위치로 분해
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
  const nativeFrames: MixedGeometryPlanned['nativeFrames'] = [];
  const pluginPositions = new Map<string, { x: number; y: number }>();
  for (const { key, bounds } of plan.bounds) {
    const native = targetByKey.get(key);
    if (native) {
      // 이 경로는 치수 불변 연산만 통과하므로 스프라이트 이동값 비례도 배율 1이다
      nativeFrames.push({
        elementType: native.type,
        id: native.id,
        frame: boundsFrame(bounds),
      });
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
    nativeFrames,
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
  const initialNative = readNativeLayoutElements(frozenDescriptor);
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
  const { nativeFrames, pluginPositions } = initialPlanned;
  const writes: Promise<unknown>[] = [];
  if (nativeFrames.length > 0) {
    writes.push(commitFrames(nativeFrames, { gestureId }));
  }
  // 플러그인 위치는 트리 노드 틀로 (트리 스토어가 바로 얹는다 - 런타임은 트리를 따라온다)
  writes.push(
    setPluginElementFrames(
      frozenDescriptor.mode,
      new Map(
        [...pluginPositions].map(([fullId, position]) => [
          fullId,
          {
            ...(position.x !== undefined ? { x: position.x } : {}),
            ...(position.y !== undefined ? { y: position.y } : {}),
          },
        ]),
      ),
      gestureId,
    ),
  );
  return Promise.all(writes).then(() => true);
};
