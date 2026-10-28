import React, { useEffect } from 'react';

import {
  loadElementDocumentStore,
  useElementDocumentScene,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { documentElementSlots } from '@src/renderer/elementKinds/runtime/documentElementOrder';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import type { SurfaceBundle } from '@src/renderer/elementKinds/runtime/ElementSurface';
import { useTranslation } from '@contexts/useTranslation';
import { calculateZoomAdjustedGridSize, snapToGrid } from '@hooks/Grid/utils';
import { useSettingsStore } from '@stores/useSettingsStore';
import { elementRotationTransform } from '@utils/element/rotation';
import {
  removeDocumentElements,
  setDocumentFrame,
} from './documentEditActions';
import { useDocumentFramePreviewStore } from './useDocumentFramePreviewStore';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

const EDITOR_INPUTS = {};
// 드래그로 보지 않는 움직임 (화면 px)
const DRAG_THRESHOLD = 3;

interface DocumentGridElementProps {
  sceneId: string;
  eraser: boolean;
  element: ElementNode;
  zIndex: number;
  zoom: number;
  onContextMenu: (event: React.MouseEvent, element: ElementNode) => void;
}

const DocumentGridElement = ({
  sceneId,
  eraser,
  element,
  zIndex,
  zoom,
  onContextMenu,
}: DocumentGridElementProps) => {
  const { t } = useTranslation();
  const preview = useDocumentFramePreviewStore(
    (state) => state.frames[element.id],
  );
  const selected = useDocumentSelectionStore(
    (state) =>
      state.sceneId === sceneId && state.selectedIds.includes(element.id),
  );
  const definition = elementKindDefinition(element.kind);
  const Render = definition?.render;
  const frame = preview ?? element.frame;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    // 지우개 도구 - 옛 종류 요소처럼 눌러서 지운다
    if (eraser) {
      useDocumentSelectionStore.getState().clear();
      void removeDocumentElements(sceneId, [element.id]);
      return;
    }
    useDocumentSelectionStore.getState().select(sceneId, element.id);
    const start = { x: event.clientX, y: event.clientY };
    const origin = element.frame;
    let moved = false;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const gridSize = calculateZoomAdjustedGridSize(
      zoom,
      useSettingsStore.getState().gridSettings?.gridSnapSize ?? 5,
    );
    const handleMove = (move: PointerEvent) => {
      const dx = move.clientX - start.x;
      const dy = move.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      useDocumentFramePreviewStore.getState().set(element.id, {
        ...origin,
        x: snapToGrid(origin.x + dx / zoom, gridSize),
        y: snapToGrid(origin.y + dy / zoom, gridSize),
      });
    };
    const handleUp = () => {
      target.removeEventListener('pointermove', handleMove);
      target.removeEventListener('pointerup', handleUp);
      target.removeEventListener('pointercancel', handleUp);
      const last = useDocumentFramePreviewStore.getState().frames[element.id];
      if (!moved || !last) {
        useDocumentFramePreviewStore.getState().clear(element.id);
        return;
      }
      void setDocumentFrame(sceneId, element.id, {
        x: last.x,
        y: last.y,
      }).finally(() =>
        useDocumentFramePreviewStore.getState().clear(element.id),
      );
    };
    target.addEventListener('pointermove', handleMove);
    target.addEventListener('pointerup', handleUp);
    target.addEventListener('pointercancel', handleUp);
  };

  return (
    <div
      className={element.className ?? undefined}
      data-element-kind={element.kind}
      data-element-id={element.id}
      data-selected={selected ? 'true' : undefined}
      onPointerDown={handlePointerDown}
      onContextMenu={(event) => onContextMenu(event, element)}
      style={{
        position: 'absolute',
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height,
        zIndex,
        transform: elementRotationTransform(frame.rotation),
        cursor: 'move',
      }}
    >
      {Render ? (
        <Render
          element={preview ? { ...element, frame } : element}
          // 규칙표로 검사한 값 - 종류 정의의 값 타입과 같다
          values={(element.values ?? {}) as never}
          bundles={{ surface: element.bundles?.surface as SurfaceBundle }}
          live={false}
          inputs={EDITOR_INPUTS}
        />
      ) : (
        // 모르는 종류(플러그인을 지움 등) - 옮기기·크기·삭제만 된다
        <div className="absolute inset-0 flex items-center justify-center rounded-md border border-dashed border-fg-muted text-fg-muted text-label">
          {t('elementKinds.unknownKind')}
        </div>
      )}
    </div>
  );
};

interface DocumentGridLayerProps {
  sceneId: string;
  activeTool: string;
  // bottom: 아래에 옛 종류 요소가 없는 요소 - 옛 요소보다 먼저 그리는 자리에 둔다
  placement: 'bottom' | 'stacked';
  zoom: number;
  onElementContextMenu: (event: React.MouseEvent, element: ElementNode) => void;
}

/** 편집 화면 - 트리 문서에만 있는 종류를 미리보기 상태로 그리고 고르고 옮긴다 */
const DocumentGridLayer = ({
  sceneId,
  activeTool,
  placement,
  zoom,
  onElementContextMenu,
}: DocumentGridLayerProps) => {
  useEffect(() => {
    void loadElementDocumentStore().catch((error) =>
      console.error('[ElementDocument] failed to load', error),
    );
  }, []);
  const scene = useElementDocumentScene(sceneId);
  return (
    <>
      {documentElementSlots(scene)
        .filter(({ aboveLegacy }) => aboveLegacy === (placement === 'stacked'))
        .map(({ element, zIndex }) => (
          <DocumentGridElement
            key={element.id}
            sceneId={sceneId}
            eraser={activeTool === 'eraser'}
            element={element}
            zIndex={zIndex}
            zoom={zoom}
            onContextMenu={onElementContextMenu}
          />
        ))}
    </>
  );
};

export default DocumentGridLayer;
