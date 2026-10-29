import React, { useEffect } from 'react';

import {
  getElementDocumentStore,
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
import { isMac } from '@utils/core/platform';
import { elementRotationTransform } from '@utils/element/rotation';
import {
  moveDocumentElements,
  removeDocumentElements,
} from './documentEditActions';
import { documentIdsInRange, toggleDocumentId } from './documentSelection';
import { useDocumentFramePreviewStore } from './useDocumentFramePreviewStore';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

const EDITOR_INPUTS = {};
const EMPTY_IDS: string[] = [];
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
    // macOS Ctrl 클릭은 보조 클릭 - 컨텍스트 메뉴에 맡긴다
    if (isMac() && event.ctrlKey) return;
    event.stopPropagation();
    // 지우개 도구 - 옛 종류 요소처럼 눌러서 지운다
    if (eraser) {
      useDocumentSelectionStore.getState().clear();
      void removeDocumentElements(sceneId, [element.id]);
      return;
    }
    const selection = useDocumentSelectionStore.getState();
    const current =
      selection.sceneId === sceneId ? selection.selectedIds : EMPTY_IDS;
    const store = getElementDocumentStore();
    // 보조키 클릭 - 넣고 빼기 (옛 종류 선택과 같은 키)
    const primaryModifier = isMac() ? event.metaKey : event.ctrlKey;
    if (primaryModifier) {
      selection.setSelection(sceneId, toggleDocumentId(current, element.id));
      return;
    }
    // Shift 클릭 - 기준 요소와 누른 요소 사이 범위
    if (event.shiftKey && current.length > 0) {
      selection.setSelection(
        sceneId,
        documentIdsInRange(store?.getScene(sceneId), current[0], element.id),
      );
      return;
    }
    // 고른 요소를 누르면 선택을 지킨 채 함께 옮긴다
    const ids = current.includes(element.id) ? current : [element.id];
    if (ids !== current) selection.select(sceneId, element.id);
    const origins = ids.flatMap((id) => {
      const frame = store?.getElement(sceneId, id)?.frame;
      return frame ? [{ id, frame }] : [];
    });
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const gridSize = calculateZoomAdjustedGridSize(
      zoom,
      useSettingsStore.getState().gridSettings?.gridSnapSize ?? 5,
    );
    // 누른 요소를 격자에 맞추고 나머지는 같은 만큼 옮긴다
    const self = origins.find(({ id }) => id === element.id)?.frame;
    const handleMove = (move: PointerEvent) => {
      const dx = move.clientX - start.x;
      const dy = move.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      if (!self) return;
      const offsetX = snapToGrid(self.x + dx / zoom, gridSize) - self.x;
      const offsetY = snapToGrid(self.y + dy / zoom, gridSize) - self.y;
      const preview = useDocumentFramePreviewStore.getState();
      for (const { id, frame } of origins) {
        preview.set(id, {
          ...frame,
          x: frame.x + offsetX,
          y: frame.y + offsetY,
        });
      }
    };
    const handleUp = () => {
      target.removeEventListener('pointermove', handleMove);
      target.removeEventListener('pointerup', handleUp);
      target.removeEventListener('pointercancel', handleUp);
      const frames = useDocumentFramePreviewStore.getState().frames;
      const moves = moved
        ? origins.flatMap(({ id }) =>
            frames[id] ? [{ id, x: frames[id].x, y: frames[id].y }] : [],
          )
        : [];
      const clear = () => {
        const preview = useDocumentFramePreviewStore.getState();
        for (const { id } of origins) preview.clear(id);
      };
      if (moves.length === 0) {
        clear();
        return;
      }
      void moveDocumentElements(sceneId, moves).finally(clear);
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
