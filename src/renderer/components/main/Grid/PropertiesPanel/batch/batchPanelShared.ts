import { paintPropertyFields } from '@src/types/color';
import type { KeyPosition } from '@src/types/key/keys';
import type { ElementIdSelection } from '@hooks/pickers/useBatchElementBinding';
import {
  patchActiveImageByTargets,
  patchActiveTransparentByTargets,
  patchInactiveImageByTargets,
  patchIdleTransparentByTargets,
  patchPaintByTargets,
  patchShadowByTargets,
  patchSoundPathByIds,
  patchStylePropertyByTargets,
} from '@src/renderer/editor/runtime/operations/elementOps';
import { reportElementOpError } from '@src/renderer/editor/runtime/intent/elementIntent';
import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import { isNativeElementId } from '@src/renderer/editor/model/elementId';
import type {
  EditorPaintPropertyPatchV1,
  EditorPreviewStylePropertyPatchV1,
  EditorShadowPropertyPatchV1,
  EditorStylePropertyPreviewPatchV1,
} from '@src/types/editor';
import {
  previewBatchPaint,
  previewBatchStyleProperty,
} from '../selection/previewPatchForwarders';
import { EDITOR_ELEMENT_TYPES } from '@src/types/editor';
import { isSurfaceStyledElementType } from '@src/types/elementKinds';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';

const NATIVE_IMAGE_TYPES = EDITOR_ELEMENT_TYPES.filter(
  isSurfaceStyledElementType,
);

// 고칠 요소 - 옛 종류와 트리에만 있는 종류 (트리에만 있는 종류는 편집 미리보기 영역이 없어 커밋 때 반영한다)
interface StyleTarget {
  elementType: string;
  id: string;
}

// 편집 미리보기를 보낼 대상 - 미리보기 영역이 있는 옛 종류
const previewTargetsOf = <T extends StyleTarget>(targets: readonly T[]) =>
  targets.filter(({ elementType }) =>
    isSurfaceStyledElementType(elementType),
  ) as unknown as Parameters<typeof previewBatchPaint>[0];

export const createStylePropertyHandlers = (
  targets: readonly StyleTarget[],
  selectedKeyType: string,
  options: { settleGesture?: boolean } = { settleGesture: true },
) => {
  const stableTargets =
    targets.length > 0 &&
    targets.every(({ id }) => id.length > 0 && isNativeElementId(id)) &&
    new Set(targets.map(({ id }) => id)).size === targets.length
      ? targets
      : null;
  if (!stableTargets) {
    return {
      previewStyleProperty: undefined,
      commitStyleProperty: undefined,
    };
  }
  return {
    previewStyleProperty: (patch: EditorStylePropertyPreviewPatchV1) =>
      previewBatchStyleProperty(
        previewTargetsOf(stableTargets),
        selectedKeyType,
        patch,
      ),
    commitStyleProperty: (patch: EditorPreviewStylePropertyPatchV1) => {
      const gestureId = options.settleGesture
        ? editGestureController.activeGestureId() ?? undefined
        : undefined;
      const persisted = patchStylePropertyByTargets(stableTargets, patch, {
        gestureId,
      });
      if (options.settleGesture) {
        editGestureController.settleCommit(persisted);
      }
      void persisted.catch(reportElementOpError);
    },
  };
};

// 표면별 허용 타깃 - font는 라벨 렌더러가 있는 키·스탯(active는 키만)
const paintRelevantTargets = <T extends StyleTarget>(
  targets: readonly T[],
  patch: EditorPaintPropertyPatchV1,
): readonly T[] => {
  const { active, surface } = paintPropertyFields(patch.property);
  if (surface === 'font') {
    return targets.filter(({ elementType }) =>
      active
        ? elementType === 'key'
        : elementType === 'key' || elementType === 'stat',
    );
  }
  return active
    ? targets.filter(
        ({ elementType }) => elementType === 'key' || elementType === 'knob',
      )
    : targets;
};

export const createPaintHandlers = (
  targets: readonly StyleTarget[],
  selectedKeyType: string,
) => {
  const stableTargets = (patch: EditorPaintPropertyPatchV1) => {
    const relevant = paintRelevantTargets(targets, patch);
    const stable =
      relevant.length > 0 &&
      relevant.every(({ id }) => id.length > 0 && isNativeElementId(id)) &&
      new Set(relevant.map(({ id }) => id)).size === relevant.length;
    return stable ? relevant : null;
  };
  return {
    previewPaint: (patch: EditorPaintPropertyPatchV1) => {
      const stable = stableTargets(patch);
      if (!stable) return;
      previewBatchPaint(previewTargetsOf(stable), selectedKeyType, patch);
    },
    commitPaint: (patch: EditorPaintPropertyPatchV1) => {
      const stable = stableTargets(patch);
      if (!stable) return;
      const gestureId = editGestureController.activeGestureId() ?? undefined;
      const persisted = patchPaintByTargets(stable, patch, { gestureId });
      editGestureController.settleCommit(persisted);
      void persisted.catch(reportElementOpError);
    },
  };
};

export const createShadowCommitHandler =
  (targets: readonly StyleTarget[]) => (patch: EditorShadowPropertyPatchV1) => {
    // 눌림 그림자는 눌림 그림이 있는 종류(키·노브)만
    const relevant =
      patch.property === 'activeShadow'
        ? targets.filter(
            ({ elementType }) =>
              elementKindDefinition(elementType)?.activeVisual === true,
          )
        : targets;
    const stable =
      relevant.length > 0 &&
      relevant.every(({ id }) => id.length > 0 && isNativeElementId(id)) &&
      new Set(relevant.map(({ id }) => id)).size === relevant.length;
    if (!stable) return;
    const gestureId = editGestureController.activeGestureId() ?? undefined;
    const persisted = patchShadowByTargets(relevant, patch, { gestureId });
    editGestureController.settleCommit(persisted);
    void persisted.catch(reportElementOpError);
  };

export const commitBoundInactiveImage = (
  selection: ElementIdSelection,
  inactiveImage: string,
) => {
  const targets = NATIVE_IMAGE_TYPES.flatMap((elementType) =>
    (selection[elementType] ?? []).map((id) => ({ elementType, id })),
  );
  if (targets.length === 0) return;
  const persisted = patchInactiveImageByTargets(targets, inactiveImage);
  void persisted.catch(reportElementOpError);
};

export const commitBoundActiveImage = (
  selection: ElementIdSelection,
  activeImage: string,
) => {
  const targets = (['key', 'knob'] as const).flatMap((elementType) =>
    (selection[elementType] ?? []).map((id) => ({ elementType, id })),
  );
  if (targets.length === 0) return;
  const persisted = patchActiveImageByTargets(targets, activeImage);
  void persisted.catch(reportElementOpError);
};

export const commitBoundIdleTransparent = (
  selection: ElementIdSelection,
  idleTransparent: boolean,
) => {
  const targets = NATIVE_IMAGE_TYPES.flatMap((elementType) =>
    (selection[elementType] ?? []).map((id) => ({ elementType, id })),
  );
  if (targets.length === 0) return;
  const persisted = patchIdleTransparentByTargets(targets, idleTransparent);
  void persisted.catch(reportElementOpError);
};

export const commitBoundActiveTransparent = (
  selection: ElementIdSelection,
  activeTransparent: boolean,
) => {
  const targets = (['key', 'knob'] as const).flatMap((elementType) =>
    (selection[elementType] ?? []).map((id) => ({ elementType, id })),
  );
  if (targets.length === 0) return;
  const persisted = patchActiveTransparentByTargets(targets, activeTransparent);
  void persisted.catch(reportElementOpError);
};

export const commitBoundSoundPath = (
  selection: ElementIdSelection,
  soundPath: string,
) => {
  const ids = selection.key ?? [];
  if (ids.length === 0) return;
  const persisted = patchSoundPathByIds(ids, soundPath);
  void persisted.catch(reportElementOpError);
};

export type {
  BatchLocalColors,
  BatchPickerTarget,
} from './style/batchPickerTypes';
export type MixedValueResult<T> = { isMixed: boolean; value: T };
export type MixedValueGetter<P> = <T>(
  getter: (position: P) => T | undefined,
  defaultValue: T,
) => MixedValueResult<T>;

export interface KeyData {
  index: number;
  position: KeyPosition | undefined;
  keyCode: string | null;
  keyInfo: { globalKey: string; displayName: string } | null;
}
