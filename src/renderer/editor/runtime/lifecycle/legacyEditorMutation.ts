import { editGestureController } from '../gesture/editGestureController';
import { enqueueEditorCompatibilityOperation } from './editorCompatibilityQueue';
import { editorApi, editorCommitRaw } from '@api/modules/editor/editorApi';
import type {
  CanonicalEditorDocumentV1,
  EditorCommitResult,
  EditorLegacyPatchV1,
  EditorPatchV1,
} from '@src/types/editor';

// 백엔드가 편집 문서를 직접 바꾸는 legacy 커맨드(리소스 정리 등) - 편집 화면은 트리 변경 이벤트로 따라간다
export const runLegacyEditorMutation = <T>(
  mutation: () => Promise<T>,
): Promise<T> => mutation();

// 백엔드가 편집 문서를 직접 바꾸는 legacy 커맨드(프리셋 로드, 리셋, 커스텀 탭,
// 카운터 애니메이션 사용처 재작성, 사운드 삭제) 전용. 호환 큐를 점유해 먼저 줄 선 쓰기 뒤에 실행한다.
//
// 활성 게스처는 큐에 앉기 전에 정산한다. ID 의도는 요소 소실에는
// 수렴하지만, 요소가 유지된 채 참조 필드만 재작성되는 mutation(카운터
// 프리셋 삭제의 fallback 재작성, 사운드 삭제)에서는 정산이 mutation 뒤로
// 밀리면 삭제된 참조를 되살린다 - 정산을 먼저 끝내 순서를 고정한다
export const runExclusiveLegacyMutation = async <T>(
  mutation: () => Promise<T>,
): Promise<T> => {
  // 정산 대상을 시점 세션으로 한정 - 정산 대기 중 사용자가 시작한 새 게스처
  // B는 실패한 A와 무관한 최신 편집이므로 건드리면 안 된다
  const settlingGestureId = editGestureController.activeGestureId();
  const settled = await editGestureController.commitPendingAsync();
  if (
    !settled &&
    settlingGestureId !== null &&
    editGestureController.activeGestureId() === settlingGestureId
  ) {
    // 정산 실패로 되살아난 그 게스처만 폐기한다. 살려둔 채 진행하면 mutation이
    // 재작성한 참조 위에 옛 patch가 blur·flush 재시도로 재적용되어 삭제된
    // 참조가 부활한다 - 지금의 사용자 의도는 mutation 쪽이다
    editGestureController.cancel();
  }
  return enqueueEditorCompatibilityOperation(mutation);
};

// revision이 겹치면(다른 쓰기가 먼저 들어옴) 지금 revision으로 다시 보낸다
const MAX_COMMIT_ATTEMPTS = 3;

const isRevisionConflict = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { errorCode?: unknown }).errorCode === 'REVISION_CONFLICT';

/** 옛 모양 칸 패치(플러그인 API의 키·위치 쓰기 등)를 백엔드 옛 편집 커밋으로 - 칸을 통째로 바꾸는 패치라
 * 바탕 문서 없이 지금 revision으로 보낸다. 다른 쓰기와 같은 호환 큐에서 차례로 */
export const commitLegacyEditorPatch = (
  changes: EditorPatchV1 | EditorLegacyPatchV1,
  options: { multiKey?: boolean; gestureId?: string } = {},
): Promise<EditorCommitResult> =>
  enqueueEditorCompatibilityOperation(async () => {
    for (let attempt = 1; ; attempt += 1) {
      const { revision } = await editorApi.get();
      try {
        return await editorCommitRaw({
          baseRevision: revision,
          mutationId: crypto.randomUUID(),
          changes: changes as EditorPatchV1,
          multiKey: options.multiKey ?? true,
          ...(options.gestureId ? { gestureId: options.gestureId } : {}),
        });
      } catch (error) {
        if (attempt < MAX_COMMIT_ATTEMPTS && isRevisionConflict(error)) {
          continue;
        }
        throw error;
      }
    }
  });

/** 커밋 뒤 지금 옛 모양 문서 - 플러그인 API가 결과로 돌려준다 */
export const commitLegacyEditorPatchForDocument = async (
  changes: EditorPatchV1 | EditorLegacyPatchV1,
  options: { multiKey?: boolean; gestureId?: string } = {},
): Promise<CanonicalEditorDocumentV1> => {
  await commitLegacyEditorPatch(changes, options);
  return (await editorApi.get()).document;
};

/** 플러그인이 직접 만든 커밋 요청 - 먼저 줄 선 쓰기 뒤에 보낸다 */
export const runSerializedLegacyCommit = <T>(task: () => Promise<T>) =>
  enqueueEditorCompatibilityOperation(task);
