// 요소 종류 정의 - 종류 하나를 정의 하나로 만든다.
// 백엔드가 읽는 부분(규칙표·묶음·입력·크기·옮기는 방법)은 순수 데이터여야 하고,
// 빌드할 때 scripts/extract-element-kinds.mjs가 이 부분만 뽑아 Rust가 읽는다.
// 함수가 섞이면 추출에서 막는다. 그리기·동작·패널 같은 코드는 같은 정의에 함께 둔다.

import type { OverlayItemContext } from '@components/overlay/counters/overlayItemRenderers';
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

export interface EditorHandlesProps {
  sceneId: string;
  element: ElementNode;
  // 확정 틀(손잡이 기준)과 크기 조절 미리보기
  bounds: { x: number; y: number; width: number; height: number };
  previewBounds: { x: number; y: number; width: number; height: number } | null;
  rotation: number;
  zoom: number;
  panX: number;
  panY: number;
}

// 코드 부분 - 그리기·미리보기·이름 (백엔드는 읽지 않는다)
export interface ElementKindCode<Values> {
  // 선언으로 못 옮기는 버전 옮기기 - 옛 값을 받아 새 규칙표에 맞는 값을 돌려준다
  readonly hooks?: Readonly<
    Record<string, (values: Record<string, JsonValue>) => Values>
  >;
  // 레이어·메뉴에 보이는 이름 (i18n 키)
  readonly label?: string;
  // 그리기 코드 하나 - 편집 화면(미리보기)과 오버레이·OBS(실제 신호)가 같이 쓴다
  readonly render?: ComponentType<ElementRenderProps<Values>>;
  // 트리로 옮긴 옛 종류 - 오버레이·OBS에서 스스로 자리를 잡는 옛 그리기(옛 위치 객체를 받는다).
  // 있으면 감싸는 상자 없이 이것을 그린다 (사용자 CSS 클래스가 두 번 붙지 않게)
  readonly legacyOverlay?: ComponentType<{
    position: Record<string, unknown>;
    context: OverlayItemContext;
  }>;
  // 편집 화면 얼굴이 사용자 CSS 클래스를 스스로 붙인다 - 옛 그리기에서 클래스가 상태 속성(data-state)과
  // 같은 노드에 있던 종류. 감싸는 상자는 클래스를 붙이지 않는다 (두 번 붙지 않게)
  readonly faceOwnsClassName?: boolean;
  // 크기 조절 때 비율을 지킬지
  readonly lockAspect?: (values: Values) => boolean;
  // 편집 화면에서 하나만 골랐을 때 더 그리는 종류 전용 손잡이 (예: 스프라이트 회전)
  readonly editorHandles?: ComponentType<EditorHandlesProps>;
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
    }
  | {
      readonly type: 'select';
      readonly options: readonly { value: string; label: string }[];
    }
  | { readonly type: 'toggle' }
  | { readonly type: 'color' }
  // 칸 하나 단위 탈출구 - 선언으로 안 되는 입력은 직접 만든 컴포넌트를 끼운다
  | {
      readonly type: 'custom';
      readonly component: ComponentType<PanelFieldControlProps>;
    };

export interface PanelFieldControlProps {
  value: JsonValue | undefined;
  onCommit: (value: JsonValue) => void;
}

export interface PanelRowDecl<Values> {
  readonly field: string;
  // i18n 키
  readonly label: string;
  readonly control: PanelControlDecl;
  readonly visible?: (values: Values) => boolean;
}

export type PanelSectionDecl<Values> =
  | { readonly rows: readonly PanelRowDecl<Values>[] }
  // 공통 위치·크기 섹션 자리
  | { readonly common: 'geometry' }
  // 기능 묶음 섹션
  | { readonly bundle: BundleName };

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
