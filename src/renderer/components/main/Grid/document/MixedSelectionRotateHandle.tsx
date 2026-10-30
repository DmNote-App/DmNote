'use no memo';
// 프리뷰 오버레이(모듈 상태)를 previewVersion으로 다시 읽어야 해서 컴파일러 메모 제외
import { useSyncExternalStore } from 'react';

import { useItemElementCollections } from '@hooks/shared/useItemElementCollections';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import {
  composeItemPreviewCollections,
  composePreviewPositions,
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import {
  getElementDocumentStore,
  useElementDocumentScene,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import { createSelectionRotationSnapshot } from '@utils/element/selectionRotation';
import CanvasRotateHandle from '../handles/CanvasRotateHandle';
import { createSelectionRotationGesture } from '../handles/selectionRotationGesture';
import { combineRotationSessions } from './mixedRotationSession';
import {
  documentSelectionFrame,
  startDocumentGroupRotation,
} from './documentGroupRotation';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

interface MixedSelectionRotateHandleProps {
  sceneId: string;
  zoom: number;
  panX: number;
  panY: number;
}

const EMPTY_IDS: string[] = [];

const union = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

/** 옛 종류 요소와 트리 요소가 섞인 선택의 묶음 회전 - 두 가족의 꼭짓점을 감싸는 틀 중심으로
 * 같은 각도만큼 함께 돌리고 같은 동작 id로 커밋한다 (되돌리기 한 번) */
const MixedSelectionRotateHandle = ({
  sceneId,
  zoom,
  panX,
  panY,
}: MixedSelectionRotateHandleProps) => {
  const legacy = useGridSelectionStore((state) => state.selectedElements);
  const documentIds = useDocumentSelectionStore((state) =>
    state.sceneId === sceneId ? state.selectedIds : EMPTY_IDS,
  );
  const keys = useKeyStore((state) => state.canonicalPositions);
  const itemCollections = useItemElementCollections();
  useSyncExternalStore(subscribePreviewOverlay, getPreviewOverlayVersion);
  useElementDocumentScene(sceneId);
  if (legacy.length === 0 || documentIds.length === 0) return null;
  // 플러그인 요소는 옛 종류 묶음 회전에도 들지 않는다
  if (legacy.some((element) => element.type === 'plugin')) return null;
  const snapshot = createSelectionRotationSnapshot(
    {
      keyPositions: composePreviewPositions('keyPosition', keys),
      ...composeItemPreviewCollections(itemCollections),
    },
    legacy as never,
    sceneId,
  );
  const store = getElementDocumentStore();
  const entries = documentIds.flatMap((id) => {
    const element = store?.getElement(sceneId, id);
    return element && elementKindDefinition(element.kind)?.rotatable !== false
      ? [{ id, frame: element.frame }]
      : [];
  });
  const documentFrame = documentSelectionFrame(entries);
  if (!snapshot || !documentFrame || entries.length !== documentIds.length) {
    return null;
  }
  const bounds = union(snapshot.bounds, documentFrame.bounds);
  const selectionKey = `mixed:${sceneId}:${[
    ...legacy.map(({ type, id }) => `${type}:${id}`),
    ...documentIds,
  ]
    .sort()
    .join(',')}`;
  return (
    <CanvasRotateHandle
      kind="selection"
      bounds={bounds}
      rotation={0}
      zoom={zoom}
      panX={panX}
      panY={panY}
      sessionKey={selectionKey}
      start={() => {
        const legacySession = createSelectionRotationGesture({
          snapshot,
          selectionKey,
          rotation: 0,
          bounds,
        });
        if (!legacySession) return null;
        const documentSession = startDocumentGroupRotation(sceneId, entries, {
          bounds,
          rotation: 0,
        });
        return combineRotationSessions(legacySession, documentSession);
      }}
    />
  );
};

export default MixedSelectionRotateHandle;
