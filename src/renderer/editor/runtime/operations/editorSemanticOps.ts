import type { EditorElementTypeV1, EditorOpV1 } from '@src/types/editor';
import { TREE_EDITED_KINDS } from '@src/types/elementKinds';
import type { FramePatch } from '@src/types/generated/elementDocument';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { treeRoutedOps } from './treeRoutedOps';
import { sceneOfElement, sendTreeEdit } from './treeEditCommit';
import { withResizeValues } from '@src/renderer/elementKinds/runtime/resizeValues';
import { legacyFieldPatch } from '@src/renderer/elementKinds/runtime/legacyFieldPatch';
import { fieldPatchOps } from '@src/renderer/elementKinds/runtime/fieldView';
import { legacyPositionOf } from '@src/renderer/elementKinds/runtime/legacyPosition';
import { treeEditorDocument } from '@src/renderer/elementKinds/runtime/treeEditorDocument';
import type { ElementDocumentStore } from '@src/renderer/editor/document/elementDocumentStore';
import type { Op } from '@src/types/generated/elementDocument';
import type { CanonicalEditorDocumentV1 } from '@src/types/editor';
import { reportElementOpSkipped } from '../intent/elementIntent';
import { trackEditorWrite } from '../lifecycle/editorWriteBarrier';
import type { EditorOpResultV1 } from '@src/types/editor';

export interface EditorSemanticCommitOutcome {
  document: CanonicalEditorDocumentV1;
  opResults: EditorOpResultV1[];
}

export interface EditorSemanticCommitMeta {
  gestureId?: string;
  onEnrolled?: () => void;
  preflight?: () => void;
}

export type EditorSemanticOpsGenerator = (
  base: CanonicalEditorDocumentV1,
) => readonly EditorOpV1[] | null;

// 지금 옛 칸 보기 - 트리 값(트리 낙관 적용 포함, 미리보기 제외)
const viewPositionOf = (
  _type: EditorElementTypeV1,
  id: string,
  scene: string,
  store: ElementDocumentStore,
) =>
  legacyPositionOf(store.getElement(scene, id)!) as Record<string, unknown> & {
    id: string;
  };

// 트리로 보낼 겉모습 칸 패치 - 옛 패널과 같은 칸 규칙으로 바뀌는 옛 칸을 구하고, 모두 트리에 자리가 있을 때만
const treeStylePatchOf = (
  op: EditorOpV1,
  scene: string,
  store: ElementDocumentStore,
): { fields: Record<string, unknown>; ops: Op[] } | null => {
  if (op.kind !== 'patchElement' || !TREE_EDITED_KINDS.has(op.elementType)) {
    return null;
  }
  const element = store.getElement(scene, op.id);
  if (!element) return null;
  const fields = legacyFieldPatch(
    op.elementType,
    viewPositionOf(op.elementType, op.id, scene, store),
    op.patch,
  );
  const { ops, unowned } = fieldPatchOps(scene, element, fields);
  return unowned.length === 0 && ops.length > 0 ? { fields, ops } : null;
};

// 트리로 갈 몫 - 트리에 있는 옛 종류 요소의 연산
const routeForTree = (
  ops: readonly EditorOpV1[],
  store: ElementDocumentStore,
) =>
  treeRoutedOps(ops, {
    isTreeEdited: (type) => TREE_EDITED_KINDS.has(type),
    sceneOf: (id) => sceneOfElement(store, id),
    styleOps: (op, scene) => treeStylePatchOf(op, scene, store)?.ops ?? null,
  });

/** 트리로 옮긴 종류 요소 하나의 옛 칸 패치를 트리로 - 지금 장면 트리에 있고 칸이 모두 트리에 자리가 있을 때만.
 * 아니면 null (호출자가 옛 경로로). current는 대기 편집까지 얹은 지금 값 */
export const commitTreeLegacyFields = (
  type: EditorElementTypeV1,
  scene: string,
  id: string,
  makeFields: (
    current: Record<string, unknown>,
  ) => Record<string, unknown> | null,
  gestureId?: string,
): Promise<'committed' | 'skipped'> | null => {
  if (!TREE_EDITED_KINDS.has(type)) return null;
  const store = getElementDocumentStore();
  if (!store?.edit) return null;
  const element = store.getElement(scene, id);
  if (!element) return null;
  const fields = makeFields(viewPositionOf(type, id, scene, store));
  if (!fields) return Promise.resolve('skipped');
  const { ops, unowned } = fieldPatchOps(scene, element, fields);
  if (unowned.length > 0) return null;
  if (ops.length === 0) return Promise.resolve('committed');
  // 옛 필드 패치처럼 이동값은 그대로 (예: 기본 이미지에 상자를 맞춰도 자세 이동값은 비례하지 않는다)
  return sendTreeEdit(store, ops, gestureId, false).then(
    () => 'committed' as const,
  );
};

/** 트리로 옮긴 종류의 틀(회전 등)을 트리에 바로 쓴다 - 시맨틱 연산이 없는 값(스프라이트 회전)용.
 * 트리로 옮긴 종류가 아니거나 트리에 없으면 null (호출자가 옛 경로로) */
export const sendTreeEditedFrame = (
  type: string,
  id: string,
  frame: FramePatch,
  gestureId?: string,
): Promise<unknown> | null => {
  if (!TREE_EDITED_KINDS.has(type)) return null;
  const store = getElementDocumentStore();
  const scene = store ? sceneOfElement(store, id) : undefined;
  if (!store?.edit || !scene) return null;
  return store.edit(
    withResizeValues([{ op: 'setFrame', scene, id, frame }]),
    gestureId ? { gestureId } : undefined,
  );
};

/** 편집 의도의 바탕 - 트리 문서의 옛 편집 문서 모양 (트리 낙관 반영 포함, 미리보기 없음) */
export const captureEditorDocument = (): CanonicalEditorDocumentV1 => {
  const store = getElementDocumentStore();
  return store
    ? treeEditorDocument(store)
    : treeEditorDocument({ getSceneIds: () => [], getScene: () => undefined });
};

/** 옛 편집 연산을 트리로 - 지금 장면 트리에 있는 옛 종류 요소의 위치·회전·숨김·이름·지우기·겉모습 칸.
 * 트리로 못 보내는 몫(다른 장면·트리에 없는 요소·트리에 자리가 없는 칸)은 적용하지 않고 targetMissing으로 알린다.
 * 트리 스토어가 낙관 반영하고, 반영된 뒤 끝난다. 거부·실패는 오류로 올린다(호출자가 알린다) */
export const commitSemanticOps = (
  ops: readonly EditorOpV1[],
  meta?: EditorSemanticCommitMeta,
): Promise<EditorSemanticCommitOutcome> => {
  const run = async (): Promise<EditorSemanticCommitOutcome> => {
    meta?.preflight?.();
    const store = getElementDocumentStore();
    const { treeOps, legacyIndexes } = store?.edit
      ? routeForTree(ops, store)
      : { treeOps: [], legacyIndexes: new Set(ops.map((_op, index) => index)) };
    if (legacyIndexes.size > 0) {
      reportElementOpSkipped('editor ops outside the element tree');
    }
    meta?.onEnrolled?.();
    if (store && treeOps.length > 0) {
      await sendTreeEdit(store, treeOps, meta?.gestureId);
    }
    return {
      document: captureEditorDocument(),
      opResults: ops.map((_op, index) =>
        legacyIndexes.has(index)
          ? { status: 'targetMissing' as const }
          : { status: 'applied' as const },
      ),
    };
  };
  const committed = run();
  // 기록·종료 경계가 이 쓰기를 기다린다
  trackEditorWrite(committed).catch(() => undefined);
  return committed;
};

/** 지금 바탕으로 연산을 만들어 커밋 - 만들 것이 없으면 null (바탕은 트리 낙관 반영까지 본다) */
export const commitGeneratedSemanticOps = (
  generate: EditorSemanticOpsGenerator,
  meta?: EditorSemanticCommitMeta,
): Promise<EditorSemanticCommitOutcome | null> => {
  try {
    const ops = generate(captureEditorDocument());
    return ops ? commitSemanticOps(ops, meta) : Promise.resolve(null);
  } catch (error) {
    return Promise.reject(error);
  }
};
