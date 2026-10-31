// 트리 쓰기 실패 가르기 - 오류 코드별 재시도 정책은 옛 편집 커밋과 같은 표(EDITOR_COMMIT_ERROR_RETRY_POLICY)를 쓴다
import {
  isEditorCapacityFailure,
  isRetryableEditorCommitError,
} from '@src/types/editor';
import type { CommitFailure } from './elementDocumentStore';

/** 다시 보내면 될 수 있는 실패 - 전송 오류, 되돌리기 중, 재시도 정책이 영구가 아닌 옛 편집 오류 */
export const isTransientTreeWriteFailure = (
  failure: CommitFailure,
): boolean => {
  if ('error' in failure) return true;
  const { code, editorError } = failure.result;
  if (code === 'HISTORY_IN_PROGRESS') return true;
  return !!editorError && isRetryableEditorCommitError(editorError);
};

/** 저장 한도를 넘어 거절된 실패 */
export const isCapacityTreeWriteFailure = (failure: CommitFailure): boolean =>
  'result' in failure && isEditorCapacityFailure(failure.result.editorError);
