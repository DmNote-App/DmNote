// 트리 선택 끌기 - 누른 요소에서 시작해 고른 트리 요소(플러그인 요소 포함)를 틀 미리보기로 옮기고, 놓으면
// 한 커밋으로 저장한다. 트리 요소·플러그인 요소의 누르기가 함께 쓴다. 트리에 없는 런타임 플러그인 요소까지
// 골랐으면 옛 끌기 수명 주기로 함께 옮긴다(트리 요소는 그 안의 영수증이)
import { useCommittedApplyStore } from '@stores/data/useCommittedApplyStore';
import {
  isHistoryEditorFlushLocked,
  subscribeHistoryEditorFlushStart,
} from '@src/renderer/editor/runtime/lifecycle/historyEditorFlushLock';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { getOtherElementBounds } from '@hooks/Grid/drag/useSmartGuidesElements';
import { calculateZoomAdjustedGridSize } from '@hooks/Grid/utils';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useSmartGuidesStore } from '@stores/grid/useSmartGuidesStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { isMac } from '@utils/core/platform';
import { moveDocumentElements } from './documentEditActions';
import { documentDragSnap } from './documentDragSnap';
import { useDocumentFramePreviewStore } from '@stores/grid/useDocumentFramePreviewStore';

// 드래그로 보지 않는 움직임 (화면 px)
export const DRAG_THRESHOLD = 3;

export interface MixedDragLifecycle {
  begin: () => void | ((commit?: boolean) => void);
  move: (deltaX: number, deltaY: number) => void;
  commit: () => void;
}

interface DocumentSelectionDragOptions {
  sceneId: string;
  // 누른 요소 - 맞추기 기준
  selfId: string;
  ids: readonly string[];
  event: {
    clientX: number;
    clientY: number;
    pointerId: number;
    currentTarget: Element;
  };
  zoom: number;
  // 트리에 없는 런타임 플러그인 요소와 섞인 선택 끌기 - Grid의 선택 끌기 수명 주기
  mixedDrag?: MixedDragLifecycle;
  // 끝났을 때 - 옮겼으면 true (누르기만 했으면 클릭으로 본다)
  onEnd?: (moved: boolean) => void;
}

export const startDocumentSelectionDrag = ({
  sceneId,
  selfId,
  ids,
  event,
  zoom,
  mixedDrag,
  onEnd,
}: DocumentSelectionDragOptions) => {
  const store = getElementDocumentStore();
  const origins = ids.flatMap((id) => {
    const frame = store?.getElement(sceneId, id)?.frame;
    return frame ? [{ id, frame }] : [];
  });
  const legacySelected = useDocumentSelectionStore
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
      selfId,
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
    onEnd?.(moved);
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
