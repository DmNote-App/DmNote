import { reportElementOpError } from '@src/renderer/editor/runtime/intent/elementIntent';
import { sendBridgeMessageBestEffort } from '@utils/plugin/bridgeMessages';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCommittedApplyStore } from '@stores/data/useCommittedApplyStore';
import {
  isHistoryEditorFlushLocked,
  subscribeHistoryEditorFlushStart,
} from '@src/renderer/editor/runtime/lifecycle/historyEditorFlushLock';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { useSmartGuidesStore } from '@stores/grid/useSmartGuidesStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import type { SelectedElement } from '@stores/grid/useGridSelectionStore';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import type { ElementBounds } from '@utils/grid/smartGuides';
import { setPluginElementFrames } from '@plugins/runtime/displayElement/pluginTreeGeometry';
import {
  calculateResizePreviewPlan,
  type ResizeBounds,
  type ResizeHandle,
  type ResizePreviewBounds,
  type ResizePreviewPolicy,
} from './resizePreviewPlan';

// 그룹 리사이즈용 요소 bounds
interface GroupElementBounds {
  element: SelectedElement;
  bounds: ResizeBounds;
}

// 그룹 리사이즈 결과
interface GroupResizeResult {
  groupBounds: ResizeBounds;
  elementBounds: GroupElementBounds[];
  handle: ResizeHandle;
}

interface UseGridResizeOptions {
  selectedElements: SelectedElement[];
  selectedKeyType: string;
  getOtherElements?: (excludeId: string) => ElementBounds[];
}

/**
 * 그리드에서 런타임 플러그인 요소(트리에 노드가 없는 요소) 리사이즈를 처리하는 훅 - 옛 선택에는 이 요소만
 * 남는다(트리 요소는 문서 선택 오버레이가 맡는다).
 * 드래그 중에는 프리뷰 bounds만 업데이트하고, 드래그 종료 시 실제 크기를 적용하여
 * 시각적 흔들림을 방지합니다.
 */
export function useGridResize({
  selectedElements,
  selectedKeyType,
  getOtherElements,
}: UseGridResizeOptions) {
  const resizeStartRef = useRef(false);
  const resizeGestureIdRef = useRef<string | null>(null);
  // 드래그 중 프리뷰 bounds (드래그 중일 때만 값이 있음)
  const [previewBounds, setPreviewBounds] = useState<ResizeBounds | null>(null);
  // 최종 적용할 bounds를 저장 (드래그 종료 시 사용)
  const finalBoundsRef = useRef<ResizeBounds | null>(null);
  const frozenResizeTargetsRef = useRef<Array<{ type: string; id: string }>>(
    [],
  );

  // 그룹 리사이즈용 상태
  const [previewGroupBounds, setPreviewGroupBounds] =
    useState<ResizeBounds | null>(null);
  const [previewElementBounds, setPreviewElementBounds] = useState<
    GroupElementBounds[] | null
  >(null);
  const finalGroupBoundsRef = useRef<{
    groupBounds: ResizeBounds;
    elementBounds: GroupElementBounds[];
  } | null>(null);

  // plugin-only·혼합 완료의 오버레이 동기화 - editor 커밋과 분리
  const syncPluginElementsToOverlay = () => {
    sendBridgeMessageBestEffort('overlay', 'plugin:displayElements:sync', {
      elements: usePluginDisplayElementStore.getState().elements,
    });
  };

  const endResizeGesture = useCallback(() => {
    resizeGestureIdRef.current = null;
  }, []);

  // 플러그인 요소 최종 위치·크기 - 인스턴스는 트리 노드 틀로, 런타임 요소는 런타임 스토어에서 (같은 동작 id)
  const commitPluginBounds = (
    updates: ReadonlyArray<{ id: string; bounds: ResizeBounds }>,
  ) => {
    if (updates.length === 0) return;
    setPluginElementFrames(
      selectedKeyType,
      new Map(
        updates.map(({ id, bounds }) => [
          id,
          {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          },
        ]),
      ),
      resizeGestureIdRef.current ?? undefined,
    ).catch(reportElementOpError);
  };

  // history 적용·flush 시작이 끼어들면 진행 중 리사이즈를 커밋 없이 버린다 -
  // 되돌아간 문서 위에 마지막 프리뷰를 다시 쓰지 않게
  const cancelResize = useCallback(() => {
    resizeStartRef.current = false;
    frozenResizeTargetsRef.current = [];
    finalBoundsRef.current = null;
    finalGroupBoundsRef.current = null;
    setPreviewBounds(null);
    setPreviewGroupBounds(null);
    setPreviewElementBounds(null);
    useGridSelectionStore.getState().setResizing(false);
    useSmartGuidesStore.getState().clearGuides();
    endResizeGesture();
  }, [endResizeGesture]);

  useEffect(
    () =>
      useCommittedApplyStore.subscribe((state, previous) => {
        if (
          state.historyTick === previous.historyTick ||
          !resizeStartRef.current
        )
          return;
        cancelResize();
      }),
    [cancelResize],
  );

  useEffect(
    () =>
      subscribeHistoryEditorFlushStart(() => {
        if (resizeStartRef.current) cancelResize();
      }),
    [cancelResize],
  );

  useEffect(
    () => () => {
      if (resizeStartRef.current) {
        resizeStartRef.current = false;
        useGridSelectionStore.getState().setResizing(false);
      }
      endResizeGesture();
    },
    [endResizeGesture],
  );

  const handleResizeStart = (_handle?: ResizeHandle) => {
    if (resizeStartRef.current || isHistoryEditorFlushLocked()) return;
    resizeStartRef.current = true;
    const gestureId = crypto.randomUUID();
    resizeGestureIdRef.current = gestureId;
    // 시작 대상 동결 - 완료 시 live 선택을 다시 읽으면 리사이즈 중 같은
    // 개수의 다른 선택으로 바뀐 경우 남의 요소에 bounds가 적용된다
    frozenResizeTargetsRef.current = selectedElements.map((element) => ({
      type: element.type,
      id: element.id,
    }));

    // 기존 스마트 가이드 클리어
    useSmartGuidesStore.getState().clearGuides();

    // 리사이즈 시작 시 애니메이션 비활성화
    useGridSelectionStore.getState().setResizing(true);
  };

  const handleResizePreview = (
    elementId: string,
    newBounds: ResizePreviewBounds,
    policy: ResizePreviewPolicy,
  ) => {
    const gridSettings = useSettingsStore.getState().gridSettings;
    const alignmentGuidesEnabled = gridSettings?.alignmentGuides !== false;
    const otherElements =
      !newBounds.suppressSmartSnap && alignmentGuidesEnabled && getOtherElements
        ? getOtherElements(elementId)
        : undefined;
    const plan = calculateResizePreviewPlan({
      elementId,
      newBounds,
      otherElements,
      settings: {
        alignmentGuidesEnabled,
        spacingGuidesEnabled: gridSettings?.spacingGuides !== false,
        sizeMatchGuidesEnabled: gridSettings?.sizeMatchGuides !== false,
        gridSnapSize: gridSettings?.gridSnapSize ?? 5,
      },
      policy,
    });

    const smartGuidesStore = useSmartGuidesStore.getState();
    if (plan.guideUpdate.kind === 'clear') {
      smartGuidesStore.clearGuides();
    } else if (plan.guideUpdate.kind === 'set') {
      smartGuidesStore.setDraggedBounds(plan.guideUpdate.draggedBounds);
      smartGuidesStore.setActiveGuides(plan.guideUpdate.activeGuides);
      smartGuidesStore.setSpacingGuides(plan.guideUpdate.spacingGuides);
      smartGuidesStore.setSizeMatchGuides(plan.guideUpdate.sizeMatchGuides);
    }

    setPreviewBounds(plan.bounds);
    finalBoundsRef.current = plan.bounds;
  };
  // 리사이즈 핸들러 - 프리뷰 모드
  const handleResize = (newBounds: ResizePreviewBounds) => {
    if (!resizeStartRef.current || selectedElements.length !== 1) return;

    const frozenTarget = frozenResizeTargetsRef.current[0];
    if (frozenTarget?.type === 'plugin') {
      handleResizePreview(frozenTarget.id, newBounds, 'plugin');
    }
  };

  // 리사이즈 종료 처리 - 실제 요소에 최종 bounds 적용
  const handleResizeComplete = () => {
    if (!resizeStartRef.current) return;
    if (isHistoryEditorFlushLocked()) {
      cancelResize();
      return;
    }
    resizeStartRef.current = false;

    // 스마트 가이드 클리어
    useSmartGuidesStore.getState().clearGuides();

    // 리사이즈 종료 시 애니메이션 복원
    useGridSelectionStore.getState().setResizing(false);

    // 최종 bounds를 시작 시 동결한 요소에 적용 (live 선택 재조회 금지)
    const finalBounds = finalBoundsRef.current;
    const frozenTargets = frozenResizeTargetsRef.current;
    frozenResizeTargetsRef.current = [];
    if (
      finalBounds &&
      frozenTargets.length === 1 &&
      frozenTargets[0].type === 'plugin'
    ) {
      commitPluginBounds([{ id: frozenTargets[0].id, bounds: finalBounds }]);
    }

    // 프리뷰 상태 클리어
    setPreviewBounds(null);
    finalBoundsRef.current = null;

    // 정산은 시작 시 동결한 구성으로 여기서 완결 - 완료 시점 live 선택을
    // 읽는 외부 콜백 금지. plugin이 움직였으면 오버레이만 동기화
    // (plugin-only는 editor 무커밋 계약)
    if (frozenTargets.some((target) => target.type === 'plugin')) {
      syncPluginElementsToOverlay();
    }
    endResizeGesture();
  };

  // 그룹 리사이즈 핸들러 - 프리뷰 모드
  const handleGroupResize = (result: GroupResizeResult) => {
    if (!resizeStartRef.current) return;
    setPreviewGroupBounds(result.groupBounds);
    setPreviewElementBounds(result.elementBounds);
    finalGroupBoundsRef.current = {
      groupBounds: result.groupBounds,
      elementBounds: result.elementBounds,
    };
  };

  // 그룹 리사이즈 완료 처리 - 실제 요소들에 최종 bounds 적용
  const handleGroupResizeComplete = () => {
    if (!resizeStartRef.current) return;
    if (isHistoryEditorFlushLocked()) {
      cancelResize();
      return;
    }
    resizeStartRef.current = false;
    frozenResizeTargetsRef.current = [];

    // 스마트 가이드 클리어
    useSmartGuidesStore.getState().clearGuides();

    // 리사이즈 종료 시 애니메이션 복원
    useGridSelectionStore.getState().setResizing(false);

    // 시작 시 동결된 entries(elementBounds)에 프리뷰 값을 그대로 (스냅은 이미 드래그 중에 적용됨)
    const pluginUpdates = (finalGroupBoundsRef.current?.elementBounds ?? [])
      .filter(({ element }) => element.type === 'plugin')
      .map(({ element, bounds }) => ({ id: element.id, bounds }));
    commitPluginBounds(pluginUpdates);
    const pluginInvolved = pluginUpdates.length > 0;

    // 프리뷰 상태 클리어
    setPreviewGroupBounds(null);
    setPreviewElementBounds(null);
    finalGroupBoundsRef.current = null;

    if (pluginInvolved) {
      syncPluginElementsToOverlay();
    }
    endResizeGesture();
  };

  return {
    handleResizeStart,
    handleResize,
    handleResizeComplete,
    previewBounds,
    // 그룹 리사이즈 관련
    handleGroupResize,
    handleGroupResizeComplete,
    previewGroupBounds,
    previewElementBounds,
  };
}
