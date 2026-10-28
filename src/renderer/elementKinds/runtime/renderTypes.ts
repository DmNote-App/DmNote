import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { PointerInputSource } from './pointerInput';
import type { SurfaceBundle } from './ElementSurface';

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
}
