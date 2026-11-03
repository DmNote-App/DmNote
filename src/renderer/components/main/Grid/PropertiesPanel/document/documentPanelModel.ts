// 트리 문서 종류 패널 계산 - 단일·여러 개 패널이 같이 쓴다
import type {
  ElementKindDefinition,
  PanelControlDecl,
  PanelRowDecl,
  PanelSectionDecl,
} from '@src/renderer/elementKinds/defineElementKind';
import type { JsonValue } from '@src/types/generated/elementDocument';
import { parseAlphaPercent, toRgbHexColor } from '@utils/color/colorUtils';
import { aggregateMixedValue } from '../batch/mixedValue';

export type Translate = (key: string) => string | undefined;
export type Values = Record<string, JsonValue>;

// 여러 요소를 골랐을 때 칸 값 - 다르면 첫 값과 함께 섞임 표시.
// 색은 hex와 알파를 따로 판단한다 (색이 같고 알파만 갈리면 hex는 공통값)
export interface FieldState {
  value: JsonValue | undefined;
  isMixed: boolean;
  hexMixed?: boolean;
  alphaMixed?: boolean;
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

/** 칸이 보일 값 - 비었거나 입력이 대신 보이는 값(숫자 0·빈 색)이면 대신 보일 값 */
export const displayValueOf = (
  control: PanelControlDecl,
  value: JsonValue | undefined,
): JsonValue | undefined => {
  switch (control.type) {
    case 'number':
      return typeof value === 'number' &&
        (value !== 0 || control.fallback === undefined)
        ? value
        : control.fallback ?? 0;
    case 'toggle':
      return value === true || (value == null && control.nullValue === true);
    case 'color':
      return (typeof value === 'string' ? value : '') || control.fallback;
    default:
      return value;
  }
};

// 저장 값이 없으면 정의의 기본값
const storedValueOf = (
  definition: ElementKindDefinition | undefined,
  field: string,
  values: Values,
): JsonValue | undefined =>
  values[field] ??
  (definition?.fields.find((decl) => decl.name === field)?.default as
    | JsonValue
    | undefined);

/** 고른 요소들의 칸 상태 - 섞임은 보일 값으로, 그 칸이 보이는 요소끼리 판단한다
 * (예: 선 그래프와 막대 그래프를 고르면 평균선 칸은 선 그래프 값) */
export const rowState = (
  definition: ElementKindDefinition | undefined,
  row: PanelRowDecl<Values>,
  items: readonly Values[],
): FieldState => {
  const visible = row.visible
    ? items.filter((values) => row.visible?.(values))
    : items;
  const shown = (visible.length > 0 ? visible : items).map((values) =>
    displayValueOf(row.control, storedValueOf(definition, row.field, values)),
  );
  const { value, isMixed } = aggregateMixedValue(
    shown,
    (item) => item,
    undefined,
  );
  if (row.control.type !== 'color') return { value, isMixed };
  const colors = shown.map((item) => (typeof item === 'string' ? item : ''));
  return {
    value,
    isMixed,
    hexMixed: aggregateMixedValue(colors, (color) => toRgbHexColor(color), '')
      .isMixed,
    alphaMixed: aggregateMixedValue(
      colors,
      (color) => parseAlphaPercent(color),
      100,
    ).isMixed,
  };
};

/** 보일 칸 - 여러 개를 고르면 하나라도 보이는 칸 */
export const visibleRows = (
  rows: readonly PanelRowDecl<Values>[],
  items: readonly Values[],
) =>
  rows.filter(
    (row) => !row.visible || items.some((values) => row.visible?.(values)),
  );

/** 패널 선언이 없는 종류 - 위치·크기 뒤에 쓰는 기능 묶음 섹션 */
export const defaultPanel = (
  definition: ElementKindDefinition,
): PanelSectionDecl<Values>[] => [
  { common: 'geometry' },
  ...(definition.bundles ?? []).map((bundle) => ({ bundle })),
];
