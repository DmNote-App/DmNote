import { useEffect, useState } from 'react';
import { useTranslation } from '@contexts/useTranslation';
import { useSingleFlightAction } from '@hooks/useSingleFlightAction';
import { useHistoryStatusStore } from '@stores/data/useHistoryStatusStore';
import { loadElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { flushFocusedEditor } from '@src/renderer/editor/runtime/lifecycle/lifecycleEditorFlush';

// 일시 실패로 보류한 트리 편집 안내 - 편집은 화면에 남아 있고 다시 저장을 기다린다
const EditorSaveNotice = () => {
  const { t } = useTranslation();
  const [heldCount, setHeldCount] = useState(0);
  const historyBusy = useHistoryStatusStore((state) => state.busy);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void loadElementDocumentStore()
      .then((loaded) => {
        if (disposed) return;
        const update = () => setHeldCount(loaded.getHeldCount?.() ?? 0);
        unsubscribe = loaded.subscribeHeld?.(update);
        update();
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  // 포커스 입력 확정이 보류한 편집도 차례대로 다시 보낸다
  const { run: retry, pending } = useSingleFlightAction(async () => {
    try {
      await flushFocusedEditor();
    } catch (error) {
      console.error('편집 내용 다시 저장 실패', error);
    }
  });

  if (heldCount === 0) return null;
  const busy = pending || historyBusy;

  return (
    <div
      role="status"
      className="fixed bottom-[72px] left-1/2 z-[var(--z-chrome-popup)] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-body text-fg shadow-lg"
    >
      <span>{t('editorSave.pendingFailure')}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void retry()}
        className="shrink-0 rounded px-2 py-1 text-accent disabled:opacity-50"
      >
        {t(busy ? 'editorSave.retrying' : 'editorSave.retrySave')}
      </button>
    </div>
  );
};

export default EditorSaveNotice;
