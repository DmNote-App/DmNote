'use no memo';
// 트리 스토어·프리뷰 오버레이(모듈 상태)를 렌더 중에 읽는다 - 컴파일러 메모 제외
import { useSyncExternalStore } from 'react';

import { useElementDocumentScene } from '@src/renderer/editor/document/elementDocumentRuntime';
import { sceneElements } from '@src/renderer/editor/document/documentPatch';
import {
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { treeGroupHiddenKey } from '@src/renderer/elementKinds/runtime/documentElementOrder';
import type { PanelFieldView } from '@src/renderer/elementKinds/runtime/fieldView';
import { viewFieldsOf } from '@src/renderer/elementKinds/runtime/viewFields';
import { useDocumentFramePreviewStore } from '@stores/grid/useDocumentFramePreviewStore';

/** 장면의 그 종류 요소 칸 보기 - 트리 순서, 편집 미리보기에 틀 미리보기(끌기·크기 조절)와 숨김(숨긴 그룹 안 포함)을 얹는다.
 * 바깥 카운터처럼 요소 곁에 그리는 레이어가 트리에서 그리는 요소를 따라가게. 얹을 것이 없으면 칸 보기 그대로(같은 객체) */
export const useTreeFramedPositions = (
  kind: string,
  sceneId: string,
): readonly PanelFieldView[] => {
  const scene = useElementDocumentScene(sceneId);
  // 숨긴 트리 그룹 안 요소는 트리 층이 그리지 않는다 - 곁 레이어도 숨긴다
  const groupHidden = new Set(treeGroupHiddenKey(scene).split('\n'));
  const previews = useDocumentFramePreviewStore((state) => state.frames);
  useSyncExternalStore(subscribePreviewOverlay, getPreviewOverlayVersion);
  if (!scene) return [];
  return sceneElements(scene)
    .filter((element) => element.kind === kind)
    .map((element) => {
      const view = viewFieldsOf(element, sceneId);
      const frame = previews[element.id];
      const hidden = groupHidden.has(element.id) || view.hidden;
      if (!frame && hidden === view.hidden) return view;
      return {
        ...view,
        ...(frame
          ? {
              dx: frame.x,
              dy: frame.y,
              width: frame.width,
              height: frame.height,
              rotation: frame.rotation,
            }
          : {}),
        hidden,
      };
    });
};
