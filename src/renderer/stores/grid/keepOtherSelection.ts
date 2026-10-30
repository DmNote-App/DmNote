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

// 옛 선택으로 들어온 트리로 옮긴 옛 종류 요소를 트리 선택으로 보내는 쪽 - 트리 선택 스토어가 건다
type OtherMembersMode = 'replace' | 'toggle';
let routeOther: (
  ids: readonly string[],
  mode: OtherMembersMode,
) => void = () => {};

export const setOtherSelectionRouter = (
  route: (ids: readonly string[], mode: OtherMembersMode) => void,
) => {
  routeOther = route;
};

/** 트리로 옮긴 옛 종류 요소는 트리 선택이 맡는다 - 옛 종류 선택을 지킨 채 바꾸거나 넣고 뺀다 */
export const routeOtherMembers = (
  ids: readonly string[],
  mode: OtherMembersMode,
) => keepOtherSelection(() => routeOther(ids, mode));

// 다른 쪽(트리 요소) 선택 id 읽기·바뀜 알림 - 트리 선택 스토어가 건다.
// 편집 세션 지문·편집 제스처 취소가 옛 종류 선택과 함께 본다
let readOther: () => readonly string[] = () => [];
const otherSelectionListeners = new Set<() => void>();

export const setOtherSelectionReader = (read: () => readonly string[]) => {
  readOther = read;
};

export const readOtherSelectionIds = () => readOther();

export const notifyOtherSelectionChanged = () => {
  otherSelectionListeners.forEach((listener) => listener());
};

export const subscribeOtherSelection = (listener: () => void) => {
  otherSelectionListeners.add(listener);
  return () => {
    otherSelectionListeners.delete(listener);
  };
};
