import { isNativeElementId } from '../../model/elementId';
import type { NativeElementType } from '../../model/elementIdMap';
import { commitSemanticOps } from './editorSemanticOps';
import type {
  EditorCounterFillPropertyPatchV1,
  EditorNotePaintPropertyPatchV1,
  EditorNotePropertyPatchV1,
  EditorPaintPropertyPatchV1,
  EditorPreviewStylePropertyPatchV1,
  EditorShadowPropertyPatchV1,
} from '@src/types/editor';
import {
  isEditorPaintPropertyPatchV1,
  isEditorShadowPropertyPatchV1,
} from '@src/types/editor';
import { paintPropertyFields } from '@src/types/color';
import { isNotePaintPropertyPatchV1 } from '@src/types/key/notePaint';
import { isCounterFillPropertyPatchV1 } from '@src/types/key/counterFill';
import {
  idTargets,
  patchElementPropertyById,
  patchElementPropertyByTargets,
  type PropertyCommitOptions,
} from './elementPropertyCore';

type PaintTarget = { elementType: NativeElementType; id: string };

export const patchPaintByTargets = (
  targets: readonly PaintTarget[],
  patch: EditorPaintPropertyPatchV1,
  options: PropertyCommitOptions = {},
): Promise<boolean> => {
  const { active, surface } = paintPropertyFields(patch.property);
  // 표면별 허용 타깃 - font는 라벨 렌더러가 있는 키·스탯(active는 키만)
  const rejectsTarget = (elementType: NativeElementType): boolean =>
    surface === 'font'
      ? active
        ? elementType !== 'key'
        : elementType !== 'key' && elementType !== 'stat'
      : active && elementType !== 'key' && elementType !== 'knob';
  if (
    !isEditorPaintPropertyPatchV1(patch) ||
    targets.length === 0 ||
    targets.some(
      ({ elementType, id }) =>
        id.length === 0 || !isNativeElementId(id) || rejectsTarget(elementType),
    ) ||
    new Set(targets.map(({ id }) => id)).size !== targets.length
  ) {
    return Promise.resolve(false);
  }
  const ops = targets.map(({ elementType, id }) => ({
    kind: 'patchElement' as const,
    elementType,
    id,
    patch: structuredClone(patch),
  }));
  return commitSemanticOps(ops, {
    ...(options.gestureId ? { gestureId: options.gestureId } : {}),
    preflight: options.preflight,
  }).then((outcome) =>
    outcome.opResults.some((result) => result.status !== 'targetMissing'),
  );
};

export const patchPaintById = (
  elementType: NativeElementType,
  id: string,
  patch: EditorPaintPropertyPatchV1,
  options: PropertyCommitOptions = {},
): Promise<boolean> =>
  patchPaintByTargets([{ elementType, id }], patch, options);

type CounterFillTarget = { elementType: 'key' | 'stat'; id: string };

export const patchCounterFillByTargets = (
  targets: readonly CounterFillTarget[],
  patch: EditorCounterFillPropertyPatchV1,
  options: { preflight?: () => void } = {},
): Promise<boolean> => {
  const active = patch.property === 'counterFillActive';
  if (
    !isCounterFillPropertyPatchV1(patch) ||
    targets.length === 0 ||
    targets.some(
      ({ elementType, id }) =>
        !id ||
        !isNativeElementId(id) ||
        (elementType !== 'key' && elementType !== 'stat') ||
        (active && elementType !== 'key'),
    ) ||
    new Set(targets.map(({ id }) => id)).size !== targets.length
  ) {
    return Promise.resolve(false);
  }
  const ops = targets.map(({ elementType, id }) => ({
    kind: 'patchElement' as const,
    elementType,
    id,
    patch: structuredClone(patch),
  }));
  return commitSemanticOps(ops, {
    preflight: options.preflight,
  }).then((outcome) =>
    outcome.opResults.some((result) => result.status !== 'targetMissing'),
  );
};

export const patchCounterFillById = (
  elementType: 'key' | 'stat',
  id: string,
  patch: EditorCounterFillPropertyPatchV1,
  options: { preflight?: () => void } = {},
) => patchCounterFillByTargets([{ elementType, id }], patch, options);

type ShadowTarget = {
  elementType: NativeElementType;
  id: string;
};

export const patchShadowByTargets = (
  targets: readonly ShadowTarget[],
  patch: EditorShadowPropertyPatchV1,
  options: { gestureId?: string; preflight?: () => void } = {},
): Promise<boolean> => {
  if (
    !isEditorShadowPropertyPatchV1(patch) ||
    targets.length === 0 ||
    targets.some(
      ({ elementType, id }) =>
        id.length === 0 ||
        !isNativeElementId(id) ||
        elementType === 'graph' ||
        (patch.property === 'activeShadow' && elementType === 'stat'),
    ) ||
    new Set(targets.map(({ id }) => id)).size !== targets.length
  ) {
    return Promise.resolve(false);
  }
  const ops = targets.map(({ elementType, id }) => ({
    kind: 'patchElement' as const,
    elementType,
    id,
    patch: structuredClone(patch),
  }));
  return commitSemanticOps(ops, {
    ...(options.gestureId ? { gestureId: options.gestureId } : {}),
    preflight: options.preflight,
  }).then((outcome) =>
    outcome.opResults.some((result) => result.status !== 'targetMissing'),
  );
};

export const patchShadowById = (
  elementType: 'key' | 'stat' | 'knob',
  id: string,
  patch: EditorShadowPropertyPatchV1,
  options: { gestureId?: string; preflight?: () => void } = {},
): Promise<boolean> =>
  patchShadowByTargets([{ elementType, id }], patch, options);

export const patchNotePaintByIds = (
  ids: readonly string[],
  patch: EditorNotePaintPropertyPatchV1,
  options: { gestureId?: string; preflight?: () => void } = {},
): Promise<boolean> => {
  if (
    !isNotePaintPropertyPatchV1(patch) ||
    ids.length === 0 ||
    ids.some((id) => id.length === 0 || !isNativeElementId(id)) ||
    new Set(ids).size !== ids.length
  ) {
    return Promise.resolve(false);
  }
  const ops = ids.map((id) => ({
    kind: 'patchElement' as const,
    elementType: 'key' as const,
    id,
    patch: structuredClone(patch),
  }));
  return commitSemanticOps(ops, {
    ...(options.gestureId ? { gestureId: options.gestureId } : {}),
    preflight: options.preflight,
  }).then((outcome) =>
    outcome.opResults.some((result) => result.status !== 'targetMissing'),
  );
};

export const patchNotePaintById = (
  id: string,
  patch: EditorNotePaintPropertyPatchV1,
  options: { gestureId?: string; preflight?: () => void } = {},
): Promise<boolean> => patchNotePaintByIds([id], patch, options);

// note* 계열 수치 한계 검증, 대상에 key 외 타입이 있으면 즉시 무효
const invalidNoteStylePatch = (
  patch: EditorPreviewStylePropertyPatchV1,
  hasNonKeyTarget: boolean,
): boolean =>
  (patch.property === 'noteGlowSize' &&
    (hasNonKeyTarget ||
      !Number.isFinite(patch.value) ||
      patch.value < 0 ||
      patch.value > 50)) ||
  (patch.property === 'noteOffsetX' &&
    (hasNonKeyTarget ||
      (patch.value !== null &&
        (!Number.isFinite(patch.value) ||
          patch.value < -500 ||
          patch.value > 500)))) ||
  (patch.property === 'noteOffsetY' &&
    (hasNonKeyTarget ||
      (patch.value !== null &&
        (!Number.isFinite(patch.value) ||
          patch.value < -500 ||
          patch.value > 500)))) ||
  (patch.property === 'noteWidth' &&
    (hasNonKeyTarget ||
      (patch.value !== null &&
        (!Number.isFinite(patch.value) || patch.value <= 0)))) ||
  (patch.property === 'noteBorderWidth' &&
    (hasNonKeyTarget ||
      !Number.isFinite(patch.value) ||
      patch.value < 0 ||
      patch.value > 20)) ||
  (patch.property === 'noteBorderRadius' &&
    (hasNonKeyTarget ||
      !Number.isFinite(patch.value) ||
      patch.value < 0 ||
      patch.value > 100));

export const patchStylePropertyById = (
  type: NativeElementType,
  id: string,
  patch: EditorPreviewStylePropertyPatchV1,
  options: { gestureId?: string; preflight?: () => void } = {},
): Promise<boolean> =>
  invalidNoteStylePatch(patch, type !== 'key')
    ? Promise.resolve(false)
    : patchElementPropertyById(type, id, patch, options);

export const patchStylePropertyByTargets = (
  targets: readonly { elementType: NativeElementType; id: string }[],
  patch: EditorPreviewStylePropertyPatchV1,
  options: { gestureId?: string; preflight?: () => void } = {},
): Promise<boolean> =>
  invalidNoteStylePatch(
    patch,
    targets.some((target) => target.elementType !== 'key'),
  )
    ? Promise.resolve(false)
    : patchElementPropertyByTargets(targets, patch, options);

export const patchNotePropertiesByIds = (
  ids: readonly string[],
  patch: EditorNotePropertyPatchV1,
  options: { preflight?: () => void } = {},
): Promise<boolean> =>
  patchElementPropertyByTargets(idTargets('key', ids), patch, options);
