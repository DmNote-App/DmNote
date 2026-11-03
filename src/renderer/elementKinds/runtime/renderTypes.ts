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

// 앱이 창에 맞게 넣어 주는 입력 - 오버레이·OBS만 실제 신호, 편집 화면은 비어 있다
export interface ElementRenderInputs {
  pointer?: PointerInputSource;
}

export interface ElementRenderProps<Values> {
  element: ElementNode;
  values: Values;
  bundles: { surface?: SurfaceBundle };
  // 오버레이·OBS에서 동작 코드를 돌린다. 편집 화면은 false - 정의의 미리보기 상태로 그린다
  live: boolean;
  inputs: ElementRenderInputs;
  // 편집 화면에서 골랐는지 - 옛 겉모습이 선택 상태를 그릴 때
  selected?: boolean;
}
