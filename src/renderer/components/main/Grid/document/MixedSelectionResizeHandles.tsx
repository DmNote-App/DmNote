'use no memo';
// 트리 스토어·옛 위치(모듈 상태)를 렌더 중에 읽어 손잡이 틀을 만든다 - 컴파일러 메모 제외
import React, { useEffect, useRef, useState } from 'react';

import { getOtherElementBounds } from '@hooks/Grid/drag/useSmartGuidesElements';
import { calculateResizePreviewPlan } from '@hooks/Grid/resize/resizePreviewPlan';
import { useCommittedApplyStore } from '@stores/data/useCommittedApplyStore';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useSmartGuidesStore } from '@stores/grid/useSmartGuidesStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import {
  getElementDocumentStore,
  useElementDocumentScene,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import { readAuthorityPositions } from '@src/renderer/editor/model/elementStores';
import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import { subscribeHistoryEditorFlushStart } from '@src/renderer/editor/runtime/lifecycle/historyEditorFlushLock';
import { commitElementBoundsById } from '@src/renderer/editor/runtime/operations/elementGeometryOps';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import type { EditorElementTypeV1 } from '@src/types/editor';
import { PREVIEW_DOMAIN_BY_ELEMENT_TYPE } from '@src/types/preview';
import ResizeHandles from '../handles/ResizeHandles';
import { editDocument } from './documentEditActions';
import { clampGroupResize } from './documentGroupResize';
import { documentSelectionFrame } from './documentGroupRotation';
import { mixedResizeTargets } from './mixedGroupResize';
import { useDocumentFramePreviewStore } from './useDocumentFramePreviewStore';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

interface MixedSelectionResizeHandlesProps {
  sceneId: string;
  zoom: number;
  panX: number;
  panY: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const EMPTY_IDS: string[] = [];

const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

/** 옛 종류 요소와 트리 요소가 섞인 선택의 묶음 크기 조절 - 회전 없는 요소만.
 * 옛 종류는 편집 제스처 미리보기, 트리 요소는 위치 미리보기로 그리고 같은 동작 id로 커밋한다 */
const MixedSelectionResizeHandles = ({
  sceneId,
  zoom,
  panX,
  panY,
}: MixedSelectionResizeHandlesProps) => {
  const legacySelection = useGridSelectionStore(
    (state) => state.selectedElements,
  );
  const documentIds = useDocumentSelectionStore((state) =>
    state.sceneId === sceneId ? state.selectedIds : EMPTY_IDS,
  );
  useElementDocumentScene(sceneId);
  const [preview, setPreview] = useState<Box | null>(null);
  // 끝낼 때 커밋할 마지막 틀 - 손잡이가 시작 때 잡은 처리기여도 최신 값을 읽게
  const lastRef = useRef<Box | null>(null);
  const cancelledRef = useRef(false);
  // 크기 조절 중 되돌리기·히스토리 정산이 끼면 미리보기를 버리고 커밋하지 않는다
  const cancelRef = useRef<() => void>(() => {});
  useEffect(() => {
    cancelRef.current = () => {
      cancelledRef.current = true;
      lastRef.current = null;
      editGestureController.cancel();
      useSmartGuidesStore.getState().clearGuides();
      setPreview(null);
      const frames = useDocumentFramePreviewStore.getState();
      for (const id of documentIds) frames.clear(id);
    };
  });
  useEffect(() => {
    const unsubscribeHistory = useCommittedApplyStore.subscribe(
      (state, previous) => {
        if (state.historyTick !== previous.historyTick) cancelRef.current();
      },
    );
    const unsubscribeFlush = subscribeHistoryEditorFlushStart(() =>
      cancelRef.current(),
    );
    return () => {
      unsubscribeHistory();
      unsubscribeFlush();
    };
  }, []);

  if (legacySelection.length === 0 || documentIds.length === 0) return null;
  // 플러그인·스프라이트(그림 레이어 비율)는 옛 종류 섞인 묶음과 같이 열지 않는다
  if (
    legacySelection.some(
      (element) => element.type === 'plugin' || element.type === 'sprite',
    )
  ) {
    return null;
  }
  const legacy = legacySelection.flatMap((element) => {
    const type = element.type as EditorElementTypeV1;
    const position = (
      (readAuthorityPositions(type)[sceneId] ?? []) as Array<{
        id: string;
        dx: number;
        dy: number;
        width: number;
        height: number;
        rotation?: number | null;
      }>
    ).find(({ id }) => id === element.id);
    return position
      ? [
          {
            type,
            id: element.id,
            frame: {
              x: position.dx,
              y: position.dy,
              width: position.width,
              height: position.height,
              rotation: position.rotation ?? 0,
            },
          },
        ]
      : [];
  });
  const store = getElementDocumentStore();
  const documentEntries = documentIds.flatMap((id) => {
    const element = store?.getElement(sceneId, id);
    return element ? [{ id, frame: element.frame, element }] : [];
  });
  const all = [...legacy, ...documentEntries];
  // 회전이 섞이면 옛 종류처럼 닫는다
  if (
    legacy.length !== legacySelection.length ||
    documentEntries.length !== documentIds.length ||
    all.some(({ frame }) => frame.rotation !== 0)
  ) {
    return null;
  }
  const legacyFrame = documentSelectionFrame(legacy);
  const documentFrame = documentSelectionFrame(documentEntries);
  if (!legacyFrame || !documentFrame) return null;
  const from = union(legacyFrame.bounds, documentFrame.bounds);
  const lockAspect = documentEntries.some(
    ({ element }) =>
      elementKindDefinition(element.kind)?.lockAspect?.(
        (element.values ?? {}) as never,
      ) ?? false,
  );
  const selectedIds = all.map(({ id }) => id);

  return (
    <ResizeHandles
      bounds={from}
      previewBounds={preview}
      zoom={zoom}
      panX={panX}
      panY={panY}
      elementId="mixed-group"
      rotation={0}
      lockAspect={lockAspect}
      onResizeStart={() => {
        cancelledRef.current = false;
        lastRef.current = null;
      }}
      onResize={(result) => {
        if (cancelledRef.current) return;
        // 옛 종류 묶음 크기 조절과 같은 맞추기 - 다른 요소 가장자리·간격·크기 일치
        const settings = useSettingsStore.getState().gridSettings;
        const alignment = settings?.alignmentGuides !== false;
        const plan = calculateResizePreviewPlan({
          elementId: 'mixed-group',
          newBounds: result,
          otherElements:
            !result.suppressSmartSnap && alignment
              ? getOtherElementBounds(selectedIds)
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
        const next = clampGroupResize(all, from, plan.bounds, result.handle);
        setPreview(next);
        lastRef.current = next;
        const targets = mixedResizeTargets(legacy, documentEntries, from, next);
        for (const [type, entries] of targets.legacy) {
          editGestureController.preview(sceneId, entries, {
            domain: PREVIEW_DOMAIN_BY_ELEMENT_TYPE[type],
          });
        }
        const frames = useDocumentFramePreviewStore.getState();
        for (const { id, frame } of targets.document) frames.set(id, frame);
      }}
      onResizeEnd={() => {
        useSmartGuidesStore.getState().clearGuides();
        const last = lastRef.current;
        lastRef.current = null;
        setPreview(null);
        const clearDocument = () => {
          const frames = useDocumentFramePreviewStore.getState();
          for (const { id } of documentEntries) frames.clear(id);
        };
        if (cancelledRef.current || !last) {
          clearDocument();
          return;
        }
        const targets = mixedResizeTargets(legacy, documentEntries, from, last);
        // 옛 종류 크기 조절과 같은 동작 id - 되돌리기 한 번
        const gestureId = editGestureController.activeGestureId() ?? undefined;
        void editDocument(
          targets.document.map(({ id, frame }) => ({
            op: 'setFrame' as const,
            scene: sceneId,
            id,
            frame: {
              x: frame.x,
              y: frame.y,
              width: frame.width,
              height: frame.height,
            },
          })),
          { gestureId },
        ).finally(clearDocument);
        const intents = new Map(
          [...targets.legacy].map(([type, entries]) => [
            type,
            new Map(
              entries.map(({ id, patch }) => [
                id,
                patch as Record<string, unknown>,
              ]),
            ),
          ]),
        );
        const persisted = commitElementBoundsById(intents, gestureId);
        editGestureController.settleCommit(persisted);
        void persisted.catch((error) =>
          console.error('Failed to resize mixed selection', error),
        );
      }}
    />
  );
};

export default MixedSelectionResizeHandles;
