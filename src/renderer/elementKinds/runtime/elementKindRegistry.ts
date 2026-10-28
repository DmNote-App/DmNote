import { BUILTIN_ELEMENT_KINDS } from '../builtinKinds';
import type { ElementKindDefinition } from '../defineElementKind';

// 종류 이름 → 정의 (그리기·이름 등 코드 부분까지)
const definitions = new Map<string, ElementKindDefinition>(
  BUILTIN_ELEMENT_KINDS.map((definition) => [
    definition.kind,
    definition as unknown as ElementKindDefinition,
  ]),
);

export const elementKindDefinition = (kind: string) => definitions.get(kind);
