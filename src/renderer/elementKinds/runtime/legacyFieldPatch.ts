// 옛 패널 속성 패치 → 바뀐 옛 칸 - 옛 편집 연산 투영(applySemanticElementPatch)을 그대로 써서
// 트리로 옮긴 옛 종류도 옛 패널과 같은 칸 규칙(채색 풀기·이미지 정리 등)으로 고친다
import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  type CanonicalEditorDocumentV1,
  type EditorElementPropertyPatchV1,
  type EditorElementTypeV1,
} from '@src/types/editor';
import { applySemanticElementPatch } from '@src/renderer/editor/runtime/projection/semanticElementPatchProjection';

type LegacyObject = Record<string, unknown> & { id: string };

const MODE = 'patch';

export const legacyFieldPatch = (
  elementType: EditorElementTypeV1,
  position: LegacyObject,
  patch: EditorElementPropertyPatchV1,
): Record<string, unknown> => {
  const field = EDITOR_ELEMENT_POSITION_FIELDS[elementType];
  const document = {
    [field]: { [MODE]: [position] },
  } as unknown as CanonicalEditorDocumentV1;
  applySemanticElementPatch(
    document,
    { kind: 'patchElement', elementType, id: position.id, patch },
    undefined,
    EDITOR_ELEMENT_POSITION_FIELDS,
  );
  const next = (document[field] as unknown as Record<string, LegacyObject[]>)[
    MODE
  ][0];
  const changed: Record<string, unknown> = {};
  for (const name of new Set([
    ...Object.keys(position),
    ...Object.keys(next),
  ])) {
    if (JSON.stringify(position[name]) !== JSON.stringify(next[name])) {
      changed[name] = next[name] ?? null;
    }
  }
  return changed;
};
