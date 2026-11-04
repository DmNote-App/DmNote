// 속성 패치 → 트리 연산 - 요소의 지금 칸 보기에 칸 규칙(applyPropertyPatch - Rust 적용기와 같은 기준표로 묶임)을
// 적용해 바뀐 칸만 트리 연산으로 바꾼다. 숨김·이름·회전은 칸 규칙 없이 바로 쓴다
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { applyPropertyPatch } from '@src/renderer/editor/runtime/projection/semanticElementPatchProjection';
import type {
  EditorElementPropertyPatchV1,
  EditorElementTypeV1,
} from '@src/types/editor';
import type { Op } from '@src/types/generated/elementDocument';
import { fieldPatchOps, panelFieldViewOf } from './fieldView';

/** 바뀐 칸 - 값이 다른 칸(없어진 칸은 null) */
export const changedFields = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> => {
  const changed: Record<string, unknown> = {};
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[name]) !== JSON.stringify(after[name])) {
      changed[name] = after[name] ?? null;
    }
  }
  return changed;
};

/** 요소 하나의 속성 패치 → 트리 연산. 바뀌는 칸이 없거나 트리에 자리가 없는 칸이 섞이면 null - 적용하지 않는다 */
export const propertyPatchOps = (
  sceneId: string,
  element: ElementNode,
  patch: EditorElementPropertyPatchV1,
): Op[] | null => {
  const target = { scene: sceneId, id: element.id };
  // 숨김·이름·회전 - 값이 같아도 보낸다
  if (patch.property === 'hidden') {
    return [{ op: 'setCommon', ...target, hidden: patch.value === true }];
  }
  if (patch.property === 'layerName') {
    return [
      {
        op: 'setCommon',
        ...target,
        name:
          typeof patch.value === 'string' && patch.value ? patch.value : null,
      },
    ];
  }
  if (patch.property === 'rotation' && typeof patch.value === 'number') {
    return [{ op: 'setFrame', ...target, frame: { rotation: patch.value } }];
  }
  const view = panelFieldViewOf(element);
  const fields = changedFields(
    view,
    applyPropertyPatch(element.kind as EditorElementTypeV1, view, patch),
  );
  const { ops, unowned } = fieldPatchOps(sceneId, element, fields);
  return unowned.length === 0 && ops.length > 0 ? ops : null;
};
