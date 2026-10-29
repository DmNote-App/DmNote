// 트리 문서 종류 패널 계산 - 단일·여러 개 패널이 같이 쓴다
import type {
  ElementKindDefinition,
  PanelSectionDecl,
} from '@src/renderer/elementKinds/defineElementKind';
import type { JsonValue } from '@src/types/generated/elementDocument';
import { aggregateMixedValue } from '../batch/mixedValue';

export type Translate = (key: string) => string | undefined;
export type Values = Record<string, JsonValue>;

// 여러 요소를 골랐을 때 칸 값 - 다르면 첫 값과 함께 섞임 표시
export interface FieldState {
  value: JsonValue | undefined;
  isMixed: boolean;
}

export const fieldState = (
  items: readonly Values[],
  name: string,
): FieldState => {
  const { value, isMixed } = aggregateMixedValue<Values, JsonValue | undefined>(
    items,
    (item) => item[name],
    undefined,
  );
  return { value, isMixed };
};

/** 패널 선언이 없는 종류 - 위치·크기 뒤에 쓰는 기능 묶음 섹션 */
export const defaultPanel = (
  definition: ElementKindDefinition,
): PanelSectionDecl<Values>[] => [
  { common: 'geometry' },
  ...(definition.bundles ?? []).map((bundle) => ({ bundle })),
];
