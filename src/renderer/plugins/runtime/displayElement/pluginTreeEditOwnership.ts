// 편집기가 미리보는 플러그인 요소 - 런타임 스토어만 고친 상태(끝날 때 트리 틀로 저장).
// 미리보는 동안은 트리 → 런타임 반영이 그 틀을 덮지 않고, 런타임 → 트리 저장도 하지 않는다
const previewing = new Set<string>();
const releaseListeners = new Set<(fullIds: ReadonlySet<string>) => void>();

/** 미리보기 시작 - 그 동작을 끝낼 때(releasePluginElementsEditing)까지 */
export const markPluginElementsEditing = (fullIds: Iterable<string>) => {
  for (const fullId of fullIds) previewing.add(fullId);
};

/** 미리보기 끝(보냈거나 취소·바뀐 것 없음) - 런타임을 트리 보기에 다시 맞춘다 */
export const releasePluginElementsEditing = (fullIds: Iterable<string>) => {
  const released = new Set<string>();
  for (const fullId of fullIds) {
    if (previewing.delete(fullId)) released.add(fullId);
  }
  if (released.size === 0) return;
  for (const listener of [...releaseListeners]) listener(released);
};

export const isPluginElementEditing = (fullId: string) =>
  previewing.has(fullId);

/** 미리보기를 푼 요소 알림 - 플러그인 인스턴스 저장이 트리 보기로 다시 맞춘다 */
export const subscribePluginEditingReleased = (
  listener: (fullIds: ReadonlySet<string>) => void,
) => {
  releaseListeners.add(listener);
  return () => {
    releaseListeners.delete(listener);
  };
};

// 테스트용
export const resetPluginTreeEditOwnership = () => {
  previewing.clear();
};
