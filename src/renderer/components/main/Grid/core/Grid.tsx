'use no memo';
// 프리뷰 오버레이(모듈 상태)를 previewVersion으로 다시 읽어야 해서 컴파일러 메모 제외
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { keysApi } from '@api/modules/editor/keysApi';

declare global {
  interface Window {
    __dmn_current_plugin_id?: string;
  }
}
import { useTranslation } from '@contexts/useTranslation';
import { reportElementOpError } from '@src/renderer/editor/runtime/intent/elementIntent';
import type { NativeElementType } from '@src/renderer/editor/model/elementIdMap';
import { treePanelRecords } from '@src/renderer/elementKinds/runtime/treePanelRecords';
import { defaultElementSize, TREE_EDITED_KINDS } from '@src/types/elementKinds';
import {
  isEditorElementType,
  isItemElementType,
  type ElementCollections,
} from '@src/types/editor';
import TabCssModal from '../../Modal/content/editors/TabCssModal';
import TabNoteSettingModal from '../../Modal/content/editors/TabNoteSettingModal';
import ListPopup from '../../Modal/listPopup/ListPopup';
import { useKeyStore } from '@stores/data/useKeyStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { PluginElementsRenderer } from '@components/shared/plugin/PluginElementsRenderer';
import { useGridZoomPan } from '@hooks/Grid/viewport/useGridZoomPan';
import {
  addCanvasElementAt,
  useGridCanvasActions,
} from '@hooks/Grid/contextMenu/useGridCanvasActions';
import type { DuplicateState } from '@hooks/Grid/contextMenu/useGridCanvasActions';
import GridMinimap from './GridMinimap';
import GridBackground from './GridBackground';
import SmartGuidesOverlay from '../overlays/SmartGuidesOverlay';
import MarqueeSelectionOverlay from '../overlays/MarqueeSelectionOverlay';
import { useGradientEditStore } from '@stores/grid/useGradientEditStore';
import { useSpritePoseHandleStore } from '@stores/grid/useSpritePoseHandleStore';
import { getGridViewportLayerStyles } from '@utils/grid/gridViewportStyles';
import KeyCounterPreviewLayer from '../layers/KeyCounterPreviewLayer';
import StatCounterLayer from '../layers/StatCounterLayer';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useUIStore } from '@stores/useUIStore';
import { useSmartGuidesStore } from '@stores/grid/useSmartGuidesStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import {
  snapCursorToGrid,
  useGridKeyboard,
  useGridSelection,
  useGridContextMenu,
  useGridMarquee,
  useGridResize,
  useSmartGuidesElements,
} from '@hooks/Grid';
import { slotCanonical, slotDisplayName } from '@utils/keySlot';
import { overlayApi } from '@api/modules/window/overlayApi';
import { panelWindowApi } from '@api/modules/window/panelWindowApi';
import {
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import {
  buildMixedSelectionMenuItems,
  gridAddTypeForMenuItem,
  shouldOpenMixedSelectionMenu,
} from './gridContextMenuModel';
import DuplicateElementGhost from './DuplicateElementGhost';
import GridSelectionOverlays from '../overlays/GridSelectionOverlays';
import DocumentContextMenu from '../document/DocumentContextMenu';
import { useTreeFramedPositions } from '../document/useTreeFramedPositions';
import {
  structureTargetIds,
  usePanelSelection,
} from '../document/treeEditedSelection';
import { useDocumentContextMenuStore } from '../document/useDocumentContextMenuStore';
import DocumentGridLayer from '../document/DocumentGridLayer';
import DocumentSelectionOverlay from '../document/DocumentSelectionOverlay';
import { documentKindForAddMenuItem } from '../document/documentAddMenu';
import { insertDocumentElement } from '../document/documentEditActions';
import {
  beginDocumentDuplicate,
  placeDocumentDuplicate,
} from '../document/documentDuplicate';
import { treeKeySlot } from '@src/renderer/editor/runtime/operations/keySlotOps';
import { keyMenuContextOf } from '@hooks/Grid/contextMenu/useGridContextMenu';
import { useDocumentKeyboard } from '../document/useDocumentKeyboard';
import {
  getElementDocumentStore,
  useElementDocumentScene,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import { deleteStructureSelection } from '../document/deleteStructureSelection';
import {
  documentGroupActions,
  groupSelectionOf,
} from '../document/documentGroups';
import { documentIdsInRect } from '../document/documentSelection';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { keepOtherSelection } from '@stores/grid/keepOtherSelection';
import { createDocumentDragReceipt } from '../document/documentDragReceipt';
import {
  groupDocumentElements,
  runStructureAction,
  ungroupDocumentElements,
} from '../document/documentEditActions';
import {
  copyDocumentSelection,
  pasteDocumentClipboard,
} from '../document/documentClipboard';
import { setCompanionSelectionReader } from '@stores/grid/companionSelection';
import { executeNativeContextMenuAction } from './nativeContextMenuActions';
import { useSelectedElementDragLifecycle } from '@hooks/Grid/drag/useSelectedElementDragLifecycle';

type ToolbarAddRequest = {
  id: number;
  type: NativeElementType;
} | null;

interface GridProps {
  showConfirm: (
    message: string,
    onConfirm: () => void,
    options?: {
      onCancel?: () => void;
      confirmText?: string;
      cancelText?: string;
      danger?: boolean;
    },
  ) => void;
  showAlert: (message: string, confirmText?: string) => void;
  color: string;
  activeTool: string;
  onUndo: () => void;
  onRedo: () => void;
  toolbarAddRequest: ToolbarAddRequest;
  onToolbarAddConsumed: (() => void) | undefined;
  isNoteSettingOpen: boolean;
  setIsNoteSettingOpen: (open: boolean) => void;
}

const Grid = ({
  showConfirm,
  showAlert,
  color,
  activeTool,
  onUndo,
  onRedo,
  toolbarAddRequest,
  onToolbarAddConsumed,
  isNoteSettingOpen,
  setIsNoteSettingOpen,
}: GridProps) => {
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);

  // 캔버스 요소(stat/graph) CRUD 액션 훅
  const canvasActions = useGridCanvasActions(selectedKeyType);

  const keyCounterEnabled = useSettingsStore(
    (state) => state.keyCounterEnabled,
  );
  const noteEffect = useSettingsStore((state) => state.noteEffect);
  const minimapEnabled = useSettingsStore(
    (state) => state.gridSettings.minimapEnabled,
  );
  const gridSnapSize = useSettingsStore(
    (state) => state.gridSettings?.gridSnapSize ?? 5,
  );
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  // 그리드 컨테이너 및 콘텐츠 ref
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const gridContentRef = useRef<HTMLDivElement | null>(null);

  // 줌/팬 훅
  const {
    zoom,
    panX,
    panY,
    clientToGridCoords,
    gridToClientCoords: _gridToClientCoords,
    zoomIn,
    zoomOut,
    resetZoom,
    minZoom: _minZoom,
    maxZoom: _maxZoom,
    isTransforming,
  } = useGridZoomPan({
    mode: selectedKeyType,
    containerRef: gridContainerRef,
    contentRef: gridContentRef,
  });
  const gridViewportStyles = getGridViewportLayerStyles(
    panX,
    panY,
    zoom,
    isTransforming,
  );

  // 컨텍스트 메뉴 훅 사용
  const {
    getKeyMenuItems,
    getItemMenuItems,
    getGridMenuItems,
    pluginKeyMenuItems,
    pluginGridMenuItems,
  } = useGridContextMenu({
    selectedKeyType,
    locale,
    t,
    noteEffect,
  });

  // 선택 상태 관리
  // 온캔버스 그라데이션 편집 중 여부 — 리사이즈 핸들을 잠시 숨김
  const hasGradientEditSession = useGradientEditStore(
    (state) => state.session !== null,
  );
  // 스프라이트 자세 편집 중 여부 - 자세 프레임이 리사이즈 핸들을 대신한다
  const hasSpritePoseSession = useSpritePoseHandleStore(
    (state) => state.session !== null,
  );
  const selectedElements = useDocumentSelectionStore(
    (state) => state.selectedElements,
  );
  const clearSelection = useDocumentSelectionStore(
    (state) => state.clearSelection,
  );

  // 클립보드 상태 (복사/붙여넣기용)
  const _clipboard = useGridSelectionStore((state) => state.clipboard);

  // 플러그인 요소 가져오기
  const pluginElements = usePluginDisplayElementStore(
    (state) => state.elements,
  );
  // 요소 위치 기록 - 트리 값 + 편집 미리보기 (지금 탭, 패널과 같은 원천)
  const previewVersion = useSyncExternalStore(
    subscribePreviewOverlay,
    getPreviewOverlayVersion,
    getPreviewOverlayVersion,
  );
  const records = treePanelRecords(
    useElementDocumentScene(selectedKeyType),
    selectedKeyType,
    previewVersion,
  );
  // 묶음 identity 유지 - 컴파일된 자식(선택 오버레이·미니맵)의 메모가 기대는 참조
  const collections = useMemo<ElementCollections>(
    () =>
      ({
        keyPositions: records.positions,
        statPositions: records.statItemPositions,
        graphPositions: records.graphItemPositions,
        knobPositions: records.knobItemPositions,
        spritePositions: records.spriteItemPositions,
      } as unknown as ElementCollections),
    // 장면·미리보기 판이 같으면 같은 기록
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, previewVersion],
  );
  const { statPositions, keyPositions: positions } = collections;

  const panelSelection = usePanelSelection(selectedKeyType);
  // 트리에서 그리는 키의 바깥 카운터는 트리 틀을 따라간다
  const keyCounterPositions = useTreeFramedPositions(
    'key',
    positions[selectedKeyType] ?? [],
    selectedKeyType,
  );
  // 트리에서 그리는 스탯의 바깥 카운터는 트리 틀을 따라간다
  const statCounterPositions = useTreeFramedPositions(
    'stat',
    statPositions?.[selectedKeyType] || [],
    selectedKeyType,
  );

  // 선택 관련 로직 훅 사용
  const {
    moveSelectedElements,
    copySelectedElements,
    pasteElements,
    syncSelectedElementsToOverlay,
    freezeSelectionForGesture,
  } = useGridSelection({
    selectedElements,
    selectedKeyType,
  });
  const {
    beginSelectedElementsDrag: beginSelectedPluginInstancesDrag,
    commitSelectedElementsDrag,
    moveSelectedElementsDrag,
  } = useSelectedElementDragLifecycle({
    freezeSelectionForGesture,
    syncSelectedElementsToOverlay,
    moveSelectedElements: (deltaX, deltaY) =>
      moveSelectedElements(deltaX, deltaY, undefined, false),
    // 함께 고른 트리 요소(커서 트래커 등)도 같이 옮긴다
    createCompanionReceipt: () => createDocumentDragReceipt(selectedKeyType),
  });

  // 옛 종류 선택 끌기가 함께 움직일 트리 요소 - 맞춤 대상에서 빼고 묶음 경계에 넣는다
  useEffect(
    () =>
      setCompanionSelectionReader(() => {
        const selection = useDocumentSelectionStore.getState();
        return selection.sceneId === selectedKeyType
          ? selection.selectedIds
          : [];
      }),
    [selectedKeyType],
  );

  // 트리 요소에서 시작한 섞인 선택 끌기 - 옛 선택 끌기 수명 주기를 그대로 쓴다
  const documentMixedDrag = {
    begin: beginSelectedPluginInstancesDrag,
    move: moveSelectedElementsDrag,
    commit: commitSelectedElementsDrag,
  };

  // 마퀴 선택 훅 사용
  const { isMarqueeSelecting: _isMarqueeSelecting, startMarqueeSelection } =
    useGridMarquee({
      selectedKeyType,
      pluginElements,
      clientToGridCoords,
      // 트리 요소(커서 트래커 등)도 같은 마퀴로 함께 고른다
      selectDocumentInRect: (rect) => {
        useDocumentSelectionStore
          .getState()
          .setSelection(
            selectedKeyType,
            documentIdsInRect(
              getElementDocumentStore()?.getScene(selectedKeyType),
              rect,
            ),
          );
      },
    });

  // 스마트 가이드를 위한 다른 요소들의 bounds 가져오기
  const { getOtherElements } = useSmartGuidesElements();

  // 리사이즈 훅 사용
  const {
    handleResizeStart,
    handleResize,
    handleResizeComplete,
    previewBounds,
    // 그룹 리사이즈 관련
    handleGroupResize,
    handleGroupResizeComplete,
    previewGroupBounds,
    previewElementBounds,
  } = useGridResize({
    selectedElements,
    selectedKeyType,
    getOtherElements,
  });

  const deleteSelectedElements = () =>
    deleteStructureSelection(selectedKeyType);

  // 트리 요소 키보드 - 옛 종류 키보드가 처리한 뒤 같은 이벤트로 부른다 (섞인 선택)
  const handleDocumentKeyDown = useDocumentKeyboard();

  // 키보드 단축키 훅 사용
  useGridKeyboard({
    selectedElements,
    moveSelectedElements,
    deleteSelectedElements,
    clearSelection,
    copySelectedElements,
    pasteElements,
    onUndo,
    onRedo,
    afterKeyDown: handleDocumentKeyDown,
  });

  // 키 컨텍스트 메뉴
  const [isContextOpen, setIsContextOpen] = useState<boolean>(false);
  // 메뉴 대상의 안정 신원 - 열림 동안 재정렬돼도 액션이 같은 요소를 향한다
  const [contextElementId, setContextElementId] = useState<string | null>(null);
  const [contextType, setContextType] = useState<string>('key');
  const contextRef = useRef<HTMLElement | null>(null);
  const [contextPosition, setContextPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [duplicateState, setDuplicateState] = useState<DuplicateState | null>(
    null,
  );
  const [duplicateCursor, setDuplicateCursor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // 섞인 선택 메뉴 - 묶기·풀기는 트리 그룹 기준 (옛 종류·플러그인·트리 전용 요소 함께)
  const mixedSelectionMenuItems = buildMixedSelectionMenuItems(
    documentGroupActions(
      getElementDocumentStore()?.getScene(selectedKeyType),
      structureTargetIds(selectedKeyType),
    ),
    t,
  );

  const openMixedSelectionContextMenu = (
    x: number,
    y: number,
    referenceNode: HTMLElement | null,
  ) => {
    setContextType('mixed');
    contextRef.current = referenceNode || null;
    setContextPosition({ x, y });
    setIsContextOpen(true);
  };

  // 클라이언트 좌표를 그리드 좌표로 변환 (줌/팬 반영)
  const computeSnappedCursorFromClient = (clientX: number, clientY: number) => {
    const gridCoords = clientToGridCoords(clientX, clientY);
    if (!gridCoords) return null;
    return snapCursorToGrid(gridCoords.x, gridCoords.y);
  };

  // 복제 시작 - 고스트로 자리를 고른다 (원본은 트리 요소 id)
  const beginDuplicate = (id: string) => {
    const result = beginDocumentDuplicate(selectedKeyType, id);
    if (!result) return;
    const currentMousePos = lastMousePosRef.current;
    computeSnappedCursorFromClient(currentMousePos.x, currentMousePos.y);
    setDuplicateState(result);
    setDuplicateCursor(null);
  };

  useEffect(() => {
    if (!toolbarAddRequest) return;

    const getViewportCenterSnappedPosition = (
      width: number,
      height: number,
    ) => {
      const container = gridContainerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const centerClientX = rect.left + rect.width / 2;
      const centerClientY = rect.top + rect.height / 2;
      const gridCoords = clientToGridCoords(centerClientX, centerClientY);
      if (!gridCoords) return null;
      const targetX = gridCoords.x - width / 2;
      const targetY = gridCoords.y - height / 2;
      const snapped = snapCursorToGrid(targetX, targetY);
      return {
        dx: snapped.x,
        dy: snapped.y,
      };
    };

    const defaultSize = defaultElementSize(toolbarAddRequest.type);
    const targetPos = getViewportCenterSnappedPosition(
      defaultSize.width,
      defaultSize.height,
    );
    if (targetPos) {
      addCanvasElementAt(
        canvasActions,
        toolbarAddRequest.type,
        targetPos.dx,
        targetPos.dy,
      );
    }

    onToolbarAddConsumed?.();
  });

  // 탭 CSS 모달 상태
  const [isTabCssModalOpen, setIsTabCssModalOpen] = useState<boolean>(false);
  // 탭 노트 트랙 설정 모달 상태
  const [isTabNoteModalOpen, setIsTabNoteModalOpen] = useState<boolean>(false);

  // 전역 트랙 설정 모달이 열리면 탭 트랙 설정 모달 닫기 (중복 방지)
  useEffect(() => {
    if (isNoteSettingOpen) setIsTabNoteModalOpen(false);
  }, [isNoteSettingOpen]);

  // 그리드 영역 호버 상태 (미니맵 표시용) - useUIStore에서 관리
  const _isGridAreaHovered = useUIStore((state) => state.isGridAreaHovered);

  // 기타 설정 팝업 열림 상태 (미니맵 표시 제어용)
  const _isExtrasPopupOpen = useUIStore((state) => state.isExtrasPopupOpen);

  // 불러오기/내보내기 팝업 열림 상태 (미니맵 표시 제어용)
  const _isExportImportPopupOpen = useUIStore(
    (state) => state.isExportImportPopupOpen,
  );
  const previousSelectedKeyTypeRef = useRef<string>(selectedKeyType);

  // 탭 변경 시 선택 해제. 대기 중인 스프라이트 복제는 함께 취소한다 - 원본 탭
  // 요소를 다른 탭에 놓으면 자세 트리거가 원본 탭 키를 가리켜 죽는다. 다른
  // 종류는 탭을 넘어 배치할 수 있으므로 그대로 둔다.
  // 탭 바는 그리드 밖이라 배치 취소용 onMouseDownCapture도 타지 않는다
  useEffect(() => {
    if (previousSelectedKeyTypeRef.current !== selectedKeyType) {
      clearSelection();
      useDocumentSelectionStore.getState().clear();
      setDuplicateState((prev) =>
        prev?.elementType === 'sprite' ? null : prev,
      );
      previousSelectedKeyTypeRef.current = selectedKeyType;
    }
  }, [selectedKeyType, clearSelection]);

  // 그리드 컨텍스트 메뉴
  const [isGridContextOpen, setIsGridContextOpen] = useState<boolean>(false);
  const [gridContextClientPos, setGridContextClientPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [gridAddLocalPos, setGridAddLocalPos] = useState<{
    dx: number;
    dy: number;
  } | null>(null);

  // 전역 마우스 위치 추적
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // 요소 컨텍스트 메뉴 열기
  const openElementContextMenu = (
    type: NativeElementType,
    clickedId: string,
    clientX: number,
    clientY: number,
    ref: HTMLElement | null,
  ) => {
    if (duplicateState) {
      setDuplicateState(null);
      setDuplicateCursor(null);
    }
    // 트리 요소도 함께 골랐으면 고른 것 전체를 다루는 메뉴
    if (
      shouldOpenMixedSelectionMenu(selectedElements, clickedId) ||
      (useDocumentSelectionStore.getState().selectedIds.length > 0 &&
        selectedElements.some((element) => element.id === clickedId))
    ) {
      openMixedSelectionContextMenu(clientX, clientY, ref);
      return;
    }
    setContextType(type);
    setContextElementId(clickedId);
    contextRef.current = ref;
    setContextPosition({ x: clientX, y: clientY });
    setIsContextOpen(true);
  };

  // 그리드 좌클릭 핸들러 (빈 공간에서 드래그로 마퀴 선택 시작)

  const openDocumentElementContextMenu = (
    event: React.MouseEvent,
    element: { id: string },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    // 고른 것 위에서 우클릭하면 선택을 지킨다 (옛 종류와 같다)
    const selection = useDocumentSelectionStore.getState();
    const selected =
      selection.sceneId === selectedKeyType &&
      selection.selectedIds.includes(element.id);
    // 옛 종류 요소와 섞인 선택이면 두 가족에 함께 적용하는 메뉴
    if (
      selected &&
      useDocumentSelectionStore.getState().selectedElements.length > 0
    ) {
      openMixedSelectionContextMenu(
        event.clientX,
        event.clientY,
        event.currentTarget as HTMLElement,
      );
      return;
    }
    if (!selected) {
      // 그룹 안이면 그룹째 - 그룹의 플러그인 요소는 옛 선택으로
      const group = groupSelectionOf(
        getElementDocumentStore()?.getScene(selectedKeyType),
        element.id,
      );
      selection.setSelection(selectedKeyType, group.treeIds);
      if (group.plugins.length > 0) {
        keepOtherSelection(() =>
          useDocumentSelectionStore
            .getState()
            .setSelectedElements(
              group.plugins.map((id) => ({ type: 'plugin', id })),
            ),
        );
      }
    }
    // 트리로 옮긴 옛 종류는 옛 메뉴 - 옛 그룹 묶기·풀기, 그룹을 넘는 겹침 순서, 복제 배치를 그대로 쓴다
    const kind = getElementDocumentStore()?.getElement(
      selectedKeyType,
      element.id,
    )?.kind;
    if (kind && isEditorElementType(kind) && TREE_EDITED_KINDS.has(kind)) {
      if (structureTargetIds(selectedKeyType).length > 1) {
        openMixedSelectionContextMenu(
          event.clientX,
          event.clientY,
          event.currentTarget as HTMLElement,
        );
        return;
      }
      openElementContextMenu(
        kind,
        element.id,
        event.clientX,
        event.clientY,
        event.currentTarget as HTMLElement,
      );
      return;
    }
    useDocumentContextMenuStore.getState().open({
      sceneId: selectedKeyType,
      id: element.id,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handleGridMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 좌클릭만 처리
    if (e.button !== 0) return;

    // 복제 상태일 때는 무시
    if (duplicateState) return;

    // 이벤트 타겟이 그리드 컨테이너나 그리드 콘텐츠인 경우에만 마퀴 선택 시작
    // (키나 플러그인 요소에서 버블링된 이벤트 필터링)
    const target = e.target;
    const isGridContainer = target === gridContainerRef.current;
    const isGridContent = target === gridContentRef.current;

    if (!isGridContainer && !isGridContent) {
      return;
    }

    // 클릭 시 스마트 가이드 클리어 (드래그가 정상 종료되지 않은 경우 대비)
    useSmartGuidesStore.getState().clearGuides();
    // 빈 곳을 누르면 트리 요소 선택도 푼다
    useDocumentSelectionStore.getState().clear();

    // 그리드 빈 공간에서 드래그로 마퀴 선택 시작
    const gridCoords = clientToGridCoords(e.clientX, e.clientY);
    if (gridCoords) {
      startMarqueeSelection(gridCoords.x, gridCoords.y);
    }
  };

  return (
    <div
      ref={(node) => {
        gridRef.current = node;
        gridContainerRef.current = node;
      }}
      data-grid-container
      className="relative isolate w-full h-full bg-panel rounded-[0px] overflow-hidden"
      style={color === 'transparent' ? undefined : { backgroundColor: color }}
      onContextMenu={(e) => {
        if (duplicateState) {
          setDuplicateState(null);
          setDuplicateCursor(null);
        }
        e.preventDefault();
        e.stopPropagation();
        // 줌/팬 반영된 그리드 좌표 계산
        const gridCoords = clientToGridCoords(e.clientX, e.clientY);
        if (!gridCoords) return;
        const snapped = snapCursorToGrid(gridCoords.x, gridCoords.y);
        setGridAddLocalPos({ dx: snapped.x, dy: snapped.y });
        setGridContextClientPos({ x: e.clientX, y: e.clientY });
        setIsGridContextOpen(true);
      }}
      onMouseDown={handleGridMouseDown}
      onMouseMove={(e) => {
        if (duplicateState) {
          const snapped = computeSnappedCursorFromClient(e.clientX, e.clientY);
          if (snapped) {
            setDuplicateCursor(snapped);
          }
        }
      }}
      onMouseEnter={() => {}}
      onMouseLeave={() => {
        if (duplicateState) setDuplicateCursor(null);
      }}
      onMouseDownCapture={(e) => {
        if (!duplicateState || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const snapped = computeSnappedCursorFromClient(e.clientX, e.clientY);
        if (snapped) {
          // 마우스 위치에서 키의 중심이 배치되도록 조정
          const width = duplicateState.position.width || 60;
          const height = duplicateState.position.height || 60;
          void placeDocumentDuplicate(
            selectedKeyType,
            duplicateState,
            snapped.x - width / 2,
            snapped.y - height / 2,
          );
        }
        setDuplicateState(null);
        setDuplicateCursor(null);
      }}
    >
      {/* 정확한 그리드 배경 */}
      <GridBackground
        gridSize={gridSnapSize}
        zoom={zoom}
        panX={panX}
        panY={panY}
      />
      {/* 팬과 줌을 같은 합성 레이어에 넣으면 이동 중 기존 배율의 래스터가
          다시 샘플링된다 - 이동 레이어는 최종 배율로 그려진 안쪽만 옮김 */}
      <div className="absolute" style={gridViewportStyles.pan}>
        <div
          key={selectedKeyType}
          ref={gridContentRef}
          className="absolute"
          data-dmn-grid-space=""
          data-dmn-user-css-scope=""
          style={gridViewportStyles.scale}
        >
          <DocumentGridLayer
            sceneId={selectedKeyType}
            activeTool={activeTool}
            placement="bottom"
            zoom={zoom}
            onElementContextMenu={openDocumentElementContextMenu}
            mixedDrag={documentMixedDrag}
          />
          {/* Outside 카운터 미리보기 레이어 */}
          {keyCounterEnabled && (
            <KeyCounterPreviewLayer
              positions={keyCounterPositions}
              previewValue={0}
              // 일괄 미리보기는 패널이 편집하는 선택(트리로 옮긴 키 포함)
              selectedElements={panelSelection}
            />
          )}
          <StatCounterLayer
            positions={statCounterPositions}
            // 일괄 미리보기는 패널이 편집하는 선택(트리로 옮긴 스탯 포함)
            selectedElements={panelSelection}
          />
          <DuplicateElementGhost
            duplicate={duplicateState}
            cursor={duplicateCursor}
            zoom={zoom}
          />
          <PluginElementsRenderer
            windowType="main"
            activeTool={activeTool}
            zoom={zoom}
            panX={panX}
            panY={panY}
            isViewportTransforming={isTransforming}
            onSelectionContextMenu={({
              elementId,
              clientX,
              clientY,
              referenceElement,
            }) => {
              if (duplicateState) {
                setDuplicateState(null);
                setDuplicateCursor(null);
              }
              if (!shouldOpenMixedSelectionMenu(selectedElements, elementId))
                return false;
              openMixedSelectionContextMenu(
                clientX,
                clientY,
                referenceElement || null,
              );
              return true;
            }}
            onMultiDrag={moveSelectedElementsDrag}
            onMultiDragStart={beginSelectedPluginInstancesDrag}
            onMultiDragEnd={commitSelectedElementsDrag}
          />
          {/* 트리 문서에만 있는 종류 (커서 트래커 등) */}
          <DocumentGridLayer
            sceneId={selectedKeyType}
            activeTool={activeTool}
            placement="stacked"
            zoom={zoom}
            onElementContextMenu={openDocumentElementContextMenu}
            mixedDrag={documentMixedDrag}
          />
        </div>
      </div>
      {/* 스마트 가이드 오버레이 */}
      <SmartGuidesOverlay zoom={zoom} panX={panX} panY={panY} />
      {/* 마퀴 선택 오버레이 */}
      <MarqueeSelectionOverlay zoom={zoom} panX={panX} panY={panY} />
      <GridSelectionOverlays
        selectedElements={selectedElements}
        collections={collections}
        mode={selectedKeyType}
        pluginElements={pluginElements}
        zoom={zoom}
        panX={panX}
        panY={panY}
        hasGradientEditSession={hasGradientEditSession}
        hasSpritePoseSession={hasSpritePoseSession}
        previewBounds={previewBounds}
        previewGroupBounds={previewGroupBounds}
        previewElementBounds={previewElementBounds}
        onResizeStart={handleResizeStart}
        onResize={handleResize}
        onResizeEnd={handleResizeComplete}
        onGroupResize={handleGroupResize}
        onGroupResizeEnd={handleGroupResizeComplete}
        getOtherElements={getOtherElements}
      />
      <DocumentSelectionOverlay
        sceneId={selectedKeyType}
        zoom={zoom}
        panX={panX}
        panY={panY}
      />
      <DocumentContextMenu />
      {/* 우클릭 리스트 팝업 */}
      <div className="relative">
        <ListPopup
          open={isContextOpen}
          ariaLabel={t('common.more')}
          referenceRef={contextRef}
          position={contextPosition || undefined}
          onClose={() => {
            setIsContextOpen(false);
            setContextPosition(null);
          }}
          items={
            contextType === 'mixed'
              ? mixedSelectionMenuItems
              : isItemElementType(contextType)
              ? getItemMenuItems(contextType)
              : getKeyMenuItems(contextElementId)
          }
          onSelect={async (id: string) => {
            if (contextType === 'mixed') {
              if (id === 'delete') {
                // 지울 대상(트리 요소 포함)을 읽은 뒤 트리 선택을 비운다
                const deleting = deleteSelectedElements();
                useDocumentSelectionStore.getState().clear();
                await deleting.catch(reportElementOpError);
              } else if (id === 'duplicate') {
                // 트리 선택을 먼저 복사한다 - 옛 붙여넣기가 바꿔 고르며 트리 선택을 비운다.
                // 옛 선택이 없으면 옛 클립보드를 쓰지 않는다 (지난 복사분이 붙지 않게)
                const hasLegacy = selectedElements.length > 0;
                if (hasLegacy) copySelectedElements();
                const copiedDocument = copyDocumentSelection({
                  keepLegacyClipboard: hasLegacy,
                });
                if (hasLegacy) {
                  await pasteElements().catch(reportElementOpError);
                }
                if (copiedDocument) {
                  await pasteDocumentClipboard(selectedKeyType, {
                    keepOther: hasLegacy,
                  });
                }
              } else if (id === 'bringToFront' || id === 'sendToBack') {
                // 트리 연산 하나로 옛 종류·플러그인·트리 전용 요소를 함께 (되돌리기 한 번)
                await runStructureAction(
                  selectedKeyType,
                  structureTargetIds(selectedKeyType),
                  id === 'bringToFront' ? 'front' : 'back',
                );
              } else if (id === 'groupSelected') {
                await groupDocumentElements(
                  selectedKeyType,
                  structureTargetIds(selectedKeyType),
                  t('layerGroup.newGroup') || 'New Group',
                );
              } else if (id === 'ungroupSelected') {
                await ungroupDocumentElements(
                  selectedKeyType,
                  structureTargetIds(selectedKeyType),
                );
              }

              setIsContextOpen(false);
              setContextPosition(null);
              return;
            }

            // 대상은 요소 id - 메뉴가 열린 동안 재정렬돼도 같은 요소. 지금 탭에서 사라졌으면 하지 않는다
            const target = contextElementId
              ? getElementDocumentStore()?.getElement(
                  selectedKeyType,
                  contextElementId,
                )
              : undefined;
            if (!target) {
              setIsContextOpen(false);
              setContextPosition(null);
              return;
            }

            // 플러그인 키 메뉴 - 플러그인 표면은 옛 모양 (canonical 슬롯 문자열·옛 위치·순번)
            const pluginItem = pluginKeyMenuItems.find(
              (item) => item.fullId === id,
            );
            if (pluginItem) {
              const context = keyMenuContextOf(target, selectedKeyType);
              if (!context) return;
              try {
                const result = pluginItem.onClick(context);
                if (result && typeof result.then === 'function') {
                  result.catch((error) => {
                    console.error(
                      `[Plugin Menu] Error in '${pluginItem.label}':`,
                      error,
                    );
                  });
                }
              } catch (error) {
                console.error(
                  `[Plugin Menu] Error in '${pluginItem.label}':`,
                  error,
                );
              }
              setIsContextOpen(false);
              setContextPosition(null);
              return;
            }

            if (id === 'counterReset') {
              const displayName = slotDisplayName(treeKeySlot(target) ?? '');
              showConfirm(
                t('confirm.resetKeyCounter', { name: displayName }),
                async () => {
                  // 확인 시점 다시 읽기 - 모달이 떠 있는 동안의 슬롯 바꾸기 반영
                  const slot = treeKeySlot(
                    getElementDocumentStore()?.getElement(
                      selectedKeyType,
                      target.id,
                    ),
                  );
                  if (slot == null) return;
                  try {
                    await keysApi.resetSingleCounter(
                      selectedKeyType,
                      slotCanonical(slot),
                    );
                  } catch (error) {
                    console.error('Failed to reset key counter', error);
                  }
                },
                { confirmText: t('confirm.reset') },
              );
            } else {
              executeNativeContextMenuAction({
                menuItemId: id,
                mode: selectedKeyType,
                elementId: target.id,
                onDuplicate: beginDuplicate,
              });
            }
            setIsContextOpen(false);
            setContextPosition(null);
          }}
        />
      </div>
      {/* 그리드 컨텍스트 메뉴 */}
      <div className="relative">
        <ListPopup
          open={isGridContextOpen}
          ariaLabel={t('common.more')}
          position={gridContextClientPos || undefined}
          onClose={() => {
            setIsGridContextOpen(false);
            setGridContextClientPos(null);
            setGridAddLocalPos(null);
          }}
          items={getGridMenuItems(gridAddLocalPos)}
          onSelect={(id: string) => {
            // 플러그인 메뉴 처리
            const pluginItem = pluginGridMenuItems.find(
              (item) => item.fullId === id,
            );
            if (pluginItem && gridAddLocalPos) {
              const context = {
                position: gridAddLocalPos,
                mode: selectedKeyType,
              };

              // 플러그인 컨텍스트 설정
              const previousPluginId = window.__dmn_current_plugin_id;
              try {
                window.__dmn_current_plugin_id = pluginItem.pluginId;

                const result = pluginItem.onClick(context);
                if (result && typeof result.then === 'function') {
                  result
                    .catch((error) => {
                      console.error(
                        `[Plugin Menu] Error in '${pluginItem.label}':`,
                        error,
                      );
                    })
                    .finally(() => {
                      // 비동기 작업 완료 후 컨텍스트 복원
                      window.__dmn_current_plugin_id = previousPluginId;
                    });
                } else {
                  // 동기 작업이면 즉시 복원
                  window.__dmn_current_plugin_id = previousPluginId;
                }
              } catch (error) {
                console.error(
                  `[Plugin Menu] Error in '${pluginItem.label}':`,
                  error,
                );
                // 에러 발생 시에도 컨텍스트 복원
                window.__dmn_current_plugin_id = previousPluginId;
              }

              setIsGridContextOpen(false);
              setGridContextClientPos(null);
              setGridAddLocalPos(null);
              return;
            }

            // 기본 메뉴 처리
            const documentKind = documentKindForAddMenuItem(id);
            const addType = gridAddTypeForMenuItem(id);
            if (documentKind && gridAddLocalPos) {
              void insertDocumentElement(selectedKeyType, documentKind, {
                x: gridAddLocalPos.dx,
                y: gridAddLocalPos.dy,
              }).then((elementId) => {
                if (elementId) {
                  useDocumentSelectionStore
                    .getState()
                    .select(selectedKeyType, elementId);
                }
              });
            } else if (addType && gridAddLocalPos) {
              addCanvasElementAt(
                canvasActions,
                addType,
                gridAddLocalPos.dx,
                gridAddLocalPos.dy,
              );
            } else if (id === 'tabCss') {
              setIsTabCssModalOpen(true);
            } else if (id === 'tabNote') {
              setIsNoteSettingOpen(false);
              setIsTabNoteModalOpen(true);
            } else if (id === 'resetOverlayPosition') {
              void overlayApi.resetPosition().catch((error) => {
                console.error('Failed to reset overlay position', error);
              });
            } else if (id === 'resetPanelPosition') {
              void panelWindowApi.resetPosition().catch((error) => {
                console.error('Failed to reset panel window position', error);
              });
            }
            setIsGridContextOpen(false);
            setGridContextClientPos(null);
            setGridAddLocalPos(null);
          }}
        />
      </div>
      {/* 미니맵 */}
      {minimapEnabled && (
        <GridMinimap
          zoom={zoom}
          panX={panX}
          panY={panY}
          containerRef={gridContainerRef}
          mode={selectedKeyType}
          visible={
            // 기존 로직: 그리드 호버 시에만 표시
            // isGridAreaHovered && !isExtrasPopupOpen && !isExportImportPopupOpen
            // 변경: minimapEnabled가 true면 항상 표시
            true
          }
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetZoom={resetZoom}
        />
      )}
      {/* 줌 레벨 표시 - 미니맵 내부로 통합됨 */}
      {/* 탭 CSS 설정 모달 */}
      <TabCssModal
        isOpen={isTabCssModalOpen}
        onClose={() => setIsTabCssModalOpen(false)}
        showAlert={showAlert}
      />
      {/* 탭별 노트 트랙 설정 모달 */}
      <TabNoteSettingModal
        isOpen={isTabNoteModalOpen}
        onClose={() => setIsTabNoteModalOpen(false)}
      />
    </div>
  );
};

export default Grid;
