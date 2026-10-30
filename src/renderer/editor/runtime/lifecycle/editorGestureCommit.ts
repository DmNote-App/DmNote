import { editorApi } from '@api/modules/editor/editorApi';
import { captureEditorDocument } from '../operations/editorSemanticOps';
import { enqueueEditorCompatibilityOperation } from './editorCompatibilityQueue';
import { EDITOR_OPS_VERSION } from '@src/types/editor';
import type {
  CanonicalEditorDocumentV1,
  EditorCommitResult,
  EditorGestureCommitContext,
  EditorOpV1,
  EditorPatchV1,
} from '@src/types/editor';

export type EditorPatchGenerator = (
  base: CanonicalEditorDocumentV1,
) => EditorPatchV1 | null;

export interface EditorGestureOpsMutation {
  opsVersion: typeof EDITOR_OPS_VERSION;
  ops: readonly EditorOpV1[];
}

export type EditorGestureMutationGenerator = (
  base: CanonicalEditorDocumentV1,
) => EditorPatchV1 | EditorGestureOpsMutation | null;

export type EditorGestureMutation =
  | EditorPatchV1
  | EditorGestureMutationGenerator
  | EditorGestureOpsMutation
  | undefined;

const isOpsMutation = (
  mutation: EditorGestureMutation | null,
): mutation is EditorGestureOpsMutation =>
  typeof mutation === 'object' && mutation !== null && 'opsVersion' in mutation;

// revision이 겹치면(다른 쓰기가 먼저 들어옴) 지금 revision으로 다시 만든다
const MAX_COMMIT_ATTEMPTS = 3;

const isRevisionConflict = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { errorCode?: unknown }).errorCode === 'REVISION_CONFLICT';

/** 플러그인 동작 거래(편집 몫 + 플러그인 몫 한 기록)의 편집 몫 - 바탕(트리 문서)에서 만들고
 * 지금 revision과 함께 커밋 함수에 넘긴다. 다른 쓰기와 같은 호환 큐에서 차례로 */
export const commitEditorGesture = (
  changes: EditorGestureMutation,
  commit: (context: EditorGestureCommitContext) => Promise<EditorCommitResult>,
  meta?: { onEnrolled?: () => void; prepare?: () => Promise<void> },
): Promise<void> =>
  enqueueEditorCompatibilityOperation(async () => {
    await meta?.prepare?.();
    for (let attempt = 1; ; attempt += 1) {
      const { revision } = await editorApi.get();
      const mutation =
        typeof changes === 'function'
          ? changes(captureEditorDocument())
          : changes ?? null;
      const base = {
        editorBaseRevision: revision,
        mutationId: crypto.randomUUID(),
      };
      const context: EditorGestureCommitContext = isOpsMutation(mutation)
        ? {
            ...base,
            editorOpsVersion: EDITOR_OPS_VERSION,
            editorOps: [...mutation.ops],
          }
        : mutation
        ? { ...base, editorChanges: mutation }
        : base;
      meta?.onEnrolled?.();
      try {
        await commit(context);
        return;
      } catch (error) {
        if (attempt < MAX_COMMIT_ATTEMPTS && isRevisionConflict(error)) {
          continue;
        }
        throw error;
      }
    }
  });
