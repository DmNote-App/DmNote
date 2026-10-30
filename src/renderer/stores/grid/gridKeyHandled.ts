// 옛 종류 키보드가 처리한 편집 키 - 트리 요소 키보드는 이 표시가 있으면 자기 선택에도 같은 동작을 한다
// (섞인 선택의 방향키·삭제·복사·붙여넣기·묶기)
const handled = new WeakSet<Event>();

export const markGridKeyHandled = (event: Event) => {
  handled.add(event);
};

export const isGridKeyHandled = (event: Event) => handled.has(event);
