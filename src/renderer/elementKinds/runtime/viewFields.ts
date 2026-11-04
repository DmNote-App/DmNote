'use no memo';
// 프리뷰 오버레이(모듈 상태)를 previewVersion으로 다시 읽어야 해서 컴파일러 메모 제외
// 패널·손잡이가 읽는 요소 값 - 트리 칸 보기(panelFieldViewOf)에 편집 미리보기를 얹는다
import { useSyncExternalStore } from 'react';

import {
  sceneElements,
  type ElementNode,
} from '@src/renderer/editor/document/documentPatch';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  getPreviewOverlayVersion,
  previewPatchOf,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { isEditorElementType } from '@src/types/editor';
import type { Scene } from '@src/types/generated/elementDocument';
import { PREVIEW_DOMAIN_BY_ELEMENT_TYPE } from '@src/types/preview';
import { panelFieldViewOf, type PanelFieldView } from './fieldView';

// 같은 요소·같은 미리보기면 같은 객체 - 패널 effect·메모가 참조로 비교한다(새 객체면 렌더마다 다시 돈다)
const cache = new WeakMap<
  ElementNode,
  Map<string, { version: number; result: PanelFieldView }>
>();

/** 요소의 보이는 칸 - 트리 칸 보기(낙관 반영 포함)에 그 탭의 편집 미리보기를 얹는다 */
export const viewFieldsOf = (
  element: ElementNode,
  sceneId: string,
): PanelFieldView => {
  const version = getPreviewOverlayVersion();
  let byScene = cache.get(element);
  const cached = byScene?.get(sceneId);
  if (cached?.version === version) return cached.result;
  const view = panelFieldViewOf(element);
  const patch = isEditorElementType(element.kind)
    ? previewPatchOf(
        PREVIEW_DOMAIN_BY_ELEMENT_TYPE[element.kind],
        sceneId,
        element.id,
      )
    : null;
  const result = patch ? ({ ...view, ...patch } as PanelFieldView) : view;
  if (!byScene) {
    byScene = new Map();
    cache.set(element, byScene);
  }
  byScene.set(sceneId, { version, result });
  return result;
};

/** viewFieldsOf 구독 - 이 요소의 보이는 값이 바뀔 때만 다시 그린다
 * (미리보기가 없는 요소는 같은 객체라 다른 요소의 미리보기에 다시 그리지 않는다) */
export const useViewFields = (
  element: ElementNode,
  sceneId: string,
): PanelFieldView =>
  useSyncExternalStore(subscribePreviewOverlay, () =>
    viewFieldsOf(element, sceneId),
  );

/** 장면의 요소 지금 칸 - 트리 값(낙관 적용 포함), 미리보기 없음. 요소가 없으면 undefined */
export const currentFieldsOf = (
  sceneId: string,
  id: string,
): PanelFieldView | undefined => {
  const element = getElementDocumentStore()?.getElement(sceneId, id);
  return element ? panelFieldViewOf(element) : undefined;
};

/** 장면의 요소 보이는 칸 - 지금 칸에 편집 미리보기를 얹는다. 요소가 없으면 undefined */
export const viewFieldsById = (
  sceneId: string,
  id: string,
): PanelFieldView | undefined => {
  const element = getElementDocumentStore()?.getElement(sceneId, id);
  return element ? viewFieldsOf(element, sceneId) : undefined;
};

type ViewFieldsLookup = (id: string) => PanelFieldView | undefined;

const noElement: ViewFieldsLookup = () => undefined;
const elementIndexCache = new WeakMap<Scene, Map<string, ElementNode>>();
const lookupCache = new WeakMap<
  Scene,
  Map<string, { version: number; lookup: ViewFieldsLookup }>
>();

// 장면의 요소 id 색인 - 장면이 같으면 한 번만 만든다
const elementIndexOf = (scene: Scene) => {
  let index = elementIndexCache.get(scene);
  if (!index) {
    index = new Map(
      sceneElements(scene).map((element) => [element.id, element]),
    );
    elementIndexCache.set(scene, index);
  }
  return index;
};

/** 장면에서 id로 요소의 보이는 칸(편집 미리보기 포함) 찾기 - 장면·미리보기 판이 같으면 같은 함수라
 * 받는 쪽 메모가 장면·미리보기가 바뀔 때만 다시 계산한다.
 * previewVersion은 React Compiler가 메모하는 파일에서 미리보기 판을 인자로 넘기는 자리(값은 안에서 읽는다) */
export const viewFieldsLookup = (
  scene: Scene | undefined,
  sceneId: string,
  _previewVersion?: number,
): ViewFieldsLookup => {
  if (!scene) return noElement;
  const version = getPreviewOverlayVersion();
  let byScene = lookupCache.get(scene);
  const cached = byScene?.get(sceneId);
  if (cached?.version === version) return cached.lookup;
  const lookup: ViewFieldsLookup = (id) => {
    const element = elementIndexOf(scene).get(id);
    return element ? viewFieldsOf(element, sceneId) : undefined;
  };
  if (!byScene) {
    byScene = new Map();
    lookupCache.set(scene, byScene);
  }
  byScene.set(sceneId, { version, lookup });
  return lookup;
};
