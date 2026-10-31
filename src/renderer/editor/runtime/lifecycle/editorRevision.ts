// 옛 모양 쓰기의 바탕 리비전 - 커밋마다 문서 전체를 받아 오지 않게 커밋 결과·커밋 신호로 알게 된 값을 쓴다.
// 낡았으면 백엔드가 리비전 충돌로 지금 값을 알려 준다
import { editorApi } from '@api/modules/editor/editorApi';

let known: number | null = null;

export const noteEditorRevision = (revision: number) => {
  if (known === null || revision > known) known = revision;
};

export const knownEditorRevision = async (): Promise<number> => {
  if (known !== null) return known;
  const { revision } = await editorApi.get();
  noteEditorRevision(revision);
  return known ?? revision;
};

/** 리비전 충돌이면 오류에 실린 지금 리비전으로 바꾸고 true (없으면 다음에 다시 받아 온다) */
export const noteRevisionConflict = (error: unknown): boolean => {
  if (
    typeof error !== 'object' ||
    error === null ||
    (error as { errorCode?: unknown }).errorCode !== 'REVISION_CONFLICT'
  ) {
    return false;
  }
  const current = (error as { details?: { currentRevision?: unknown } }).details
    ?.currentRevision;
  known = typeof current === 'number' ? current : null;
  return true;
};

export const resetKnownEditorRevision = () => {
  known = null;
};
