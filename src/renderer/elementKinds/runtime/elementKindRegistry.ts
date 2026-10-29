import { BUILTIN_ELEMENT_KINDS } from '../builtinKinds';
import type { ElementKindDefinition } from '../defineElementKind';

// 종류 이름 → 정의 (그리기·이름 등 코드 부분까지)
// 첫 조회 때 만든다 - 정의 그리기 코드가 이 모듈을 다시 불러오는 순환에서도 안전
let definitions: Map<string, ElementKindDefinition> | null = null;

export const elementKindDefinition = (kind: string) => {
  definitions ??= new Map(
    BUILTIN_ELEMENT_KINDS.map((definition) => [
      definition.kind,
      definition as unknown as ElementKindDefinition,
    ]),
  );
  return definitions.get(kind);
};
