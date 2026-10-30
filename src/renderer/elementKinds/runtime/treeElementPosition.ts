'use no memo';
// 프리뷰 오버레이(모듈 상태)를 previewVersion으로 다시 읽어야 해서 컴파일러 메모 제외
import { useSyncExternalStore } from 'react';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  getPreviewOverlayVersion,
  previewPatchOf,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { isEditorElementType } from '@src/types/editor';
import { PREVIEW_DOMAIN_BY_ELEMENT_TYPE } from '@src/types/preview';
import { legacyPositionOf } from './legacyPosition';

// 같은 요소·같은 미리보기면 같은 객체 - 패널 effect·메모가 참조로 비교한다(새 객체면 렌더마다 다시 돈다)
const cache = new WeakMap<
  ElementNode,
  Map<string, { version: number; result: Record<string, unknown> }>
>();

/** 트리로 옮긴 옛 종류 요소의 옛 모양 - 트리 값(낙관 반영 포함)에 편집 미리보기를 얹는다 */
export const treeElementPositionOf = (
  element: ElementNode,
  sceneId: string,
): Record<string, unknown> => {
  const version = getPreviewOverlayVersion();
  let byScene = cache.get(element);
  const cached = byScene?.get(sceneId);
  if (cached?.version === version) return cached.result;
  const position = legacyPositionOf(element);
  const patch = isEditorElementType(element.kind)
    ? previewPatchOf(
        PREVIEW_DOMAIN_BY_ELEMENT_TYPE[element.kind],
        sceneId,
        element.id,
      )
    : null;
  const result = patch ? { ...position, ...patch } : position;
  if (!byScene) {
    byScene = new Map();
    cache.set(element, byScene);
  }
  byScene.set(sceneId, { version, result });
  return result;
};

/** treeElementPositionOf 구독 - 미리보기가 바뀌면 다시 그린다 */
export const useTreeElementPosition = (
  element: ElementNode,
  sceneId: string,
): Record<string, unknown> => {
  useSyncExternalStore(subscribePreviewOverlay, getPreviewOverlayVersion);
  return treeElementPositionOf(element, sceneId);
};

/** 장면의 요소 지금 값(옛 칸 모양) - 트리 값(낙관 적용 포함), 미리보기 없음. 요소가 없으면 undefined */
export const currentTreePosition = (
  sceneId: string,
  id: string,
): Record<string, unknown> | undefined => {
  const element = getElementDocumentStore()?.getElement(sceneId, id);
  return element ? legacyPositionOf(element) : undefined;
};

/** 장면의 요소 보이는 값 - 지금 값에 편집 미리보기를 얹는다. 요소가 없으면 undefined */
export const viewTreePosition = (
  sceneId: string,
  id: string,
): Record<string, unknown> | undefined => {
  const element = getElementDocumentStore()?.getElement(sceneId, id);
  return element ? treeElementPositionOf(element, sceneId) : undefined;
};
