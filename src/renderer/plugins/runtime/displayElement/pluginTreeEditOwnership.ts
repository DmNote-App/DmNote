// 편집기가 트리 연산으로 고치는 중인 플러그인 요소 - 미리보기부터 그 트리 편집이 확정·버려질 때까지.
// 자기 트리 커밋 알림 뒤 저장된 값을 받아 맞출 때(syncOwnTreeEditFields) 이 요소의 틀·숨김은 건드리지 않는다
const editing = new Set<string>();
const inFlight = new Map<string, number>();

/** 미리보기 시작 - 트리 편집을 보내기 전까지 */
export const markPluginElementsEditing = (fullIds: Iterable<string>) => {
  for (const fullId of fullIds) editing.add(fullId);
};

/** 보내지 않고 끝난 편집(취소·바뀐 것 없음) */
export const releasePluginElementsEditing = (fullIds: Iterable<string>) => {
  for (const fullId of fullIds) {
    if (!inFlight.has(fullId)) editing.delete(fullId);
  }
};

export const beginPluginTreeEdit = (fullIds: readonly string[]) => {
  for (const fullId of fullIds) {
    editing.add(fullId);
    inFlight.set(fullId, (inFlight.get(fullId) ?? 0) + 1);
  }
};

export const endPluginTreeEdit = (fullIds: readonly string[]) => {
  for (const fullId of fullIds) {
    const count = (inFlight.get(fullId) ?? 1) - 1;
    if (count > 0) {
      inFlight.set(fullId, count);
      continue;
    }
    inFlight.delete(fullId);
    editing.delete(fullId);
  }
};

export const isPluginElementEditing = (fullId: string) => editing.has(fullId);

// 테스트용
export const resetPluginTreeEditOwnership = () => {
  editing.clear();
  inFlight.clear();
};
