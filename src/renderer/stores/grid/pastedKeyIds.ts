// 같은 붙여넣기 동작에서 옛 붙여넣기가 새로 만든 키 id(원본 → 사본). 함께 붙이는 트리 클립보드의
// 스프라이트 트리거가 원본 대신 사본 키를 가리키게 한다 (옛 붙여넣기가 먼저, 트리 붙여넣기가 바로 뒤)
let last: ReadonlyMap<string, string> = new Map();

export const recordPastedKeyIds = (keyIdMap: ReadonlyMap<string, string>) => {
  last = new Map(keyIdMap);
};

/** 한 번 읽으면 비운다 - 다음 붙여넣기에 남지 않게 */
export const takePastedKeyIds = (): ReadonlyMap<string, string> => {
  const taken = last;
  last = new Map();
  return taken;
};
