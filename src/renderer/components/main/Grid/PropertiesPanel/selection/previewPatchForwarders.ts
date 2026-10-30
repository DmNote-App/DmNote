/**
 * 태그 patch를 프리뷰 오버레이 위치 조각으로 변환해 전달하는 forwarder
 * 태그 patch를 그대로 스프레드하면 property/value 리터럴 키가 위치 객체를
 * 오염시키므로 프리뷰 진입 전 반드시 projection을 거친다
 */
import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import { useKeyStore } from '@stores/data/useKeyStore';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { currentTreePosition } from '@src/renderer/elementKinds/runtime/treeElementPosition';
import {
  inheritedPaintMaterialization,
  paintPropertyFields,
} from '@src/types/color';
import type {
  EditorElementTypeV1,
  EditorPaintPropertyPatchV1,
  EditorShadowPreviewPatchV1,
  EditorStylePropertyPreviewPatchV1,
} from '@src/types/editor';
import type { KeyPosition } from '@src/types/key/keys';
import {
  PREVIEW_DOMAIN_BY_ELEMENT_TYPE,
  type PreviewDomain,
} from '@src/types/preview';
import { projectElementShadowPatch } from '@src/types/key/shadows';
import {
  DEFAULT_ELEMENT_SHADOW_SPEC,
  DEFAULT_ELEMENT_ACTIVE_SHADOW_SPEC,
} from '@utils/element/elementDefaults';
import type { SurfaceStyledElementType } from '@src/types/elementKinds';

type PreviewTargetType = SurfaceStyledElementType;

interface PreviewTarget {
  elementType: PreviewTargetType;
  id: string;
}

const previewDomainOf = (type: PreviewTargetType): PreviewDomain =>
  PREVIEW_DOMAIN_BY_ELEMENT_TYPE[type];

// nullable leaf의 null은 eager intent 경로와 동일하게 undefined로 투영
export const projectPreviewStylePropertyPatch = (
  patch: EditorStylePropertyPreviewPatchV1,
): Record<string, unknown> => ({
  [patch.property]: patch.value ?? undefined,
});

const isShadowPreviewPatch = (
  patch: EditorStylePropertyPreviewPatchV1,
): patch is EditorShadowPreviewPatchV1 =>
  patch.property === 'shadow' || patch.property === 'activeShadow';

// 요소가 있는 장면 - 패널은 지금 탭만 편집한다
const sceneOf = (id: string): string | null => {
  const scene = useKeyStore.getState().selectedKeyType;
  return getElementDocumentStore()?.getElement(scene, id) ? scene : null;
};

// 지금 값(트리로 보내 확인 전인 낙관 적용 포함, 미리보기 없음) - 이어서 고칠 때 앞 편집을 되돌리지 않게
const currentOf = (sceneId: string, id: string) =>
  currentTreePosition(sceneId, id) as KeyPosition | undefined;

// 그림자는 leaf wire를 대상별 현재 스펙에 얹어 전체 스펙으로 투영한다 - 커밋 경로와 같은 함수.
// 그래프는 그림자가 없고, 통계는 눌림 상태가 없어 activeShadow를 받지 않는다
const previewBatchShadow = (
  targets: readonly PreviewTarget[],
  selectedKeyType: string,
  patch: EditorShadowPreviewPatchV1,
): void => {
  const grouped = new Map<
    PreviewTargetType,
    Array<{ id: string; patch: Record<string, unknown> }>
  >();
  for (const target of targets) {
    if (target.elementType === 'graph') continue;
    if (target.elementType === 'stat' && patch.property === 'activeShadow') {
      continue;
    }
    const current = currentOf(selectedKeyType, target.id);
    if (!current) return;
    const entries = grouped.get(target.elementType) ?? [];
    entries.push({
      id: target.id,
      patch: projectElementShadowPatch({
        position: current,
        elementType: target.elementType,
        patch,
        defaultShadow: DEFAULT_ELEMENT_SHADOW_SPEC,
        defaultActiveShadow: DEFAULT_ELEMENT_ACTIVE_SHADOW_SPEC,
      }),
    });
    grouped.set(target.elementType, entries);
  }
  for (const [type, entries] of grouped) {
    editGestureController.preview(selectedKeyType, entries, {
      domain: previewDomainOf(type),
    });
  }
};

export const previewSingleStyleProperty = (
  type: EditorElementTypeV1,
  id: string,
  patch: EditorStylePropertyPreviewPatchV1,
): void => {
  // 스프라이트는 스타일 프리뷰 대상이 아니다
  if (type === 'sprite') return;
  const scene = sceneOf(id);
  if (!scene) return;
  if (isShadowPreviewPatch(patch)) {
    previewBatchShadow([{ elementType: type, id }], scene, patch);
    return;
  }
  editGestureController.preview(
    scene,
    [
      {
        id,
        patch: projectPreviewStylePropertyPatch(patch),
      },
    ],
    { domain: previewDomainOf(type) },
  );
};

export const previewBatchStyleProperty = (
  targets: readonly PreviewTarget[],
  selectedKeyType: string,
  patch: EditorStylePropertyPreviewPatchV1,
): void => {
  if (isShadowPreviewPatch(patch)) {
    previewBatchShadow(targets, selectedKeyType, patch);
    return;
  }
  const grouped = new Map<
    PreviewTargetType,
    Array<{ id: string; patch: Record<string, unknown> }>
  >();
  for (const target of targets) {
    if (!currentOf(selectedKeyType, target.id)) return;
    const entries = grouped.get(target.elementType) ?? [];
    entries.push({
      id: target.id,
      patch: projectPreviewStylePropertyPatch(patch),
    });
    grouped.set(target.elementType, entries);
  }
  for (const [type, entries] of grouped) {
    editGestureController.preview(selectedKeyType, entries, {
      domain: previewDomainOf(type),
    });
  }
};

// commit의 eager intent(paintPropertyIntents)와 같은 투영 - 물질화 포함
const projectPreviewPaintPatch = (
  current: KeyPosition,
  elementType: PreviewTargetType,
  patch: EditorPaintPropertyPatchV1,
): Record<string, unknown> => {
  const {
    active,
    surface,
    colorField,
    gradientField,
    activeColorField,
    activeGradientField,
  } = paintPropertyFields(patch.property);
  const record = current as unknown as Record<string, unknown>;
  const next: Record<string, unknown> = {
    [colorField]: patch.value.color,
    [gradientField]: patch.value.gradient ?? undefined,
  };
  const materializes =
    surface === 'font'
      ? elementType === 'key'
      : elementType === 'key' || elementType === 'knob';
  if (!active && materializes) {
    const inherited = inheritedPaintMaterialization(
      {
        color:
          typeof record[colorField] === 'string'
            ? (record[colorField] as string)
            : undefined,
        gradient: record[gradientField] as never,
      },
      {
        color:
          typeof record[activeColorField] === 'string'
            ? (record[activeColorField] as string)
            : undefined,
        gradient: record[activeGradientField] as never,
      },
    );
    if (inherited) {
      if (inherited.color != null) {
        next[activeColorField] = inherited.color;
      }
      if (inherited.gradient) {
        next[activeGradientField] = inherited.gradient;
      }
    }
  }
  return next;
};

export const previewBatchPaint = (
  targets: readonly PreviewTarget[],
  selectedKeyType: string,
  patch: EditorPaintPropertyPatchV1,
): void => {
  const grouped = new Map<
    PreviewTargetType,
    Array<{ id: string; patch: Record<string, unknown> }>
  >();
  for (const target of targets) {
    const current = currentOf(selectedKeyType, target.id);
    if (!current) return;
    const entries = grouped.get(target.elementType) ?? [];
    entries.push({
      id: target.id,
      patch: projectPreviewPaintPatch(current, target.elementType, patch),
    });
    grouped.set(target.elementType, entries);
  }
  for (const [type, entries] of grouped) {
    editGestureController.preview(selectedKeyType, entries, {
      domain: previewDomainOf(type),
    });
  }
};

export const previewSinglePaint = (
  type: EditorElementTypeV1,
  id: string,
  patch: EditorPaintPropertyPatchV1,
): void => {
  // 스프라이트는 페인트 프리뷰 대상이 아니다
  if (type === 'sprite') return;
  const scene = sceneOf(id);
  if (!scene) return;
  previewBatchPaint([{ elementType: type, id }], scene, patch);
};

export const previewBatchGraphColor = (
  ids: readonly string[],
  selectedKeyType: string,
  color: string,
): void => {
  const entries: Array<{ id: string; patch: Record<string, unknown> }> = [];
  for (const id of ids) {
    if (!currentOf(selectedKeyType, id)) return;
    entries.push({ id, patch: { graphColor: color } });
  }
  editGestureController.preview(selectedKeyType, entries, {
    domain: 'graphPosition',
  });
};

export const previewSingleGraphColor = (id: string, color: string): void => {
  const scene = sceneOf(id);
  if (!scene) return;
  previewBatchGraphColor([id], scene, color);
};
