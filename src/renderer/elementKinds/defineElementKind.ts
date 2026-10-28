// 요소 종류 정의 - 종류 하나를 정의 하나로 만든다.
// 백엔드가 읽는 부분(규칙표·묶음·입력·크기·옮기는 방법)은 순수 데이터여야 하고,
// 빌드할 때 scripts/extract-element-kinds.mjs가 이 부분만 뽑아 Rust가 읽는다.
// 함수가 섞이면 추출에서 막는다. 그리기·동작·패널 같은 코드는 같은 정의에 함께 둔다.

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type AssetKind = 'image' | 'sound' | 'font';

export type ValueKindDecl =
  | { readonly type: 'bool' }
  | {
      readonly type: 'number';
      readonly min?: number;
      readonly max?: number;
      readonly integer?: boolean;
    }
  | { readonly type: 'string'; readonly maxLength?: number }
  | { readonly type: 'enum'; readonly options: readonly string[] }
  | { readonly type: 'color' }
  | { readonly type: 'gradient' }
  | { readonly type: 'file'; readonly asset: AssetKind }
  | { readonly type: 'elementRef'; readonly kinds?: readonly string[] }
  | { readonly type: 'id' }
  | {
      readonly type: 'list';
      readonly item: ValueKindDecl;
      readonly maxItems?: number;
      readonly unique?: boolean;
    }
  | { readonly type: 'object'; readonly fields: readonly FieldDecl[] };

export type ConditionDecl =
  | { readonly field: string; readonly equals: JsonValue }
  | { readonly field: string; readonly oneOf: readonly JsonValue[] }
  | { readonly all: readonly ConditionDecl[] }
  | { readonly any: readonly ConditionDecl[] }
  | { readonly not: ConditionDecl };

export interface FieldDecl {
  readonly name: string;
  readonly value: ValueKindDecl;
  readonly default: JsonValue;
  readonly nullable?: boolean;
  // 조건이 맞을 때만 이 규칙으로 검사
  readonly when?: ConditionDecl;
}

export type MigrationStepDecl =
  | { readonly op: 'rename'; readonly from: string; readonly to: string }
  | {
      readonly op: 'mapValue';
      readonly field: string;
      readonly from: JsonValue;
      readonly to: JsonValue;
    }
  | {
      readonly op: 'setDefault';
      readonly field: string;
      readonly value: JsonValue;
    }
  | { readonly op: 'remove'; readonly field: string }
  // 선언으로 못 옮기는 경우 - hooks의 같은 이름 함수를 편집 창이 돌린다
  | { readonly op: 'hook'; readonly name: string };

export interface MigrationDecl {
  readonly from: number;
  readonly steps: readonly MigrationStepDecl[];
}

// 앱이 정하는 기능 묶음 - 묶음 하나가 패널 섹션 하나다
export type BundleName =
  | 'surface'
  | 'font'
  | 'image'
  | 'note'
  | 'counter'
  | 'sound';

// 앱이 넣어 주는 입력 종류
export type InputTypeName = 'keySlot' | 'axis' | 'pointer';

export interface SizeDecl {
  readonly width: number;
  readonly height: number;
}

// 백엔드가 읽는 부분 - 추출 대상
export interface ElementKindData {
  readonly kind: string;
  readonly version: number;
  readonly fields: readonly FieldDecl[];
  readonly bundles?: readonly BundleName[];
  readonly inputs?: readonly InputTypeName[];
  // 새로 만들 때 크기
  readonly defaultSize: SizeDecl;
  // 저장 크기가 없을 때 기준
  readonly fallbackSize: SizeDecl;
  readonly rotatable?: boolean;
  readonly maxPerScene?: number;
  readonly migrations?: readonly MigrationDecl[];
}

export const ELEMENT_KIND_DATA_KEYS = [
  'kind',
  'version',
  'fields',
  'bundles',
  'inputs',
  'defaultSize',
  'fallbackSize',
  'rotatable',
  'maxPerScene',
  'migrations',
] as const satisfies readonly (keyof ElementKindData)[];

// 선언에서 값 타입 끌어내기 - 그리기 코드가 쓰는 값 이름과 타입은 선언에서 바로 따라온다
type ValueOf<V extends ValueKindDecl> = V extends { type: 'bool' }
  ? boolean
  : V extends { type: 'number' }
  ? number
  : V extends { type: 'enum'; options: readonly (infer O)[] }
  ? O
  : V extends { type: 'list'; item: infer I extends ValueKindDecl }
  ? ValueOf<I>[]
  : V extends { type: 'object'; fields: infer F extends readonly FieldDecl[] }
  ? FieldValues<F>
  : string;

type FieldValue<F extends FieldDecl> = F extends { nullable: true }
  ? ValueOf<F['value']> | null
  : ValueOf<F['value']>;

export type FieldValues<Fields extends readonly FieldDecl[]> = {
  [F in Fields[number] as F['name']]: FieldValue<F>;
};

export type KindValues<D extends { fields: readonly FieldDecl[] }> =
  FieldValues<D['fields']>;

// 코드 부분은 종류를 옮기는 단계에서 채운다 (그리기·동작·미리보기·패널·메뉴)
export interface ElementKindCode<Values> {
  // 선언으로 못 옮기는 버전 옮기기 - 옛 값을 받아 새 규칙표에 맞는 값을 돌려준다
  readonly hooks?: Readonly<
    Record<string, (values: Record<string, JsonValue>) => Values>
  >;
}

export type ElementKindDefinition<D extends ElementKindData = ElementKindData> =
  D & ElementKindCode<KindValues<D>>;

export const defineElementKind = <const D extends ElementKindData>(
  definition: D & ElementKindCode<KindValues<D>>,
): ElementKindDefinition<D> => definition;

// 추출 결과와 같은 모양의 데이터 부분
export const elementKindData = (
  definition: ElementKindData,
): ElementKindData => {
  const data: Record<string, unknown> = {};
  for (const key of ELEMENT_KIND_DATA_KEYS) {
    if (definition[key] !== undefined) data[key] = definition[key];
  }
  return data as unknown as ElementKindData;
};
