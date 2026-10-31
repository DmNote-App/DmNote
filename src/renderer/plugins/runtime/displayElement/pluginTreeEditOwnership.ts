// 편집기가 트리 연산으로 고치는 중인 플러그인 요소 - 미리보기 중이거나 그 트리 편집을 보내는 중(확정·버려질 때까지).
// 자기 트리 커밋 뒤 저장된 값을 받아 맞출 때(syncOwnTreeEditFields) 이 요소의 틀·숨김은 건드리지 않는다
const previewing = new Set<string>();
const inFlight = new Map<string, number>();

/** 미리보기 시작 - 그 동작을 끝낼 때(releasePluginElementsEditing)까지 */
export const markPluginElementsEditing = (fullIds: Iterable<string>) => {
  for (const fullId of fullIds) previewing.add(fullId);
};

/** 미리보기 끝(보냈거나 취소·바뀐 것 없음) - 보내는 중인 표시는 그대로 */
export const releasePluginElementsEditing = (fullIds: Iterable<string>) => {
  for (const fullId of fullIds) previewing.delete(fullId);
};

export const beginPluginTreeEdit = (fullIds: readonly string[]) => {
  for (const fullId of fullIds) {
    inFlight.set(fullId, (inFlight.get(fullId) ?? 0) + 1);
  }
};

export const endPluginTreeEdit = (fullIds: readonly string[]) => {
  for (const fullId of fullIds) {
    const count = (inFlight.get(fullId) ?? 1) - 1;
    if (count > 0) inFlight.set(fullId, count);
    else inFlight.delete(fullId);
  }
};

export const isPluginElementEditing = (fullId: string) =>
  previewing.has(fullId) || inFlight.has(fullId);

// 테스트용
export const resetPluginTreeEditOwnership = () => {
  previewing.clear();
  inFlight.clear();
};
