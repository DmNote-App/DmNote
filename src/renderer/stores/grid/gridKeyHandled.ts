// 옛 종류 키보드가 처리한 편집 키 - 트리 요소 키보드는 이 표시가 있으면 자기 선택에도 같은 동작을 한다
// (섞인 선택의 방향키·삭제·복사·붙여넣기·한 칸 앞뒤). 방향키는 되돌리기 단계를 합칠 동작 id도 싣는다
const handled = new WeakMap<Event, string | undefined>();

export const markGridKeyHandled = (event: Event, gestureId?: string) => {
  handled.set(event, gestureId);
};

export const isGridKeyHandled = (event: Event) => handled.has(event);

export const gridKeyGestureId = (event: Event) => handled.get(event);
