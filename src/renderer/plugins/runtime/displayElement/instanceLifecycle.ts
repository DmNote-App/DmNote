// 저장 탭 id - 없으면 기본 탭
export const normalizePluginInstanceTabId = (tabId?: string) => tabId || '4key';

export const createPluginInstanceSaveBarrier = (
  onPendingExternalChange: () => void = () => undefined,
) => {
  let isRestoring = true;
  let restoreFailed = false;
  let isApplyingRestore = false;
  let hasPendingExternalChanges = false;

  const shouldSave = () => {
    if (restoreFailed) return false;
    if (!isRestoring) return true;
    if (!isApplyingRestore && !hasPendingExternalChanges) {
      hasPendingExternalChanges = true;
      onPendingExternalChange();
    }
    return false;
  };

  const runRestoreMutation = <Result>(mutation: () => Result): Result => {
    const wasApplyingRestore = isApplyingRestore;
    isApplyingRestore = true;
    try {
      return mutation();
    } finally {
      isApplyingRestore = wasApplyingRestore;
    }
  };

  const finishRestoration = () => {
    isRestoring = false;
    const shouldFlush = hasPendingExternalChanges;
    hasPendingExternalChanges = false;
    return shouldFlush;
  };

  const cancelRestoration = () => {
    isRestoring = false;
    const shouldFlush = hasPendingExternalChanges;
    hasPendingExternalChanges = false;
    return shouldFlush;
  };

  const failRestoration = () => {
    isRestoring = false;
    restoreFailed = true;
    hasPendingExternalChanges = false;
  };

  return {
    cancelRestoration,
    failRestoration,
    finishRestoration,
    isRestoring: () => isRestoring,
    runRestoreMutation,
    shouldSave,
  };
};
