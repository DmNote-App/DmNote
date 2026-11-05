import React, { useRef } from 'react';
import { isMac } from '@utils/core/platform';
import { useDraggable } from '@hooks/Grid';
import { useSelectionDrag } from '@hooks/Grid/drag/useSelectionDrag';
import { useSmartGuidesElements } from '@hooks/Grid';
import { useSettingsStore } from '@stores/useSettingsStore';
import {
  useGridSelectionStore,
  SelectedElement,
} from '@stores/grid/useGridSelectionStore';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { keepOtherSelection } from '@stores/grid/keepOtherSelection';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { openPropertiesPanelForSelection } from '@stores/grid/usePanelHostStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import {
  getElementDocumentStore,
  useDocumentElement,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import { groupSelectionOf } from '../../main/Grid/document/documentGroups';
import { documentRangeSelection } from '../../main/Grid/document/documentSelection';
import { moveDocumentElements } from '../../main/Grid/document/documentEditActions';
import {
  startDocumentSelectionDrag,
  type MixedDragLifecycle,
} from '../../main/Grid/document/documentSelectionDrag';
import { useDocumentFramePreviewStore } from '@stores/grid/useDocumentFramePreviewStore';
import {
  setSplitSelection,
  setStructureSelection,
} from '../../main/Grid/document/treeEditedSelection';
import { buildPluginElementStyle } from '@utils/plugin/layout/pluginElementLayout';
import { PluginElementFrame, type PluginElementProps } from './PluginElement';
import { usePluginElementPosition } from './usePluginElementPosition';
import { usePluginElementView } from './usePluginElementView';
import { usePluginElementContextMenu } from './usePluginElementContextMenu';

// 편집 화면의 플러그인 요소 - 그리기(PluginElement)에 끌기·선택·클릭·더블클릭·메뉴를 얹는다.
// 메인 창 전용이라 오버레이 번들에 들지 않는다 (Grid가 렌더러에 넘긴다)

// 그룹 멤버면 가장 바깥 그룹 전체 - 플러그인 요소는 옛 선택, 나머지는 트리 선택
const selectGroupOf = (fullId: string) => {
  const sceneId = useKeyStore.getState().selectedKeyType;
  const store = getElementDocumentStore();
  // 트리에 아직 없는 요소(만든 직후·스크립트 표시 요소)는 그 요소만
  if (!store?.getElement(sceneId, fullId)) {
    useDocumentSelectionStore
      .getState()
      .setSelectedElements([{ type: 'plugin', id: fullId }]);
    return;
  }
  setStructureSelection(
    sceneId,
    groupSelectionOf(store.getScene(sceneId), fullId),
  );
};

const DEFAULT_POSITION_OFFSET = { x: 0, y: 0 };
const EMPTY_SELECTED_ELEMENTS: SelectedElement[] = [];

export interface EditablePluginElementProps extends PluginElementProps {
  activeTool?: string;
  panX?: number;
  panY?: number;
  isViewportTransforming?: boolean;
  isSelected?: boolean;
  selectedElements?: SelectedElement[];
  onSelectionContextMenu?: (payload: {
    elementId: string;
    clientX: number;
    clientY: number;
    referenceElement: HTMLDivElement | null;
  }) => boolean;
  onMultiDrag?: (deltaX: number, deltaY: number) => void;
  onMultiDragStart?: () => void | (() => void);
  onMultiDragEnd?: () => void;
  // 트리 선택 끌기에 섞인 런타임 플러그인 요소 - Grid의 선택 끌기 수명 주기
  mixedDrag?: MixedDragLifecycle;
}

const EditablePluginElementImpl = ({
  element,
  windowType,
  activeTool,
  positionOffset = DEFAULT_POSITION_OFFSET,
  zoom = 1,
  panX = 0,
  panY = 0,
  isViewportTransforming = false,
  stackZIndex,
  fallbackZIndex = 0,
  isSelected = false,
  selectedElements = EMPTY_SELECTED_ELEMENTS,
  onSelectionContextMenu,
  onMultiDrag,
  onMultiDragStart,
  onMultiDragEnd,
  mixedDrag,
}: EditablePluginElementProps) => {
  const { containerRef, definition, locale, t, content } = usePluginElementView(
    { element, windowType, zoom },
  );
  const updateElement = usePluginDisplayElementStore(
    (state) => state.updateElement,
  );

  const { contextMenu, deletePluginElement, handleContextMenu } =
    usePluginElementContextMenu({
      element,
      definition,
      windowType,
      locale,
      containerRef,
      onSelectionContextMenu,
      t,
    });

  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);

  // 트리에 노드가 있는 인스턴스 - 끌기·크기 조절은 트리 편집기와 같은 틀 미리보기로 (크기는 크기 조절 플러그인만)
  const treeNode = useDocumentElement(selectedKeyType, element.fullId);
  const treeBacked = windowType === 'main' && treeNode !== undefined;
  const framePreview = useDocumentFramePreviewStore((state) =>
    treeBacked ? state.frames[element.fullId] : undefined,
  );
  const shownElement = framePreview
    ? {
        ...element,
        position: { x: framePreview.x, y: framePreview.y },
        ...(definition?.resizable
          ? {
              measuredSize: {
                width: framePreview.width,
                height: framePreview.height,
              },
            }
          : {}),
      }
    : element;
  // 트리 선택 끌기에서 움직였는지 - 끝난 뒤 따라오는 클릭을 흡수한다
  const treePressMovedRef = useRef(false);

  const calculatedPosition = usePluginElementPosition(
    shownElement,
    positionOffset,
  );

  // 스마트 가이드를 위한 다른 요소들의 bounds 가져오기
  const { getOtherElements } = useSmartGuidesElements();

  // 그리드 스냅 크기 가져오기
  const gridSnapSize = useSettingsStore(
    (state) => state.gridSettings?.gridSnapSize ?? 5,
  );

  // 선택 드래그 상태

  // 선택된 상태면 선택 모드 활성화
  const isSelectionMode = isSelected;

  // 드래그/리사이즈 중인 상태 (CSS 애니메이션 비활성화용, main 윈도우에서만)
  const isDraggingOrResizing = useGridSelectionStore((state) =>
    windowType === 'main' ? state.isDraggingOrResizing : false,
  );

  // 드래그 지원 (main 윈도우에서만)
  const draggable = useDraggable({
    gridSize: gridSnapSize,
    initialX: calculatedPosition.x,
    initialY: calculatedPosition.y,
    // 끝낸 위치는 트리 노드 틀로 저장 (트리에 없는 런타임 요소는 런타임 스토어가 끝)
    onDragStart: () => (commit?: boolean) => {
      if (!treeBacked) return;
      const preview = useDocumentFramePreviewStore.getState();
      const last = preview.frames[element.fullId];
      if (commit === false || !last) {
        preview.clear(element.fullId);
        return;
      }
      void moveDocumentElements(selectedKeyType, [
        { id: element.fullId, x: last.x, y: last.y },
      ]).finally(() =>
        useDocumentFramePreviewStore.getState().clear(element.fullId),
      );
    },
    onPositionChange: (newX, newY) => {
      // 선택 모드가 아닐 때만 개별 이동
      if (windowType === 'main' && element.draggable && !isSelectionMode) {
        // 드래그하면 앵커 제거 (런타임 칸 - 저장하지 않는다)
        if (element.anchor) {
          updateElement(element.fullId, { anchor: undefined });
        }
        if (treeBacked && treeNode) {
          useDocumentFramePreviewStore
            .getState()
            .set(element.fullId, { ...treeNode.frame, x: newX, y: newY });
        } else {
          updateElement(element.fullId, { position: { x: newX, y: newY } });
        }

        // onPositionChange 핸들러 호출 (자동 래핑되어 있음)
        if (
          element.onPositionChange &&
          typeof element.onPositionChange === 'string'
        ) {
          const handler = (window as unknown as Record<string, unknown>)[
            element.onPositionChange
          ];
          if (typeof handler === 'function') {
            (handler as (pos: { x: number; y: number }) => void)({
              x: newX,
              y: newY,
            });
          }
        }
      }
    },
    zoom,
    panX,
    panY,
    // 스마트 가이드 옵션
    elementId: element.fullId,
    elementWidth: element.measuredSize?.width || 100,
    elementHeight: element.measuredSize?.height || 100,
    getOtherElements: windowType === 'main' ? getOtherElements : null,
    // 선택 모드에서는 개별 드래그 비활성화
    disabled: isSelectionMode,
  });

  // 선택 요소 드래그 핸들러 (스마트 가이드 포함)
  const {
    handlePointerDown: handleSelectionDragPointerDown,
    movedDuringPressRef,
    pressMovedRef,
  } = useSelectionDrag({
    // 트리에 노드가 있으면 트리 선택 끌기가 맡는다
    enabled: windowType === 'main' && isSelectionMode && !treeBacked,
    zoom,
    startX: element.position.x,
    startY: element.position.y,
    elementId: element.fullId,
    elementWidth:
      element.measuredSize?.width ?? element.estimatedSize?.width ?? 200,
    elementHeight:
      element.measuredSize?.height ?? element.estimatedSize?.height ?? 150,
    selectedElements,
    getOtherElements,
    getSelectedElementIds: (selectedElement) => [selectedElement.id],
    onMultiDragStart,
    onMultiDrag,
    onMultiDragEnd,
  });

  const { ref: draggableRef, dx: renderX, dy: renderY } = draggable;

  // 고른 인스턴스 누르기 - 트리 선택 전체를 트리 편집기와 같은 끌기로 옮긴다 (보조키·Shift·지우개는 클릭이 맡는다)
  const handleTreeSelectionPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    if (isMac() && event.ctrlKey) return;
    const primaryModifier = isMac() ? event.metaKey : event.ctrlKey;
    if (primaryModifier || event.shiftKey || activeTool === 'eraser') return;
    treePressMovedRef.current = false;
    const selection = useDocumentSelectionStore.getState();
    startDocumentSelectionDrag({
      sceneId: selectedKeyType,
      selfId: element.fullId,
      ids:
        selection.sceneId === selectedKeyType
          ? selection.selectedIds
          : [element.fullId],
      event,
      zoom,
      mixedDrag,
      onEnd: (moved) => {
        treePressMovedRef.current = moved;
      },
    });
  };

  const elementStyle = buildPluginElementStyle({
    element: shownElement,
    windowType,
    renderX,
    renderY,
    stackZIndex: stackZIndex ?? element.zIndex ?? fallbackZIndex,
    resizable: definition?.resizable === true,
  });

  const attachRef = (node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (node) {
      // 선택 모드가 아닐 때만 드래그 ref 연결
      if (element.draggable && windowType === 'main' && !isSelectionMode) {
        draggableRef(node);
      }
    }
  };

  // onClick 핸들러
  const handleClick = (e: React.MouseEvent) => {
    // 우클릭은 컨텍스트 메뉴용이므로 제외
    if (e.button !== 0) return;

    // macOS ctrl+클릭은 우클릭 제스처 — Chromium이 contextmenu 뒤에 click도 발화
    if (isMac() && e.ctrlKey) return;

    // 드래그로 끝난 press의 trailing click은 클릭이 아니다 - 지우개 삭제·
    // 수식키 토글·범위 선택·선택+패널 열기로 새지 않게 흡수
    // (네이티브 요소와 동일 계약. 개별 드래그는 wasMoved, 선택 모드
    // 다중 드래그는 pressMovedRef가 판별)
    if (
      draggable.wasMoved ||
      pressMovedRef.current ||
      treePressMovedRef.current
    ) {
      e.stopPropagation();
      return;
    }

    if (windowType === 'main' && activeTool === 'eraser') {
      e.stopPropagation();
      deletePluginElement();
      return;
    }

    // Ctrl+클릭으로 선택 토글 (메인 윈도우에서만) - 선택 모드에서도 동작해야 함 (선택 해제용)
    const macOS = isMac();
    const isPrimaryModifierPressed = macOS ? e.metaKey : e.ctrlKey;

    if (isPrimaryModifierPressed && windowType === 'main') {
      e.stopPropagation();
      // 넣고 빼기 - 트리 요소 선택을 지킨다
      keepOtherSelection(() =>
        useDocumentSelectionStore.getState().toggleSelection({
          type: 'plugin',
          id: element.fullId,
        }),
      );
      // 마지막 선택 요소 좌표 저장
      if (element.measuredSize) {
        useGridSelectionStore.getState().setLastSelectedKeyBounds({
          x: element.position.x,
          y: element.position.y,
          width: element.measuredSize.width,
          height: element.measuredSize.height,
        });
      }
      return;
    }

    // Shift+클릭으로 범위 선택 (메인 윈도우에서만)
    if (e.shiftKey && windowType === 'main') {
      e.stopPropagation();
      const lastBounds = useGridSelectionStore.getState().lastSelectedKeyBounds;

      if (!lastBounds) {
        // 이전 선택이 없으면 단일 선택처럼 동작
        useDocumentSelectionStore.getState().selectElement({
          type: 'plugin',
          id: element.fullId,
        });
        if (element.measuredSize) {
          useGridSelectionStore.getState().setLastSelectedKeyBounds({
            x: element.position.x,
            y: element.position.y,
            width: element.measuredSize.width,
            height: element.measuredSize.height,
          });
        }
        return;
      }

      // 마지막으로 누른 요소 영역부터 이 요소까지 - 트리 요소와 플러그인 요소 (트리 요소 범위 선택과 같다)
      const sceneId = useKeyStore.getState().selectedKeyType;
      const { treeIds, plugins } = documentRangeSelection(
        getElementDocumentStore()?.getScene(sceneId),
        lastBounds,
        {
          x: element.position.x,
          y: element.position.y,
          width: element.measuredSize?.width || 100,
          height: element.measuredSize?.height || 100,
          rotation: 0,
        },
        usePluginDisplayElementStore.getState().elements,
        sceneId,
      );
      setSplitSelection(
        sceneId,
        treeIds,
        plugins.map(({ id }) => id),
      );
      return;
    }

    // 선택된 상태에서는 일반 클릭 흡수 (키와 동일 순서) —
    // 다중 선택 멤버 재클릭이 선택을 단일로 축소하지 않아야
    // 더블클릭의 "멤버면 선택 보존 + 배치 편집 진입" 정책이 성립한다
    if (isSelectionMode) {
      e.stopPropagation();
      return;
    }

    const settingsUI = definition?.settingsUI ?? 'panel';
    if (windowType === 'main' && settingsUI !== 'modal') {
      e.stopPropagation();
      // 그룹 멤버면 가장 바깥 그룹 전체 선택 (트리 요소 클릭과 같다)
      selectGroupOf(element.fullId);
      // 마지막 선택 요소 좌표 저장
      if (element.measuredSize) {
        useGridSelectionStore.getState().setLastSelectedKeyBounds({
          x: element.position.x,
          y: element.position.y,
          width: element.measuredSize.width,
          height: element.measuredSize.height,
        });
      }
      return;
    }

    // onClick 핸들러가 있고, 메인 윈도우에서만
    if (!element.onClick || windowType !== 'main') return;

    // onClick 핸들러 실행 (자동 래핑되어 있음)
    if (typeof element.onClick === 'string') {
      const handler = (window as unknown as Record<string, unknown>)[
        element.onClick
      ];
      if (typeof handler === 'function') {
        (handler as (e: React.MouseEvent) => void)(e);
      }
    }
  };

  // 더블클릭 편집 진입 — 순수 더블클릭만 통과 (드래그·수식키·지우개·뷰포트 변환 제외).
  // 다중 선택의 멤버면 선택을 보존해 배치 편집으로, 아니면 이 요소만 선택.
  // settingsUI가 modal인 플러그인은 클릭 선택 자체가 없으므로 제외
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (windowType !== 'main') return;
    if ((definition?.settingsUI ?? 'panel') === 'modal') return;
    if (isMac() && e.ctrlKey) return;
    if (e.shiftKey || e.metaKey || e.ctrlKey) return;
    if (activeTool === 'eraser') return;
    if (isViewportTransforming) return;
    if (
      draggable.recentPressMovedRef.current ||
      movedDuringPressRef.current ||
      treePressMovedRef.current
    )
      return;
    e.stopPropagation();

    // 트리 선택(저장된 인스턴스 포함)과 런타임 요소 선택을 함께 본다
    const selection = useDocumentSelectionStore.getState();
    const currentSelection = [
      ...(selection.sceneId === selectedKeyType ? selection.selectedIds : []),
      ...selection.selectedElements.map(({ id }) => id),
    ];
    const isMultiMember =
      currentSelection.length > 1 && currentSelection.includes(element.fullId);
    if (!isMultiMember) {
      // 트리 요소 더블클릭과 같이 그룹 멤버 전체 선택 후 편집 진입
      selectGroupOf(element.fullId);
    }
    openPropertiesPanelForSelection();
  };

  return (
    <PluginElementFrame
      element={element}
      windowType={windowType}
      style={elementStyle}
      attachRef={attachRef}
      content={content}
      editing={Boolean(isDraggingOrResizing || framePreview)}
      // 누를 때마다 지난 트리 끌기의 움직임 표시를 지운다 (따라오는 클릭 흡수는 그 누르기에만)
      onPointerDownCapture={() => {
        treePressMovedRef.current = false;
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerDown={
        windowType === 'main' && isSelectionMode
          ? treeBacked
            ? handleTreeSelectionPointerDown
            : handleSelectionDragPointerDown
          : undefined
      }
      onContextMenu={handleContextMenu}
      contextMenu={contextMenu}
    />
  );
};

// 요소 하나의 갱신이 나머지 전체 리렌더로 번지지 않도록 차단
// (스토어 update 경로는 미변경 요소의 참조를 유지하므로 shallow 비교로 스킵됨)
export const EditablePluginElement = React.memo(EditablePluginElementImpl);
