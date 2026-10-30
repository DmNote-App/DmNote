// 옛 종류 선택과 트리 요소 선택은 하나의 선택이다 - 바꿔 고르면 다른 쪽을 비우고,
// 넣고 빼기(보조키·레이어 토글·마퀴)는 이 안에서 다른 쪽을 지킨다
let keepingOther = false;

/** 넣고 빼기 - 이 안에서 바꾼 선택은 다른 쪽(옛 종류·트리) 선택을 비우지 않는다 */
export const keepOtherSelection = <T>(change: () => T): T => {
  const previous = keepingOther;
  keepingOther = true;
  try {
    return change();
  } finally {
    keepingOther = previous;
  }
};

export const isKeepingOtherSelection = () => keepingOther;

// 옛 종류 선택을 바꿔 고를 때 비울 다른 쪽(트리 요소) 선택 - 트리 선택 스토어가 건다
let clearOther: () => void = () => {};

export const setOtherSelectionClearer = (clear: () => void) => {
  clearOther = clear;
};

/** 바꿔 고르기 - 넣고 빼기가 아니면 다른 쪽 선택을 비운다 (같은 선택을 다시 골라도) */
export const replaceOtherSelection = () => {
  if (!keepingOther) clearOther();
};

// 옛 그룹 안의 트리 가족 멤버(트리로 옮긴 옛 종류)를 고르는 쪽 - 트리 선택 스토어가 건다
let selectOther: (sceneId: string, ids: readonly string[]) => void = () => {};

export const setOtherSelectionSetter = (
  select: (sceneId: string, ids: readonly string[]) => void,
) => {
  selectOther = select;
};

/** 옛 그룹째 고를 때 그 그룹의 트리 가족 멤버도 함께 고른다 (옛 종류 선택을 지킨 채) */
export const selectOtherMembers = (sceneId: string, ids: readonly string[]) => {
  if (ids.length === 0) return;
  keepOtherSelection(() => selectOther(sceneId, ids));
};
