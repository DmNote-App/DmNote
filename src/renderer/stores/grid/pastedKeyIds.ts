// 같은 붙여넣기 동작에서 옛 붙여넣기가 새로 만든 키 id(원본 → 사본)와 그 동작 id. 함께 붙이는 트리 클립보드의
// 스프라이트 트리거가 사본 키를 가리키고, 두 붙여넣기가 한 되돌리기가 되게 한다 (옛 붙여넣기가 먼저, 트리가 바로 뒤)
interface PastedKeyIds {
  keyIds: ReadonlyMap<string, string>;
  gestureId?: string;
}

const EMPTY: PastedKeyIds = { keyIds: new Map() };
let last: PastedKeyIds = EMPTY;

export const recordPastedKeyIds = (
  keyIdMap: ReadonlyMap<string, string>,
  gestureId?: string,
) => {
  last = { keyIds: new Map(keyIdMap), gestureId };
};

/** 한 번 읽으면 비운다 - 다음 붙여넣기에 남지 않게 */
export const takePastedKeyIds = (): PastedKeyIds => {
  const taken = last;
  last = EMPTY;
  return taken;
};
