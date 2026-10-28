import {
  isEditorElementType,
  type EditorElementTypeV1,
} from '@src/types/editor';
import { DEFAULT_SPRITE_SIZE } from '@src/types/key/sprites';

// 요소 종류별 공통 성질 - 모든 창에서 쓰는 순수 데이터.
// 종류별 컴포넌트·패널 연결은 창별 레지스트리가 맡는다
export interface ElementKindModel {
  // 새로 만들 때 크기, 저장 크기가 없을 때의 기준
  defaultSize: { width: number; height: number };
  // 공통 rotation 속성으로 회전 (스프라이트는 전용 필드 patch)
  commonRotation: boolean;
  // KeyPosition 기반 표면 - 배경·테두리·글꼴 페인트, 그라데이션, 스타일 프리뷰
  surfaceStyle: boolean;
}

export const ELEMENT_KIND_MODELS = {
  key: {
    defaultSize: { width: 60, height: 60 },
    commonRotation: true,
    surfaceStyle: true,
  },
  stat: {
    defaultSize: { width: 60, height: 60 },
    commonRotation: true,
    surfaceStyle: true,
  },
  graph: {
    defaultSize: { width: 120, height: 60 },
    commonRotation: true,
    surfaceStyle: true,
  },
  knob: {
    defaultSize: { width: 60, height: 60 },
    commonRotation: true,
    surfaceStyle: true,
  },
  sprite: {
    defaultSize: { width: DEFAULT_SPRITE_SIZE, height: DEFAULT_SPRITE_SIZE },
    commonRotation: false,
    surfaceStyle: false,
  },
} as const satisfies Record<EditorElementTypeV1, ElementKindModel>;

type KindModels = typeof ELEMENT_KIND_MODELS;

type KindsWith<F extends 'commonRotation' | 'surfaceStyle'> = {
  [K in EditorElementTypeV1]: KindModels[K][F] extends true ? K : never;
}[EditorElementTypeV1];

export type RotatableElementType = KindsWith<'commonRotation'>;
export type SurfaceStyledElementType = KindsWith<'surfaceStyle'>;

export const isRotatableElementType = (
  type: unknown,
): type is RotatableElementType =>
  isEditorElementType(type) && ELEMENT_KIND_MODELS[type].commonRotation;

export const isSurfaceStyledElementType = (
  type: unknown,
): type is SurfaceStyledElementType =>
  isEditorElementType(type) && ELEMENT_KIND_MODELS[type].surfaceStyle;

export const defaultElementSize = (type: EditorElementTypeV1) =>
  ELEMENT_KIND_MODELS[type].defaultSize;
