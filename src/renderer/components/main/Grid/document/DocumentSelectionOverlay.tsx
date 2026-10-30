'use no memo';
// 트리 스토어·옛 위치(모듈 상태)를 렌더 중에 읽어 손잡이 틀을 만든다 - 컴파일러 메모 제외
import React, { useEffect, useRef, useState } from 'react';

import { useLegacyPreviewFrame } from '@src/renderer/elementKinds/runtime/useLegacyPreviewFrame';
import { useCommittedApplyStore } from '@stores/data/useCommittedApplyStore';
import { subscribeHistoryEditorFlushStart } from '@src/renderer/editor/runtime/lifecycle/historyEditorFlushLock';
import {
  getElementDocumentStore,
  useDocumentElement,
  useElementDocumentScene,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import { getOtherElementBounds } from '@hooks/Grid/drag/useSmartGuidesElements';
import { calculateResizePreviewPlan } from '@hooks/Grid/resize/resizePreviewPlan';
import { useSmartGuidesStore } from '@stores/grid/useSmartGuidesStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import CanvasRotateHandle from '../handles/CanvasRotateHandle';
import ResizeHandles from '../handles/ResizeHandles';
import { useGradientEditStore } from '@stores/grid/useGradientEditStore';
import { useSpritePoseHandleStore } from '@stores/grid/useSpritePoseHandleStore';
import { SELECTION_BORDER_WIDTH } from '../handles/selectionOutline';
import { editDocument, setDocumentFrame } from './documentEditActions';
import { clampGroupResize, scaleDocumentFrames } from './documentGroupResize';
import { startDocumentRotation } from './documentRotation';
import {
  documentRotationEntries,
  documentSelectionFrame,
  startDocumentGroupRotation,
} from './documentGroupRotation';
import { useDocumentFramePreviewStore } from './useDocumentFramePreviewStore';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

interface DocumentSelectionOverlayProps {
  sceneId: string;
  zoom: number;
  panX: number;
  panY: number;
}

interface SelectionItemProps extends DocumentSelectionOverlayProps {
  id: string;
  // 하나만 골랐을 때만 크기 조절 핸들
  withHandles: boolean;
}

const EMPTY_IDS: string[] = [];

// 크기 조절 중 되돌리기·히스토리 정산이 끼면 미리보기를 버리고 커밋하지 않는다 (옛 종류와 같다)
const useResizeCancellation = (onCancel: () => void) => {
  const cancelledRef = useRef(false);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });
  useEffect(() => {
    const cancel = () => {
      cancelledRef.current = true;
      onCancelRef.current();
    };
    const unsubscribeHistory = useCommittedApplyStore.subscribe(
      (state, previous) => {
        if (state.historyTick !== previous.historyTick) cancel();
      },
    );
    const unsubscribeFlush = subscribeHistoryEditorFlushStart(cancel);
    return () => {
      unsubscribeHistory();
      unsubscribeFlush();
    };
  }, []);
  return {
    isCancelled: () => cancelledRef.current,
    // 새 크기 조절을 시작할 때
    reset: () => {
      cancelledRef.current = false;
    },
  };
};

/** 고른 요소 하나의 윤곽(과 핸들) */
const SelectionItem = ({
  sceneId,
  id,
  withHandles,
  zoom,
  panX,
  panY,
}: SelectionItemProps) => {
  const element = useDocumentElement(sceneId, id);
  const preview = useDocumentFramePreviewStore((state) => state.frames[id]);
  const resizeCancelled = useResizeCancellation(() => {
    useSmartGuidesStore.getState().clearGuides();
    useDocumentFramePreviewStore.getState().clear(id);
  });
  // 트리로 옮긴 옛 종류는 옛 패널 미리보기의 위치·크기·회전도 따른다
  const legacyPreview = useLegacyPreviewFrame(element, sceneId);
  // 되돌리기·다른 창 편집으로 고른 요소가 없어지면 선택에서 뺀다
  const missing = !element && !!getElementDocumentStore();
  useEffect(() => {
    if (!missing) return;
    const selection = useDocumentSelectionStore.getState();
    if (selection.sceneId !== sceneId) return;
    selection.setSelection(
      sceneId,
      selection.selectedIds.filter((other) => other !== id),
    );
  }, [missing, sceneId, id]);
  if (!element) return null;
  const frame = preview ?? legacyPreview ?? element.frame;
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
      {withHandles && (
        <ResizeHandles
          bounds={bounds}
          previewBounds={preview ?? null}
          zoom={zoom}
          panX={panX}
          panY={panY}
          elementId={element.id}
          lockAspect={lockAspect}
          occupiedHandle={
            definition?.occupiedResizeHandle?.(element, sceneId) ?? null
          }
          rotation={frame.rotation}
          onResize={(result) => {
            if (resizeCancelled.isCancelled()) return;
            // 옛 종류 크기 조절(useGridResize)과 같은 맞추기 - 가장자리·간격·크기 일치
            const settings = useSettingsStore.getState().gridSettings;
            const alignment = settings?.alignmentGuides !== false;
            const plan = calculateResizePreviewPlan({
              elementId: element.id,
              newBounds: result,
              otherElements:
                !result.suppressSmartSnap && alignment
                  ? getOtherElementBounds(element.id)
                  : undefined,
              settings: {
                alignmentGuidesEnabled: alignment,
                spacingGuidesEnabled: settings?.spacingGuides !== false,
                sizeMatchGuidesEnabled: settings?.sizeMatchGuides !== false,
                gridSnapSize: settings?.gridSnapSize ?? 5,
              },
              policy: 'native',
            });
            const guides = useSmartGuidesStore.getState();
            if (plan.guideUpdate.kind === 'clear') {
              guides.clearGuides();
            } else if (plan.guideUpdate.kind === 'set') {
              guides.setDraggedBounds(plan.guideUpdate.draggedBounds);
              guides.setActiveGuides(plan.guideUpdate.activeGuides);
              guides.setSpacingGuides(plan.guideUpdate.spacingGuides);
              guides.setSizeMatchGuides(plan.guideUpdate.sizeMatchGuides);
            }
            useDocumentFramePreviewStore.getState().set(element.id, {
              ...element.frame,
              ...plan.bounds,
            });
          }}
          onResizeStart={() => {
            resizeCancelled.reset();
          }}
          onResizeEnd={() => {
            useSmartGuidesStore.getState().clearGuides();
            const last =
              useDocumentFramePreviewStore.getState().frames[element.id];
            if (!last || resizeCancelled.isCancelled()) return;
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
      )}
      {withHandles && definition?.rotatable !== false && (
        <CanvasRotateHandle
          bounds={bounds}
          rotation={frame.rotation}
          zoom={zoom}
          panX={panX}
          panY={panY}
          sessionKey={`document:${element.id}`}
          start={() =>
            startDocumentRotation(sceneId, element.id, element.frame)
          }
        />
      )}
    </>
  );
};

/** 여러 트리 요소의 묶음 회전 손잡이 - 시작 시점의 요소 위치로 선택틀을 잡는다 */
const DocumentGroupRotateHandle = ({
  sceneId,
  ids,
  zoom,
  panX,
  panY,
}: DocumentSelectionOverlayProps & { ids: readonly string[] }) => {
  const scene = useElementDocumentScene(sceneId);
  const { entries, rotatable } = documentRotationEntries(scene, ids);
  const frame = documentSelectionFrame(entries);
  if (!scene || !frame || !rotatable || entries.length < 2) return null;
  return (
    <CanvasRotateHandle
      kind="selection"
      bounds={frame.bounds}
      rotation={frame.rotation}
      zoom={zoom}
      panX={panX}
      panY={panY}
      sessionKey={`document-selection:${ids.join(',')}`}
      start={() => startDocumentGroupRotation(sceneId, entries, frame)}
    />
  );
};

/** 여러 트리 요소의 묶음 크기 조절 - 회전 없는 요소만 고른 경우 (옛 종류도 회전 섞인 선택은 닫는다) */
const DocumentGroupResizeHandles = ({
  sceneId,
  ids,
  zoom,
  panX,
  panY,
}: DocumentSelectionOverlayProps & { ids: readonly string[] }) => {
  useElementDocumentScene(sceneId);
  const [preview, setPreview] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const resizeCancelled = useResizeCancellation(() => {
    useSmartGuidesStore.getState().clearGuides();
    setPreview(null);
    const frames = useDocumentFramePreviewStore.getState();
    for (const id of ids) frames.clear(id);
  });
  const store = getElementDocumentStore();
  const entries = ids.flatMap((id) => {
    const element = store?.getElement(sceneId, id);
    return element ? [{ id, frame: element.frame }] : [];
  });
  const selection = documentSelectionFrame(entries);
  if (
    !selection ||
    entries.length < 2 ||
    entries.some(({ frame }) => frame.rotation !== 0)
  ) {
    return null;
  }
  const from = selection.bounds;
  return (
    <ResizeHandles
      bounds={from}
      previewBounds={preview}
      zoom={zoom}
      panX={panX}
      panY={panY}
      elementId="document-group"
      rotation={0}
      // 비율을 지키는 요소가 하나라도 있으면 묶음도 비율을 지킨다
      lockAspect={ids.some((id) => {
        const element = store?.getElement(sceneId, id);
        return (
          !!element &&
          (elementKindDefinition(element.kind)?.lockAspect?.(
            (element.values ?? {}) as never,
          ) ??
            false)
        );
      })}
      onResizeStart={() => {
        resizeCancelled.reset();
      }}
      onResize={(result) => {
        if (resizeCancelled.isCancelled()) return;
        // 옛 종류 묶음 크기 조절과 같은 맞추기 - 다른 요소 가장자리·간격·크기 일치
        const settings = useSettingsStore.getState().gridSettings;
        const alignment = settings?.alignmentGuides !== false;
        const plan = calculateResizePreviewPlan({
          elementId: 'document-group',
          newBounds: result,
          otherElements:
            !result.suppressSmartSnap && alignment
              ? getOtherElementBounds([...ids])
              : undefined,
          settings: {
            alignmentGuidesEnabled: alignment,
            spacingGuidesEnabled: settings?.spacingGuides !== false,
            sizeMatchGuidesEnabled: settings?.sizeMatchGuides !== false,
            gridSnapSize: settings?.gridSnapSize ?? 5,
          },
          policy: 'native',
        });
        const guides = useSmartGuidesStore.getState();
        if (plan.guideUpdate.kind === 'clear') {
          guides.clearGuides();
        } else if (plan.guideUpdate.kind === 'set') {
          guides.setDraggedBounds(plan.guideUpdate.draggedBounds);
          guides.setActiveGuides(plan.guideUpdate.activeGuides);
          guides.setSpacingGuides(plan.guideUpdate.spacingGuides);
          guides.setSizeMatchGuides(plan.guideUpdate.sizeMatchGuides);
        }
        // 요소가 최소 크기 아래로 줄지 않게 (옛 종류 묶음과 같다)
        const next = clampGroupResize(
          entries,
          from,
          plan.bounds,
          result.handle,
        );
        setPreview(next);
        const frames = useDocumentFramePreviewStore.getState();
        for (const { id, frame } of scaleDocumentFrames(entries, from, next)) {
          frames.set(id, frame);
        }
      }}
      onResizeEnd={() => {
        useSmartGuidesStore.getState().clearGuides();
        setPreview(null);
        if (resizeCancelled.isCancelled()) return;
        const frames = useDocumentFramePreviewStore.getState().frames;
        const ops = entries.flatMap(({ id }) =>
          frames[id]
            ? [
                {
                  op: 'setFrame' as const,
                  scene: sceneId,
                  id,
                  frame: {
                    x: frames[id].x,
                    y: frames[id].y,
                    width: frames[id].width,
                    height: frames[id].height,
                  },
                },
              ]
            : [],
        );
        const clear = () => {
          const preview = useDocumentFramePreviewStore.getState();
          for (const { id } of entries) preview.clear(id);
        };
        if (ops.length === 0) return;
        void editDocument(ops).finally(clear);
      }}
    />
  );
};

/** 트리 요소 선택 윤곽과 크기 조절·회전 핸들 - 옛 종류 선택과 같은 모양 */
const DocumentSelectionOverlay = (props: DocumentSelectionOverlayProps) => {
  const ids = useDocumentSelectionStore((state) =>
    state.sceneId === props.sceneId ? state.selectedIds : EMPTY_IDS,
  );
  // 옛 종류 요소와 섞인 선택 - 한쪽만 돌리거나 늘리지 않게 손잡이를 닫는다
  const mixed = useGridSelectionStore(
    (state) => state.selectedElements.length > 0,
  );
  // 온캔버스 그라데이션·스프라이트 자세 편집 중에는 그 핸들이 맡는다 (옛 종류와 같다)
  const gradientSession = useGradientEditStore(
    (state) => state.session !== null,
  );
  const poseSession = useSpritePoseHandleStore(
    (state) => state.session !== null,
  );
  const handlesOpen = !mixed && !gradientSession && !poseSession;
  return (
    <>
      {ids.map((id) => (
        <SelectionItem
          key={id}
          {...props}
          id={id}
          withHandles={ids.length === 1 && handlesOpen}
        />
      ))}
      {ids.length > 1 && handlesOpen && (
        <>
          <DocumentGroupResizeHandles {...props} ids={ids} />
          <DocumentGroupRotateHandle {...props} ids={ids} />
        </>
      )}
    </>
  );
};

export default DocumentSelectionOverlay;
