import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommittedApplyStore } from '@stores/data/useCommittedApplyStore';
import { useHistoryStatusStore } from '@stores/data/useHistoryStatusStore';

vi.mock('@api/modules/editor/editorApi', () => ({
  editorApi: { onCommitted: () => () => undefined },
}));
vi.mock('@api/modules/editor/previewApi', () => ({
  previewApi: { subscribe: vi.fn().mockResolvedValue(1) },
}));

const { startEditorEventWiring } = await import('./editorEventWiring');

const status = (historyEpoch: number, busy: boolean, statusSeq: number) => ({
  historyRevision: 0,
  historyEpoch,
  statusSeq,
  canUndo: true,
  canRedo: false,
  busy,
});

describe('편집 창 이벤트 연결', () => {
  beforeEach(() => {
    useHistoryStatusStore.setState(status(3, false, 10));
    useCommittedApplyStore.setState({ commitTick: 0, historyTick: 0 });
  });

  it('되돌리기가 끝나면(트리 전용 기록 포함) 끌기 취소 신호를 한 번 보낸다', () => {
    const stop = startEditorEventWiring();
    const { applyStatus } = useHistoryStatusStore.getState();

    applyStatus(status(4, true, 11));
    expect(useCommittedApplyStore.getState().historyTick).toBe(0);

    applyStatus(status(4, false, 12));
    expect(useCommittedApplyStore.getState().historyTick).toBe(1);

    // 같은 epoch의 일반 상태 갱신은 다시 보내지 않는다
    applyStatus(status(4, false, 13));
    expect(useCommittedApplyStore.getState().historyTick).toBe(1);
    stop();

    applyStatus(status(5, false, 14));
    expect(useCommittedApplyStore.getState().historyTick).toBe(1);
  });
});
