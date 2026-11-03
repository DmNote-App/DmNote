// 트리 쓰기 실패 가르기 - 오류 코드별 재시도 정책은 옛 편집 커밋과 같은 표(EDITOR_COMMIT_ERROR_RETRY_POLICY)를 쓴다
import {
  isEditorCapacityFailure,
  isEditorCommitError,
  isRetryableEditorCommitError,
} from '@src/types/editor';
import type { CommitFailure } from './elementDocumentStore';

/** 다시 보내면 될 수 있는 실패 - 되돌리기 중, 재시도 정책이 영구가 아닌 옛 편집 오류.
 * 커맨드가 던진 오류(문서 투영·기록 합치기 실패 등)와 이름표 없는 오류 코드는 다시 보내도 같아 영구 */
export const isTransientTreeWriteFailure = (
  failure: CommitFailure,
): boolean => {
  if ('error' in failure) return false;
  const { code, editorError } = failure.result;
  if (code === 'HISTORY_IN_PROGRESS') return true;
  return (
    isEditorCommitError(editorError) &&
    isRetryableEditorCommitError(editorError)
  );
};

/** 저장 한도를 넘어 거절된 실패 */
export const isCapacityTreeWriteFailure = (failure: CommitFailure): boolean =>
  'result' in failure && isEditorCapacityFailure(failure.result.editorError);

/** 새 버전 앱이 쓴 요소 종류라 거절된 실패 - 트리 규칙 위반과 옛 편집 검증 실패 두 길 (설계 3.5 잠금) */
export const isKindLockedTreeWriteFailure = (
  failure: CommitFailure,
): boolean => {
  if (!('result' in failure)) return false;
  const { violations, editorError } = failure.result;
  return (
    violations.some(({ code }) => code === 'KIND_VERSION_LOCKED') ||
    (isEditorCommitError(editorError) &&
      editorError.errorCode === 'VALIDATION_FAILED' &&
      editorError.details?.validationCode === 'KIND_VERSION_LOCKED')
  );
};

/** 다른 쓰기와 겹친 실패 (백엔드가 다시 계획해도 겹침) - 편집 충돌 안내 */
export const isConflictTreeWriteFailure = (
  failure: CommitFailure | null,
): boolean =>
  !!failure &&
  'result' in failure &&
  isEditorCommitError(failure.result.editorError) &&
  (failure.result.editorError.errorCode === 'REVISION_CONFLICT' ||
    failure.result.editorError.errorCode === 'PLUGIN_REVISION_CONFLICT');
