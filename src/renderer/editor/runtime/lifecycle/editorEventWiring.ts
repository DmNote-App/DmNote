import { editorApi } from '@api/modules/editor/editorApi';
import { previewApi } from '@api/modules/editor/previewApi';
import { useCommittedApplyStore } from '@stores/data/useCommittedApplyStore';
import { useHistoryStatusStore } from '@stores/data/useHistoryStatusStore';
import { previewOverlay } from '../gesture/previewOverlay';
import { noteEditorRevision } from './editorRevision';

// 프리뷰 봉투는 편집 UI가 있는 창(main·panel)끼리의 실시간 피드백 전용.
// 오버레이·OBS는 방송 화면이라 스크럽 중 덜덜거림 없이 커밋 시점만 반영한다
const PREVIEW_WINDOW_TYPES = new Set(['main', 'panel']);

let previewSubscribed = false;

// 채널은 unsubscribe API가 없어 창 단위로 한 번만 등록
const ensurePreviewSubscription = () => {
  if (previewSubscribed) return;
  if (!PREVIEW_WINDOW_TYPES.has(window.__dmn_window_type ?? '')) return;
  previewSubscribed = true;
  previewApi
    .subscribe((envelope) => {
      previewOverlay.applyRemoteEnvelope(envelope);
    })
    .catch((error) => {
      previewSubscribed = false;
      console.error('프리뷰 채널 구독 실패', error);
    });
};

/** 편집 창의 공용 이벤트 연결 - 다른 창 미리보기 받기, 커밋 반영 신호(열린 피커 재동기화·되돌리기 때 끌기 취소) */
export const startEditorEventWiring = (): (() => void) => {
  ensurePreviewSubscription();
  // 패치 없는 가벼운 신호 - 커밋마다 컬렉션 전체를 싣는 editor:committed는 플러그인만 듣는다
  const stopCommitted = editorApi.onCommitSignal((signal) => {
    // 같은 커밋에 실린 미리보기 세션 정리 (다른 창 것 포함)
    previewOverlay.endSessions(signal.gestureIds);
    noteEditorRevision(signal.revision);
    useCommittedApplyStore.getState().bump(signal.origin);
  });
  // 되돌리기·다시하기·프리셋 복원 끝 - 트리 전용 기록은 editor:committed가 없어 기록 상태의 epoch로 알린다
  let appliedEpoch = useHistoryStatusStore.getState().historyEpoch;
  const stopHistory = useHistoryStatusStore.subscribe((state) => {
    if (state.busy || state.historyEpoch <= appliedEpoch) return;
    appliedEpoch = state.historyEpoch;
    useCommittedApplyStore.getState().bump('historyUndo');
  });
  return () => {
    stopCommitted();
    stopHistory();
  };
};
