// 트리 요소 선택과 플러그인 요소 선택은 하나의 선택이다 - 바꿔 고르면 다른 쪽을 비우고,
// 넣고 빼기(보조키·레이어 토글·마퀴)는 이 안에서 다른 쪽을 지킨다
let keepingOther = false;

/** 넣고 빼기 - 이 안에서 바꾼 선택은 다른 쪽(플러그인·트리) 선택을 비우지 않는다 */
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
