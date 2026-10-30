'use no memo';
// 트리 스토어·프리뷰 오버레이(모듈 상태)를 렌더 중에 읽는다 - 컴파일러 메모 제외
import { useSyncExternalStore } from 'react';

import {
  getElementDocumentStore,
  useElementDocumentScene,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { legacyPreviewFrameOf } from '@src/renderer/elementKinds/runtime/useLegacyPreviewFrame';
import { treeGroupHiddenKey } from '@src/renderer/elementKinds/runtime/documentElementOrder';
import { TREE_EDITED_KINDS } from '@src/types/elementKinds';
import { useDocumentFramePreviewStore } from './useDocumentFramePreviewStore';

interface FramedPosition {
  id: string;
  dx?: number;
  dy?: number;
  width?: number;
  height?: number;
  rotation?: number;
  hidden?: boolean;
}

/** 트리로 옮긴 종류의 옛 위치 목록에 트리 틀(끌기·옛 패널 미리보기 포함)과 숨김을 얹는다 -
 * 바깥 카운터처럼 옛 목록으로 그리는 곁 레이어가 트리에서 그리는 요소를 따라가게 */
export const useTreeFramedPositions = <P extends FramedPosition>(
  kind: string,
  positions: readonly P[],
  sceneId: string,
): readonly P[] => {
  const scene = useElementDocumentScene(sceneId);
  // 숨긴 트리 그룹 안 요소는 트리 층이 그리지 않는다 - 곁 레이어도 숨긴다
  const groupHidden = new Set(treeGroupHiddenKey(scene).split('\n'));
  const previews = useDocumentFramePreviewStore((state) => state.frames);
  useSyncExternalStore(subscribePreviewOverlay, getPreviewOverlayVersion);
  if (!TREE_EDITED_KINDS.has(kind)) return positions;
  const store = getElementDocumentStore();
  return positions.map((position) => {
    const element = store?.getElement(sceneId, position.id);
    if (!element) return position;
    const frame =
      previews[position.id] ??
      legacyPreviewFrameOf(element, sceneId) ??
      element.frame;
    return {
      ...position,
      dx: frame.x,
      dy: frame.y,
      width: frame.width,
      height: frame.height,
      rotation: frame.rotation,
      hidden:
        groupHidden.has(position.id) || (element.hidden ?? position.hidden),
    };
  });
};
