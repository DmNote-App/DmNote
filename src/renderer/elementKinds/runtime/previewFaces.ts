import { createElement, type ComponentType, type ReactNode } from 'react';

import type { ElementRenderProps } from './renderTypes';

// 편집 화면 미리보기 그리기 - 편집 창만 등록한다(editorPreviewFaces). 편집 스토어를 읽는 미리보기 갈래가
// 오버레이·OBS 번들에 따라가지 않게 종류의 그리기는 편집 화면에서 등록된 것을 그린다
type FaceProps = ElementRenderProps<Record<string, unknown>>;

const faces = new Map<string, ComponentType<FaceProps>>();

export const registerPreviewFace = (
  kind: string,
  face: ComponentType<FaceProps>,
) => {
  faces.set(kind, face);
};

/** 요소 종류에 등록된 미리보기 그리기 (등록이 없으면 그리지 않는다) */
export const renderPreviewFace = (props: FaceProps): ReactNode => {
  const face = faces.get(props.element.kind);
  return face ? createElement(face, props) : null;
};
