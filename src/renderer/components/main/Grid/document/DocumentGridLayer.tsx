import React, { useEffect } from 'react';

import { useCommittedApplyStore } from '@stores/data/useCommittedApplyStore';
import {
  isHistoryEditorFlushLocked,
  subscribeHistoryEditorFlushStart,
} from '@src/renderer/editor/runtime/lifecycle/historyEditorFlushLock';
import {
  useGridSelectionStore,
  type SelectedElement,
} from '@stores/grid/useGridSelectionStore';
import { readAuthorityPositions } from '@src/renderer/editor/model/elementStores';
import { keepOtherSelection } from '@stores/grid/keepOtherSelection';
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
import { getOtherElementBounds } from '@hooks/Grid/drag/useSmartGuidesElements';
import { calculateZoomAdjustedGridSize } from '@hooks/Grid/utils';
import { useSmartGuidesStore } from '@stores/grid/useSmartGuidesStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { isMac } from '@utils/core/platform';
import { elementRotationTransform } from '@utils/element/rotation';
import {
  moveDocumentElements,
  removeDocumentElements,
} from './documentEditActions';
import { documentDragSnap } from './documentDragSnap';
import { expandDocumentGroup, legacyGroupMembersOf } from './documentGroups';
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
  mixedDrag?: MixedDragLifecycle;
}

const DocumentGridElement = ({
  sceneId,
  eraser,
  element,
  zIndex,
  zoom,
  onContextMenu,
  mixedDrag,
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
      // 넣고 빼기 - 옛 종류 선택을 지킨다
      keepOtherSelection(() =>
        selection.setSelection(sceneId, toggleDocumentId(current, element.id)),
      );
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
    // 고른 요소를 누르면 선택을 지킨 채 함께 옮긴다. 트리 그룹 안 요소는 그룹째 고른다.
    // 옛 그룹 안이면(트리로 옮긴 옛 종류) 그 그룹의 옛 종류 멤버도 옛 선택으로 함께 고른다
    const legacyGroup = current.includes(element.id)
      ? null
      : legacyGroupMembersOf(store?.getScene(sceneId), element.id);
    const ids = current.includes(element.id)
      ? current
      : legacyGroup
      ? legacyGroup.treeIds
      : expandDocumentGroup(store?.getScene(sceneId), element.id);
    if (ids !== current) selection.setSelection(sceneId, ids);
    if (legacyGroup && legacyGroup.legacy.length > 0) {
      keepOtherSelection(() =>
        useGridSelectionStore.getState().setSelectedElements(
          legacyGroup.legacy.flatMap(({ kind, id }) => {
            const index = (
              (readAuthorityPositions(kind)[sceneId] ?? []) as Array<{
                id: string;
              }>
            ).findIndex((position) => position.id === id);
            return index >= 0
              ? [{ type: kind, id, index } as SelectedElement]
              : [];
          }),
        ),
      );
    }
    const origins = ids.flatMap((id) => {
      const frame = store?.getElement(sceneId, id)?.frame;
      return frame ? [{ id, frame }] : [];
    });
    // 옛 종류 요소도 함께 골랐으면 옛 끌기 수명 주기로 둘 다 옮긴다 (트리 요소는 그 안의 영수증이)
    const legacySelected = useGridSelectionStore
      .getState()
      .selectedElements.map(({ id }) => id);
    const mixed = legacySelected.length > 0 ? mixedDrag : undefined;
    let endMixed: ((commit?: boolean) => void) | null = null;
    let lastOffset = { x: 0, y: 0 };
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const gridSize = calculateZoomAdjustedGridSize(
      zoom,
      useSettingsStore.getState().gridSettings?.gridSnapSize ?? 5,
    );
    // 옛 종류 다중 끌기와 같은 맞추기 - 다른 요소 가장자리, 안 붙는 축은 격자
    const others = getOtherElementBounds([
      ...origins.map(({ id }) => id),
      ...(mixed ? legacySelected : []),
    ]);
    const handleMove = (move: PointerEvent) => {
      const dx = move.clientX - start.x;
      const dy = move.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!moved && mixed) {
        const end = mixed.begin();
        endMixed = typeof end === 'function' ? end : null;
        useGridSelectionStore.getState().setDraggingOrResizing(true);
      }
      moved = true;
      const settings = useSettingsStore.getState().gridSettings;
      // 플랫폼 보조키로 스마트 맞추기 잠시 끄기 (격자 맞추기는 그대로)
      const suppress = isMac() ? move.metaKey : move.ctrlKey;
      const snap = documentDragSnap({
        origins,
        selfId: element.id,
        dx: dx / zoom,
        dy: dy / zoom,
        others,
        gridSize,
        alignment: settings?.alignmentGuides !== false && !suppress,
        spacing: settings?.spacingGuides !== false,
      });
      const guides = useSmartGuidesStore.getState();
      if (snap.guides) {
        guides.setDraggedBounds(snap.guides.dragged);
        guides.setActiveGuides(snap.guides.active);
        guides.setSpacingGuides(snap.guides.spacing);
      } else {
        guides.clearGuides();
      }
      if (mixed) {
        mixed.move(snap.offsetX - lastOffset.x, snap.offsetY - lastOffset.y);
        lastOffset = { x: snap.offsetX, y: snap.offsetY };
        return;
      }
      const preview = useDocumentFramePreviewStore.getState();
      for (const { id, frame } of origins) {
        preview.set(id, {
          ...frame,
          x: frame.x + snap.offsetX,
          y: frame.y + snap.offsetY,
        });
      }
    };
    let ended = false;
    // commit=false - 되돌리기·히스토리 정산이 끼어들면 옮긴 것을 버린다 (옛 종류 끌기와 같다)
    const finish = (commit: boolean) => {
      if (ended) return;
      ended = true;
      unsubscribeHistory();
      unsubscribeFlush();
      useSmartGuidesStore.getState().clearGuides();
      target.removeEventListener('pointermove', handleMove);
      target.removeEventListener('pointerup', handleUp);
      target.removeEventListener('pointercancel', handleUp);
      commit = commit && !isHistoryEditorFlushLocked();
      if (mixed) {
        if (!moved) return;
        useGridSelectionStore.getState().setDraggingOrResizing(false);
        try {
          if (commit) mixed.commit();
        } finally {
          endMixed?.(commit);
        }
        return;
      }
      const frames = useDocumentFramePreviewStore.getState().frames;
      const moves =
        moved && commit
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
    const handleUp = () => finish(true);
    const unsubscribeHistory = useCommittedApplyStore.subscribe(
      (state, previous) => {
        if (state.historyTick !== previous.historyTick) finish(false);
      },
    );
    const unsubscribeFlush = subscribeHistoryEditorFlushStart(() =>
      finish(false),
    );
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
          selected={selected}
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
  // 옛 종류 요소와 섞인 선택 끌기 - Grid의 선택 끌기 수명 주기
  mixedDrag?: MixedDragLifecycle;
}

export interface MixedDragLifecycle {
  begin: () => void | ((commit?: boolean) => void);
  move: (deltaX: number, deltaY: number) => void;
  commit: () => void;
}

/** 편집 화면 - 트리 문서에만 있는 종류를 미리보기 상태로 그리고 고르고 옮긴다 */
const DocumentGridLayer = ({
  sceneId,
  activeTool,
  placement,
  zoom,
  onElementContextMenu,
  mixedDrag,
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
            mixedDrag={mixedDrag}
          />
        ))}
    </>
  );
};

export default DocumentGridLayer;
