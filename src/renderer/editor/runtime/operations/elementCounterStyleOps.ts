import { isNativeElementId } from '../../model/elementId';
import type { NativeElementType } from '../../model/elementIdMap';
import { commitSemanticOps } from './editorSemanticOps';
import type {
  EditorCounterAnimationPresetIntentV1,
  EditorCounterBooleanPropertyPatchV1,
  EditorCounterLayoutPropertyPatchV1,
  EditorCounterTypographyPropertyPatchV1,
  EditorFontFamilyPropertyPatchV1,
  EditorFontStylePropertyPatchV1,
} from '@src/types/editor';
import {
  patchElementPropertyByTargets,
  type PropertyCommitOptions,
} from './elementPropertyCore';

type CounterAnimationTarget = {
  elementType: 'key' | 'stat';
  id: string;
};

const patchCounterBooleanByTargets = (
  targets: readonly CounterAnimationTarget[],
  patch: EditorCounterBooleanPropertyPatchV1,
  options: { preflight?: () => void } = {},
): Promise<boolean> => {
  if (
    targets.length === 0 ||
    targets.some(({ id }) => id.length === 0 || !isNativeElementId(id)) ||
    new Set(targets.map(({ id }) => id)).size !== targets.length
  ) {
    return Promise.resolve(false);
  }
  const ops = targets.map(({ elementType, id }) => ({
    kind: 'patchElement' as const,
    elementType,
    id,
    patch,
  }));
  return commitSemanticOps(ops, {
    preflight: options.preflight,
  }).then((outcome) =>
    outcome.opResults.some((result) => result.status !== 'targetMissing'),
  );
};

export const patchCounterLayoutByTargets = (
  targets: readonly CounterAnimationTarget[],
  patch: EditorCounterLayoutPropertyPatchV1,
  options: { preflight?: () => void } = {},
): Promise<boolean> => {
  if (
    targets.length === 0 ||
    targets.some(({ id }) => id.length === 0 || !isNativeElementId(id)) ||
    new Set(targets.map(({ id }) => id)).size !== targets.length
  ) {
    return Promise.resolve(false);
  }
  const ops = targets.map(({ elementType, id }) => ({
    kind: 'patchElement' as const,
    elementType,
    id,
    patch,
  }));
  return commitSemanticOps(ops, {
    preflight: options.preflight,
  }).then((outcome) =>
    outcome.opResults.some((result) => result.status !== 'targetMissing'),
  );
};

export const patchCounterLayoutById = (
  elementType: 'key' | 'stat',
  id: string,
  patch: EditorCounterLayoutPropertyPatchV1,
  options: { preflight?: () => void } = {},
): Promise<boolean> =>
  patchCounterLayoutByTargets([{ elementType, id }], patch, options);

const isCounterTypographyPatch = (
  patch: EditorCounterTypographyPropertyPatchV1,
): boolean => {
  if (patch.property === 'counterFontSize') {
    return (
      Number.isSafeInteger(patch.value) && patch.value >= 8 && patch.value <= 72
    );
  }
  if (patch.property === 'counterFontWeight') {
    return (
      Number.isSafeInteger(patch.value) &&
      patch.value >= 100 &&
      patch.value <= 900
    );
  }
  if (patch.property === 'counterFontBold') {
    return typeof patch.value === 'boolean';
  }
  if (patch.property === 'counterFontItalic') {
    return typeof patch.value === 'boolean';
  }
  if (patch.property === 'counterFontUnderline') {
    return typeof patch.value === 'boolean';
  }
  if (patch.property === 'counterFontStrikethrough') {
    return typeof patch.value === 'boolean';
  }
  return (
    patch.property === 'counterFontFamily' && typeof patch.value === 'string'
  );
};

export const patchCounterTypographyByTargets = (
  targets: readonly CounterAnimationTarget[],
  patch: EditorCounterTypographyPropertyPatchV1,
  options: PropertyCommitOptions = {},
): Promise<boolean> => {
  if (
    !isCounterTypographyPatch(patch) ||
    targets.length === 0 ||
    targets.some(({ id }) => id.length === 0 || !isNativeElementId(id)) ||
    new Set(targets.map(({ id }) => id)).size !== targets.length
  ) {
    return Promise.resolve(false);
  }
  const ops = targets.map(({ elementType, id }) => ({
    kind: 'patchElement' as const,
    elementType,
    id,
    patch,
  }));
  return commitSemanticOps(ops, {
    ...(options.gestureId ? { gestureId: options.gestureId } : {}),
    preflight: options.preflight,
  }).then((outcome) =>
    outcome.opResults.some((result) => result.status !== 'targetMissing'),
  );
};

export const patchCounterTypographyById = (
  elementType: 'key' | 'stat',
  id: string,
  patch: EditorCounterTypographyPropertyPatchV1,
  options: PropertyCommitOptions = {},
): Promise<boolean> =>
  patchCounterTypographyByTargets([{ elementType, id }], patch, options);

export const patchCounterEnabledByTargets = (
  targets: readonly CounterAnimationTarget[],
  enabled: boolean,
  options: { preflight?: () => void } = {},
): Promise<boolean> =>
  patchCounterBooleanByTargets(
    targets,
    { property: 'counterEnabled', value: enabled },
    options,
  );

export const patchCounterEnabledById = (
  elementType: 'key' | 'stat',
  id: string,
  enabled: boolean,
  options: { preflight?: () => void } = {},
): Promise<boolean> =>
  patchCounterEnabledByTargets([{ elementType, id }], enabled, options);

export const patchCounterAnimationEnabledByTargets = (
  targets: readonly CounterAnimationTarget[],
  enabled: boolean,
  options: { preflight?: () => void } = {},
): Promise<boolean> =>
  patchCounterBooleanByTargets(
    targets,
    { property: 'counterAnimationEnabled', value: enabled },
    options,
  );

export const patchCounterAnimationEnabledById = (
  elementType: 'key' | 'stat',
  id: string,
  enabled: boolean,
  options: { preflight?: () => void } = {},
): Promise<boolean> =>
  patchCounterAnimationEnabledByTargets(
    [{ elementType, id }],
    enabled,
    options,
  );

export const patchCounterAnimationPresetByTargets = (
  targets: readonly CounterAnimationTarget[],
  intent: EditorCounterAnimationPresetIntentV1,
  options: { preflight?: () => void } = {},
): Promise<boolean> => {
  if (
    targets.length === 0 ||
    targets.some(({ id }) => id.length === 0 || !isNativeElementId(id)) ||
    new Set(targets.map(({ id }) => id)).size !== targets.length
  ) {
    return Promise.resolve(false);
  }
  const ops = targets.map(({ elementType, id }) => ({
    kind: 'patchElement' as const,
    elementType,
    id,
    patch: {
      property: 'counterAnimationPreset' as const,
      value: structuredClone(intent),
    },
  }));
  return commitSemanticOps(ops, {
    preflight: options.preflight,
  }).then((outcome) =>
    outcome.opResults.some((result) => result.status !== 'targetMissing'),
  );
};

export const patchCounterAnimationPresetById = (
  elementType: 'key' | 'stat',
  id: string,
  intent: EditorCounterAnimationPresetIntentV1,
  options: { preflight?: () => void } = {},
): Promise<boolean> =>
  patchCounterAnimationPresetByTargets([{ elementType, id }], intent, options);

export const patchUseInlineStylesByTargets = (
  targets: readonly { elementType: NativeElementType; id: string }[],
  useInlineStyles: boolean,
  options: { preflight?: () => void } = {},
): Promise<boolean> =>
  patchElementPropertyByTargets(
    targets,
    { property: 'useInlineStyles', value: useInlineStyles },
    options,
  );

export const patchFontStyleByTargets = (
  targets: readonly { elementType: NativeElementType; id: string }[],
  patch: EditorFontStylePropertyPatchV1,
  options: PropertyCommitOptions = {},
): Promise<boolean> => patchElementPropertyByTargets(targets, patch, options);

export const patchFontFamilyByTargets = (
  targets: readonly { elementType: NativeElementType; id: string }[],
  patch: EditorFontFamilyPropertyPatchV1,
  options: PropertyCommitOptions = {},
): Promise<boolean> => patchElementPropertyByTargets(targets, patch, options);
