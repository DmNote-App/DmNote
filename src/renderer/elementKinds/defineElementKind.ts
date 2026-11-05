// 요소 종류 정의 - 종류 하나를 정의 하나로 만든다.
// 백엔드가 읽는 부분(규칙표·묶음·입력·크기·옮기는 방법)은 순수 데이터여야 하고,
// 빌드할 때 scripts/extract-element-kinds.mjs가 이 부분만 뽑아 Rust가 읽는다.
// 함수가 섞이면 추출에서 막는다. 그리기·동작·패널 같은 코드는 같은 정의에 함께 둔다.

import type { ComponentType } from 'react';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { ElementRenderProps } from './runtime/renderTypes';
import type {
  AssetKind,
  Condition,
  FieldRule,
  JsonValue as GeneratedJsonValue,
  KindMigration,
  MigrationStep,
  ValueKind,
} from '@src/types/generated/elementDocument';

// 규칙표 구조의 원본은 Rust(element-document 크레이트)이고, 아래 타입은 생성된 타입을
// 정의 파일에서 리터럴(as const)로 쓰기 좋게 읽기 전용으로 감싼 것이다
type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

export type JsonValue = DeepReadonly<GeneratedJsonValue>;
export type { AssetKind };

// json 값 종류는 앱 구조(기능 묶음) 전용이라 종류 정의에서 뺀다
export type ValueKindDecl = DeepReadonly<Exclude<ValueKind, { type: 'json' }>>;
export type ConditionDecl = DeepReadonly<Condition>;
export type FieldDecl = DeepReadonly<Omit<FieldRule, 'value'>> & {
  readonly value: ValueKindDecl;
};
export type MigrationStepDecl = DeepReadonly<MigrationStep>;
export type MigrationDecl = DeepReadonly<KindMigration>;

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

// 코드 부분 - 그리기·미리보기·이름 (백엔드는 읽지 않는다)
export interface ElementKindCode<Values> {
  // 선언으로 못 옮기는 버전 옮기기 - 옛 값을 받아 새 규칙표에 맞는 값을 돌려준다
  readonly hooks?: Readonly<
    Record<string, (values: Record<string, JsonValue>) => Values>
  >;
  // 레이어·메뉴에 보이는 이름 (i18n 키)
  readonly label?: string;
  // 패널 제목 - 요소 이름이 없을 때 (없으면 종류 이름). 입력에서 이름이 나오는 종류(키)는 요소를 본다
  readonly title?: (values: Values, element: ElementNode) => string;
  // 그리기 코드 하나 - 편집 화면(미리보기)과 오버레이·OBS(실제 신호)가 같이 쓴다
  readonly render?: ComponentType<ElementRenderProps<Values>>;
  // 편집 화면 얼굴이 사용자 CSS 클래스를 스스로 붙인다 - 옛 그리기에서 클래스가 상태 속성(data-state)과
  // 같은 노드에 있던 종류. 감싸는 상자는 클래스를 붙이지 않는다 (두 번 붙지 않게)
  readonly faceOwnsClassName?: boolean;
  // 오버레이·OBS에서 감싸는 상자 없이 얼굴이 받은 자리(placement)에 스스로 놓인다 - 옛 오버레이 DOM을
  // 그대로 지키는 옛 종류 (사용자 CSS·히트 영역 측정이 그 모양에 기댄다)
  readonly placesItself?: boolean;
  // 눌림 그림이 있다 - 패널이 눌림 상태 칸(눌림 칠·그림자·이미지·카운터 채움)을 보이고 고친다
  readonly activeVisual?: boolean;
  // 표면 묶음의 그림자를 그리지 않는다 (예: 그래프) - 패널이 그림자 칸을 보이지 않는다
  readonly surfaceShadow?: false;
  // 크기 조절 때 비율을 지킬지
  readonly lockAspect?: (values: Values) => boolean;
  // 크기가 바뀔 때 함께 맞출 값 - 바뀐 값만 (예: 스프라이트 자세 이동값을 크기 비율로)
  readonly resizeValues?: (
    element: ElementNode,
    bounds: { x: number; y: number; width: number; height: number },
  ) => Record<string, GeneratedJsonValue> | null;
  // 크기 조절 손잡이 중 비울 자리 - 종류의 다른 표식이 그 자리에 앉는다 (예: 스프라이트 기준점)
  readonly occupiedResizeHandle?: (
    element: ElementNode,
    sceneId: string,
  ) => { x: number; y: number } | null;
  // 값이 바뀔 때 함께 맞출 위치·크기 (예: 비율 고정으로 바꾸면 높이를 비율에 맞춘다)
  readonly adjustFrame?: (
    values: Values,
    frame: FramePatchDecl & { width: number; height: number },
  ) => Promise<FramePatchDecl | null> | FramePatchDecl | null;
  // 속성 패널 선언 - 섹션 순서도 종류가 정한다
  readonly panel?: readonly PanelSectionDecl<Values>[];
  // 캔버스 우클릭 추가 메뉴 이름 (i18n 키)
  readonly addLabel?: string;
  readonly deleteLabel?: string;
  readonly duplicateLabel?: string;
}

export interface FramePatchDecl {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
}

// 패널 칸 하나의 입력 - 지금 패널 부품(NumberInput·Dropdown·Checkbox·ColorInput)으로 그린다
export type PanelControlDecl =
  | {
      readonly type: 'number';
      readonly min?: number;
      readonly max?: number;
      readonly suffix?: string;
      readonly decimalScale?: number;
      // 입력 칸 너비 (없으면 패널 숫자 칸 너비)
      readonly width?: string;
      // 범위로 자른 뒤 이 단위로 맞춘다 (예: 그래프 속도 100ms) - 방향키 눈금은 그대로 1
      readonly snap?: number;
      // 값이 없거나 0일 때 보일 값
      readonly fallback?: number;
      // 입력 중 값은 패널 칸에만 보이고 Enter·포커스 떠날 때 쓴다 (화면 미리보기가 없는 값, 하나를 골랐을 때)
      readonly draft?: boolean;
    }
  | {
      readonly type: 'select';
      readonly options: readonly { value: string; label: string }[];
    }
  | {
      readonly type: 'toggle';
      // 값이 비었을 때(null) 보일 상태
      readonly nullValue?: boolean;
    }
  | {
      readonly type: 'color';
      // 값이 비었을 때 보일 색
      readonly fallback?: string;
      // 고르는 동안 화면에 먼저 보인다 (확정은 놓을 때, Esc는 되돌린다)
      readonly preview?: boolean;
    }
  // 칸 하나 단위 탈출구 - 선언으로 안 되는 입력은 직접 만든 컴포넌트를 끼운다
  | {
      readonly type: 'custom';
      readonly component: ComponentType<PanelFieldControlProps>;
    };

export interface PanelFieldControlProps {
  value: JsonValue | undefined;
  // 여러 개를 골랐고 값이 다르다 (칸 이름 옆에 Mixed가 붙는다)
  isMixed?: boolean;
  onCommit: (value: JsonValue) => void;
  // 고른 요소들 - 커밋을 시작 시점 요소에 묶어야 하는 입력(노브 축 감지 등)이 쓴다
  elementIds: readonly string[];
}

// 하나만 골랐을 때 / 여러 개 골랐을 때만 쓰는 칸·섹션 (없으면 둘 다)
export type PanelSelectionScope = 'single' | 'batch';

// 속성 패널 탭 - 섹션이 두 탭 이상에 있으면 패널이 탭을 그린다 (섹션에 없으면 스타일)
export type PanelTab = 'style' | 'note' | 'counter';

export interface PanelRowDecl<Values> {
  readonly field: string;
  // i18n 키
  readonly label: string;
  readonly control: PanelControlDecl;
  // 여러 개를 고르면 하나라도 보이는 칸을 보인다 (고친 값은 고른 요소 모두에 쓴다)
  readonly visible?: (values: Values) => boolean;
  // 노브 축 매핑처럼 하나에만 쓰는 칸은 'single'
  readonly only?: PanelSelectionScope;
}

// 섹션 하나 단위 탈출구가 받는 것 - 값 읽기·쓰기는 종류 코드가 맡는다
export interface PanelSectionProps {
  sceneId: string;
  elementIds: readonly string[];
  panelElement: HTMLElement | null;
  t: (key: string) => string | undefined;
}

export type PanelSectionDecl<Values> = (
  | { readonly rows: readonly PanelRowDecl<Values>[] }
  // 공통 위치·크기 섹션 자리
  | { readonly common: 'geometry' }
  // 사용자 CSS 섹션 - 설정에서 사용자 CSS를 켰을 때 인라인 스타일 우선·클래스
  | { readonly common: 'customCss' }
  // 기능 묶음 섹션
  | { readonly bundle: BundleName }
  // 섹션 하나 단위 탈출구 - 선언으로 안 되는 편집 화면(스프라이트 자세 목록 등)은 직접 만든 섹션을 끼운다
  | { readonly custom: ComponentType<PanelSectionProps> }
) & { readonly only?: PanelSelectionScope; readonly tab?: PanelTab };

export type ElementKindDefinition<D extends ElementKindData = ElementKindData> =
  D & ElementKindCode<KindValues<D>>;

// 첫 인수는 백엔드가 읽는 데이터(추출 대상), 둘째 인수는 코드 부분.
// 둘을 나누면 데이터의 리터럴 타입이 먼저 정해지고 코드가 그 값 타입으로 검사된다
export const defineElementKind = <const D extends ElementKindData>(
  data: D,
  code: ElementKindCode<KindValues<D>> = {},
): ElementKindDefinition<D> => ({ ...data, ...code });

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
