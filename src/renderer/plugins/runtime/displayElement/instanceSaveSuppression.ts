// 편집기가 트리 커밋으로 저장하는 플러그인 요소 변경 - 런타임 스토어는 바로 고쳐 화면에 보이되
// 인스턴스 자동 저장(버킷 커밋)을 부르지 않는다. 저장은 같은 동작의 트리 커밋이 맡는다
let depth = 0;

export const withoutInstanceSave = <T>(change: () => T): T => {
  depth += 1;
  try {
    return change();
  } finally {
    depth -= 1;
  }
};

export const isInstanceSaveSuppressed = () => depth > 0;
