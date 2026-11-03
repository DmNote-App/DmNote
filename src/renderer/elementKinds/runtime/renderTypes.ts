import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { PointerInputSource } from './pointerInput';
import type { SurfaceBundle } from './ElementSurface';

// 오버레이가 트리에서 그리는 옛 종류에 넘기는 맥락
export interface OverlayItemContext {
  // 스프라이트 트리거(키 요소 id) -> canonical 키 문자열
  spriteKeyCanonicalMap: ReadonlyMap<string, string>;
  // 트리에서 그리는 키 - 지금 탭과 키 카운터 표시
  mode?: string;
  keyCounterEnabled?: boolean;
}

// 앱이 창에 맞게 넣어 주는 입력 - 오버레이·OBS는 실제 신호, 편집 화면은 미리보기 상태
export interface ElementRenderInputs {
  pointer?: PointerInputSource;
  // 편집 화면 눌림 미리보기 - 상태 색을 고치는 동안 눌린 모습으로 그린다 (오버레이는 종류의 동작이 정한다)
  pressed?: { readonly value: boolean };
}

// 기능 묶음 값 - 트리 요소의 묶음 그대로 (편집 화면은 미리보기를 얹은 값)
export type ElementBundles = { readonly surface?: SurfaceBundle } & Readonly<
  Record<string, unknown>
>;

// 스스로 자리를 잡는 얼굴(정의의 placesItself)이 오버레이·OBS에서 받는 장면 좌표와 겹침 순서
export interface ElementPlacement {
  x: number;
  y: number;
  zIndex: number;
}

export interface ElementRenderProps<Values> {
  element: ElementNode;
  values: Values;
  bundles: ElementBundles;
  // 오버레이·OBS에서 동작 코드를 돌린다. 편집 화면은 false - 정의의 미리보기 상태로 그린다
  live: boolean;
  inputs: ElementRenderInputs;
  // 오버레이·OBS의 자리 - 감싸는 상자 없이 그리는 얼굴만 받는다 (편집 화면은 감싸는 상자가 자리를 잡는다)
  placement?: ElementPlacement;
  // 편집 화면에서 골랐는지 - 옛 겉모습이 선택 상태를 그릴 때
  selected?: boolean;
}
