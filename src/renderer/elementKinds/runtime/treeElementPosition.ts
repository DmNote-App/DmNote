'use no memo';
// 프리뷰 오버레이(모듈 상태)를 previewVersion으로 다시 읽어야 해서 컴파일러 메모 제외
import { useSyncExternalStore } from 'react';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import {
  getPreviewOverlayVersion,
  previewPatchOf,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { isEditorElementType } from '@src/types/editor';
import { PREVIEW_DOMAIN_BY_ELEMENT_TYPE } from '@src/types/preview';
import { legacyPositionOf } from './legacyPosition';

/** 트리로 옮긴 옛 종류 요소의 옛 모양 - 트리 값(낙관 반영 포함)에 편집 미리보기를 얹는다 */
export const treeElementPositionOf = (
  element: ElementNode,
  sceneId: string,
): Record<string, unknown> => {
  const position = legacyPositionOf(element);
  if (!isEditorElementType(element.kind)) return position;
  const patch = previewPatchOf(
    PREVIEW_DOMAIN_BY_ELEMENT_TYPE[element.kind],
    sceneId,
    element.id,
  );
  return patch ? { ...position, ...patch } : position;
};

/** treeElementPositionOf 구독 - 미리보기가 바뀌면 다시 그린다 */
export const useTreeElementPosition = (
  element: ElementNode,
  sceneId: string,
): Record<string, unknown> => {
  useSyncExternalStore(subscribePreviewOverlay, getPreviewOverlayVersion);
  return treeElementPositionOf(element, sceneId);
};
