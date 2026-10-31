const pendingWrites = new Set<Promise<boolean>>();
const activeBarriers = new Set<Set<Promise<boolean>>>();
// 이어 붙이는 트리 편집 - 트리 스토어가 등록한다. 경계에서는 조용해지길 기다리지 않고 지금 보낸다
let coalescedWrites: (() => void) | null = null;

export const registerCoalescedEditorWrites = (flush: (() => void) | null) => {
  coalescedWrites = flush;
};

export const trackEditorWrite = <T>(write: Promise<T>): Promise<T> => {
  const tracked = write.then(
    () => true,
    () => false,
  );
  pendingWrites.add(tracked);
  void tracked.then(() => pendingWrites.delete(tracked));
  for (const barrier of activeBarriers) barrier.add(tracked);
  return write;
};

export const drainEditorWrites = async (): Promise<boolean> => {
  coalescedWrites?.();
  let succeeded = true;
  while (pendingWrites.size > 0) {
    const results = await Promise.all([...pendingWrites]);
    if (results.some((result) => !result)) succeeded = false;
  }
  return succeeded;
};

export const beginEditorWriteBarrier = () => {
  coalescedWrites?.();
  const writes = new Set(pendingWrites);
  activeBarriers.add(writes);

  return async (): Promise<boolean> => {
    let succeeded = true;
    while (writes.size > 0) {
      const batch = [...writes];
      writes.clear();
      const results = await Promise.all(batch);
      if (results.some((result) => !result)) succeeded = false;
    }
    activeBarriers.delete(writes);
    return succeeded;
  };
};

// 일시 실패로 보류한 편집 - 트리 스토어가 등록한다. 경계(포커스 확정·종료·되돌리기)에서 다시 보내고,
// 그래도 남으면 실패 (보류한 편집의 쓰기 약속은 이미 끝나 위 대기에 잡히지 않는다)
let heldWrites: (() => Promise<boolean>) | null = null;

export const registerHeldEditorWrites = (
  flush: (() => Promise<boolean>) | null,
) => {
  heldWrites = flush;
};

export const flushHeldEditorWrites = (): Promise<boolean> =>
  heldWrites?.() ?? Promise.resolve(true);
