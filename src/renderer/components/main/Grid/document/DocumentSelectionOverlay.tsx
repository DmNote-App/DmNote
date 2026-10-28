import React, { useEffect } from 'react';

import {
  getElementDocumentStore,
  useDocumentElement,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import ResizeHandles from '../handles/ResizeHandles';
import { SELECTION_BORDER_WIDTH } from '../handles/selectionOutline';
import { setDocumentFrame } from './documentEditActions';
import { useDocumentFramePreviewStore } from './useDocumentFramePreviewStore';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

interface DocumentSelectionOverlayProps {
  sceneId: string;
  zoom: number;
  panX: number;
  panY: number;
}

/** 트리 요소 선택 윤곽과 크기 조절 핸들 - 옛 종류 선택과 같은 모양 */
const DocumentSelectionOverlay = ({
  sceneId,
  zoom,
  panX,
  panY,
}: DocumentSelectionOverlayProps) => {
  const selectedId = useDocumentSelectionStore((state) =>
    state.sceneId === sceneId ? state.selectedIds[0] ?? null : null,
  );
  const element = useDocumentElement(sceneId, selectedId ?? '');
  const preview = useDocumentFramePreviewStore((state) =>
    selectedId ? state.frames[selectedId] : undefined,
  );
  // 되돌리기·다른 창 편집으로 고른 요소가 없어지면 선택을 푼다
  const missing = !!selectedId && !element && !!getElementDocumentStore();
  useEffect(() => {
    if (missing) useDocumentSelectionStore.getState().clear();
  }, [missing]);
  if (!selectedId || !element) return null;
  const frame = preview ?? element.frame;
  const bounds = {
    x: element.frame.x,
    y: element.frame.y,
    width: element.frame.width,
    height: element.frame.height,
  };
  const definition = elementKindDefinition(element.kind);
  const lockAspect =
    definition?.lockAspect?.((element.values ?? {}) as never) ?? false;
  return (
    <>
      <div
        data-grid-selection-outline=""
        data-grid-selection-element-id={element.id}
        data-grid-selection-element-type={element.kind}
        style={{
          position: 'absolute',
          left: frame.x * zoom + panX - SELECTION_BORDER_WIDTH,
          top: frame.y * zoom + panY - SELECTION_BORDER_WIDTH,
          width: frame.width * zoom + SELECTION_BORDER_WIDTH * 2,
          height: frame.height * zoom + SELECTION_BORDER_WIDTH * 2,
          boxSizing: 'border-box',
          ...(frame.rotation
            ? { transform: `rotate(${frame.rotation}deg)` }
            : {}),
          border: `${SELECTION_BORDER_WIDTH}px solid var(--ui-selection-border)`,
          borderRadius: '4px',
          pointerEvents: 'none',
          zIndex: 'var(--z-canvas-selection-outline)',
        }}
      />
      <ResizeHandles
        bounds={bounds}
        previewBounds={preview ?? null}
        zoom={zoom}
        panX={panX}
        panY={panY}
        elementId={element.id}
        lockAspect={lockAspect}
        rotation={frame.rotation}
        onResize={(result) =>
          useDocumentFramePreviewStore.getState().set(element.id, {
            ...element.frame,
            x: result.x,
            y: result.y,
            width: result.width,
            height: result.height,
          })
        }
        onResizeEnd={() => {
          const last =
            useDocumentFramePreviewStore.getState().frames[element.id];
          if (!last) return;
          void setDocumentFrame(sceneId, element.id, {
            x: last.x,
            y: last.y,
            width: last.width,
            height: last.height,
          }).finally(() =>
            useDocumentFramePreviewStore.getState().clear(element.id),
          );
        }}
      />
    </>
  );
};

export default DocumentSelectionOverlay;
