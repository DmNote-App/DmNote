import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "@contexts/I18nContext";
import DraggableKey from "@components/Key";
import { getKeyInfoByGlobalKey } from "@utils/KeyMaps";
import KeySettingModal from "../Modal/content/KeySetting";
import CounterSettingModal from "../Modal/content/CounterSetting";
import NoteColorSettingModal from "../Modal/content/NoteColorSetting";
import TabCssModal from "../Modal/content/TabCssModal";
import ListPopup from "../Modal/ListPopup";
import { useKeyStore } from "@stores/useKeyStore";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import { PluginElementsRenderer } from "@components/PluginElementsRenderer";
import { useGridZoomPan } from "@hooks/Grid/useGridZoomPan";
import GridMinimap from "./GridMinimap";
import ZoomIndicator from "./ZoomIndicator";
import SmartGuidesOverlay from "./SmartGuidesOverlay";
import GridBackground from "./GridBackground";
import MarqueeSelectionOverlay from "./MarqueeSelectionOverlay";
import { useGridSelectionStore } from "@stores/useGridSelectionStore";
import { useHistoryStore } from "@stores/useHistoryStore";
import { useUIStore } from "@stores/useUIStore";
import { useSmartGuidesStore } from "@stores/useSmartGuidesStore";
import {
  GRID_SNAP,
  snapCursorToGrid,
  useGridKeyboard,
  useGridSelection,
  useGridContextMenu,
  useGridMarquee,
} from "@hooks/Grid";

export default function Grid({
  showConfirm,
  showAlert,
  selectedKey,
  setSelectedKey,
  keyMappings,
  positions,
  onPositionChange,
  onKeyUpdate,
  onNoteColorUpdate,
  onCounterUpdate,
  onCounterPreview,
  onKeyDelete,
  onAddKeyAt,
  onKeyDuplicate,
  onMoveToFront,
  onMoveToBack,
  color,
  activeTool,
  shouldSkipModalAnimation,
  onModalAnimationConsumed,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) {
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  // 그리드 컨테이너 및 콘텐츠 ref
  const gridContainerRef = useRef(null);
  const gridContentRef = useRef(null);

  // 줌/팬 훅
  const {
    zoom,
    panX,
    panY,
    clientToGridCoords,
    gridToClientCoords,
    zoomIn,
    zoomOut,
    resetZoom,
    minZoom,
    maxZoom,
  } = useGridZoomPan({
    mode: selectedKeyType,
    containerRef: gridContainerRef,
    contentRef: gridContentRef,
  });

  // 컨텍스트 메뉴 훅 사용
  const {
    getKeyMenuItems,
    getGridMenuItems,
    pluginKeyMenuItems,
    pluginGridMenuItems,
  } = useGridContextMenu({
    selectedKeyType,
    keyMappings,
    positions,
    locale,
    t,
  });

  // 선택 상태 관리
  const selectedElements = useGridSelectionStore(
    (state) => state.selectedElements
  );
  const toggleSelection = useGridSelectionStore(
    (state) => state.toggleSelection
  );
  const clearSelection = useGridSelectionStore((state) => state.clearSelection);

  // 클립보드 상태 (복사/붙여넣기용)
  const clipboard = useGridSelectionStore((state) => state.clipboard);

  // 플러그인 요소 가져오기
  const pluginElements = usePluginDisplayElementStore(
    (state) => state.elements
  );

  // 선택 관련 로직 훅 사용
  const {
    moveSelectedElements,
    deleteSelectedElements,
    copySelectedElements,
    pasteElements,
    syncSelectedElementsToOverlay,
  } = useGridSelection({
    selectedElements,
    selectedKeyType,
    keyMappings,
    positions,
  });

  // 마퀴 선택 훅 사용
  const { isMarqueeSelecting, startMarqueeSelection } = useGridMarquee({
    positions,
    selectedKeyType,
    pluginElements,
    clientToGridCoords,
  });

  // 키보드 단축키 훅 사용
  useGridKeyboard({
    selectedElements,
    moveSelectedElements,
    deleteSelectedElements,
    clearSelection,
    copySelectedElements,
    pasteElements,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
  });

  // 키 컨텍스트 메뉴
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [contextIndex, setContextIndex] = useState(null);
  const contextRef = useRef(null);
  const [contextPosition, setContextPosition] = useState(null);
  const keyRefs = useRef([]);
  const gridRef = useRef(null);
  const [duplicateState, setDuplicateState] = useState(null);
  const [duplicateCursor, setDuplicateCursor] = useState(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // 클라이언트 좌표를 그리드 좌표로 변환 (줌/팬 반영)
  const computeSnappedCursorFromClient = useCallback(
    (clientX, clientY) => {
      const gridCoords = clientToGridCoords(clientX, clientY);
      if (!gridCoords) return null;
      return snapCursorToGrid(gridCoords.x, gridCoords.y);
    },
    [clientToGridCoords]
  );

  const [counterTargetIndex, setCounterTargetIndex] = useState(null);
  const [counterOriginalSettings, setCounterOriginalSettings] = useState(null);
  const [counterApplied, setCounterApplied] = useState(false);

  // 노트 색상 설정 모달 상태
  const [noteColorTargetIndex, setNoteColorTargetIndex] = useState(null);

  // 탭 CSS 모달 상태
  const [isTabCssModalOpen, setIsTabCssModalOpen] = useState(false);

  // 그리드 호버 상태 (미니맵 표시용)
  const [isGridHovered, setIsGridHovered] = useState(false);

  // 기타 설정 팝업 열림 상태 (미니맵 표시 제어용)
  const isExtrasPopupOpen = useUIStore((state) => state.isExtrasPopupOpen);

  // 탭 변경 시 선택 해제
  useEffect(() => {
    clearSelection();
  }, [selectedKeyType, clearSelection]);

  // 그리드 컨텍스트 메뉴
  const [isGridContextOpen, setIsGridContextOpen] = useState(false);
  const [gridContextClientPos, setGridContextClientPos] = useState(null);
  const [gridAddLocalPos, setGridAddLocalPos] = useState(null);

  // 전역 마우스 위치 추적
  useEffect(() => {
    const handleMouseMove = (e) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    if (
      shouldSkipModalAnimation &&
      selectedKey &&
      typeof onModalAnimationConsumed === "function"
    ) {
      onModalAnimationConsumed();
    }
  }, [shouldSkipModalAnimation, selectedKey, onModalAnimationConsumed]);

  const renderKeys = () => {
    if (!positions[selectedKeyType]) return null;

    return positions[selectedKeyType].map((position, index) => (
      <DraggableKey
        key={index}
        index={index}
        position={position}
        keyName={keyMappings[selectedKeyType]?.[index] || ""}
        onPositionChange={onPositionChange}
        onClick={() => {
          if (isContextOpen) {
            setIsContextOpen(false);
            setContextPosition(null);
          }
          setSelectedKey({ key: keyMappings[selectedKeyType][index], index });
        }}
        onCtrlClick={() => {
          toggleSelection({ type: "key", id: `key-${index}`, index });
        }}
        isSelected={selectedElements.some(
          (el) => el.type === "key" && el.index === index
        )}
        selectedElements={selectedElements}
        onMultiDrag={(deltaX, deltaY) =>
          moveSelectedElements(deltaX, deltaY, false, false)
        }
        onMultiDragEnd={syncSelectedElementsToOverlay}
        onMultiDragStart={() => {
          // 드래그 시작 시 히스토리 저장
          const currentPositions = useKeyStore.getState().positions;
          const currentPluginElements =
            usePluginDisplayElementStore.getState().elements;
          const { keyMappings: km } = useKeyStore.getState();
          useHistoryStore
            .getState()
            .pushState(km, currentPositions, currentPluginElements);
        }}
        activeTool={activeTool}
        onEraserClick={() => {
          const globalKey = keyMappings[selectedKeyType]?.[index] || "";
          const displayName =
            getKeyInfoByGlobalKey(globalKey)?.displayName || globalKey;
          showConfirm(
            t("confirm.removeKey", { name: displayName }),
            () => onKeyDelete(index),
            t("confirm.remove")
          );
        }}
        onContextMenu={(e) => {
          if (duplicateState) {
            setDuplicateState(null);
            setDuplicateCursor(null);
          }
          setContextIndex(index);
          contextRef.current = keyRefs.current[index] || null;
          setContextPosition({ x: e.clientX, y: e.clientY });
          setIsContextOpen(true);
        }}
        setReferenceRef={(node) => {
          keyRefs.current[index] = node;
        }}
        zoom={zoom}
        panX={panX}
        panY={panY}
      />
    ));
  };

  const renderDuplicateGhost = () => {
    if (!duplicateState || !duplicateCursor) return null;
    const {
      position: {
        width = 60,
        height = 60,
        inactiveImage,
        activeImage,
        className,
      },
      keyName,
    } = duplicateState;
    const backgroundColor = inactiveImage
      ? "transparent"
      : "rgba(46, 46, 47, 0.9)";
    const borderStyle = inactiveImage
      ? "none"
      : "3px solid rgba(113, 113, 113, 0.9)";
    const displayName =
      getKeyInfoByGlobalKey(keyName)?.displayName || keyName || "";

    // 키의 중심이 마우스에 위치하도록 오프셋 계산
    const offsetX = duplicateCursor.x - width / 2;
    const offsetY = duplicateCursor.y - height / 2;

    return (
      <div
        className={`absolute pointer-events-none select-none ${
          className || ""
        }`}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate3d(${offsetX}px, ${offsetY}px, 0)`,
          backgroundColor,
          borderRadius: inactiveImage ? "0" : "10px",
          border: borderStyle,
          overflow: inactiveImage ? "visible" : "hidden",
          opacity: 0.5,
          zIndex: 1000,
        }}
      >
        {inactiveImage || activeImage ? (
          <img
            src={inactiveImage || activeImage || ""}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              pointerEvents: "none",
              userSelect: "none",
            }}
            draggable={false}
          />
        ) : (
          <div
            className="flex items-center justify-center h-full font-bold"
            style={{
              color: "var(--key-text-color, #717171)",
              willChange: "auto",
              contain: "layout style paint",
            }}
          >
            {displayName}
          </div>
        )}
      </div>
    );
  };

  // 그리드 좌클릭 핸들러 (Ctrl+드래그로 마퀴 선택 시작)
  const handleGridMouseDown = useCallback(
    (e) => {
      // 좌클릭만 처리
      if (e.button !== 0) return;

      // 복제 상태일 때는 무시
      if (duplicateState) return;

      // 클릭 시 스마트 가이드 클리어 (드래그가 정상 종료되지 않은 경우 대비)
      useSmartGuidesStore.getState().clearGuides();

      // Ctrl+드래그로 마퀴 선택 시작
      if (e.ctrlKey) {
        const gridCoords = clientToGridCoords(e.clientX, e.clientY);
        if (gridCoords) {
          startMarqueeSelection(gridCoords.x, gridCoords.y);
        }
        return;
      }

      // 일반 클릭 시 선택 해제
      clearSelection();
    },
    [duplicateState, clientToGridCoords, clearSelection, startMarqueeSelection]
  );

  return (
    <div
      ref={(node) => {
        gridRef.current = node;
        gridContainerRef.current = node;
      }}
      className="relative w-full h-full bg-[#3A3943] rounded-[0px] overflow-hidden"
      style={{ backgroundColor: color === "transparent" ? "#3A3943" : color }}
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
        setGridAddLocalPos({
          dx: Math.round(gridCoords.x),
          dy: Math.round(gridCoords.y),
        });
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
      onMouseEnter={() => setIsGridHovered(true)}
      onMouseLeave={() => {
        setIsGridHovered(false);
        if (duplicateState) setDuplicateCursor(null);
      }}
      onMouseDownCapture={(e) => {
        if (!duplicateState || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const snapped = computeSnappedCursorFromClient(e.clientX, e.clientY);
        if (snapped && typeof onKeyDuplicate === "function") {
          // 마우스 위치에서 키의 중심이 배치되도록 조정
          const width = duplicateState.position.width || 60;
          const height = duplicateState.position.height || 60;
          onKeyDuplicate(
            duplicateState.sourceIndex,
            snapped.x - width / 2,
            snapped.y - height / 2
          );
        }
        setDuplicateState(null);
        setDuplicateCursor(null);
      }}
    >
      {/* 정확한 그리드 배경 */}
      <GridBackground
        gridSize={GRID_SNAP}
        zoom={zoom}
        panX={panX}
        panY={panY}
        color={color === "transparent" ? "#3A3943" : color}
      />
      {/* 줌/팬이 적용되는 콘텐츠 영역 */}
      <div
        ref={gridContentRef}
        className="absolute"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        {renderKeys()}
        {renderDuplicateGhost()}
        <PluginElementsRenderer
          windowType="main"
          zoom={zoom}
          panX={panX}
          panY={panY}
          onMultiDrag={(deltaX, deltaY) =>
            moveSelectedElements(deltaX, deltaY, false, false)
          }
          onMultiDragEnd={syncSelectedElementsToOverlay}
          onMultiDragStart={() => {
            // 드래그 시작 시 히스토리 저장
            const currentPositions = useKeyStore.getState().positions;
            const currentPluginElements =
              usePluginDisplayElementStore.getState().elements;
            const { keyMappings: km } = useKeyStore.getState();
            useHistoryStore
              .getState()
              .pushState(km, currentPositions, currentPluginElements);
          }}
        />
      </div>
      {/* 스마트 가이드 오버레이 */}
      <SmartGuidesOverlay zoom={zoom} panX={panX} panY={panY} />
      {/* 마퀴 선택 오버레이 */}
      <MarqueeSelectionOverlay zoom={zoom} panX={panX} panY={panY} />
      {/* 선택된 요소 표시 */}
      {selectedElements.map((el) => {
        let bounds = null;
        if (el.type === "key" && el.index !== undefined) {
          const pos = positions[selectedKeyType]?.[el.index];
          if (pos) {
            bounds = {
              x: pos.dx,
              y: pos.dy,
              width: pos.width || 60,
              height: pos.height || 60,
            };
          }
        } else if (el.type === "plugin") {
          const pluginEl = pluginElements.find((p) => p.fullId === el.id);
          if (pluginEl && pluginEl.measuredSize) {
            bounds = {
              x: pluginEl.position.x,
              y: pluginEl.position.y,
              width: pluginEl.measuredSize.width,
              height: pluginEl.measuredSize.height,
            };
          }
        }
        if (!bounds) return null;
        return (
          <div
            key={el.id}
            style={{
              position: "absolute",
              left: bounds.x * zoom + panX - 2,
              top: bounds.y * zoom + panY - 2,
              width: bounds.width * zoom + 4,
              height: bounds.height * zoom + 4,
              border: "2px solid rgba(59, 130, 246, 0.8)",
              borderRadius: "4px",
              pointerEvents: "none",
              zIndex: 20,
            }}
          />
        );
      })}
      {/* 우클릭 리스트 팝업 */}
      <div className="relative">
        <ListPopup
          open={isContextOpen}
          referenceRef={contextRef}
          position={contextPosition || undefined}
          onClose={() => {
            setIsContextOpen(false);
            setContextPosition(null);
          }}
          items={getKeyMenuItems(contextIndex)}
          onSelect={(id) => {
            if (contextIndex == null) return;

            // 플러그인 메뉴 처리
            const pluginItem = pluginKeyMenuItems.find(
              (item) => item.fullId === id
            );
            if (pluginItem) {
              const context = {
                keyCode: keyMappings[selectedKeyType]?.[contextIndex] || "",
                index: contextIndex,
                position: positions[selectedKeyType]?.[contextIndex] || {},
                mode: selectedKeyType,
              };

              try {
                const result = pluginItem.onClick(context);
                if (result && typeof result.then === "function") {
                  result.catch((error) => {
                    console.error(
                      `[Plugin Menu] Error in '${pluginItem.label}':`,
                      error
                    );
                  });
                }
              } catch (error) {
                console.error(
                  `[Plugin Menu] Error in '${pluginItem.label}':`,
                  error
                );
              }

              setIsContextOpen(false);
              setContextPosition(null);
              return;
            }

            // 기본 메뉴 처리
            if (id === "delete") {
              const globalKey =
                keyMappings[selectedKeyType]?.[contextIndex] || "";
              const displayName =
                getKeyInfoByGlobalKey(globalKey)?.displayName || globalKey;
              showConfirm(
                t("confirm.removeKey", { name: displayName }),
                () => onKeyDelete(contextIndex),
                t("confirm.remove")
              );
            } else if (id === "duplicate") {
              const keyCode =
                keyMappings[selectedKeyType]?.[contextIndex] || "";
              const position =
                positions[selectedKeyType]?.[contextIndex] || null;
              if (position) {
                const clonedNoteColor =
                  position.noteColor &&
                  typeof position.noteColor === "object" &&
                  position.noteColor !== null
                    ? { ...position.noteColor }
                    : position.noteColor;
                const clonedCounter = position.counter
                  ? {
                      ...position.counter,
                      fill: { ...position.counter.fill },
                      stroke: { ...position.counter.stroke },
                    }
                  : null;
                let initialCursor = null;
                // 현재 실제 마우스 위치를 사용 (메뉴를 클릭한 시점의 위치)
                const currentMousePos = lastMousePosRef.current;
                const snapped = computeSnappedCursorFromClient(
                  currentMousePos.x,
                  currentMousePos.y
                );
                setDuplicateState({
                  sourceIndex: contextIndex,
                  keyName: keyCode,
                  position: {
                    ...position,
                    noteColor: clonedNoteColor,
                    counter: clonedCounter,
                  },
                });
                setDuplicateCursor(initialCursor);
              }
            } else if (id === "counter") {
              // 스냅샷 저장 (모달 초기 상태 & 취소 시 복원용)
              const original =
                positions[selectedKeyType]?.[contextIndex]?.counter;
              setCounterOriginalSettings(original || null);
              setCounterApplied(false);
              setCounterTargetIndex(contextIndex);
            } else if (id === "noteColor") {
              // 노트 색상 설정 모달 열기
              setNoteColorTargetIndex(contextIndex);
            } else if (id === "counterReset") {
              const globalKey =
                keyMappings[selectedKeyType]?.[contextIndex] || "";
              const displayName =
                getKeyInfoByGlobalKey(globalKey)?.displayName || globalKey;
              showConfirm(
                t("confirm.resetKeyCounter", { name: displayName }),
                async () => {
                  try {
                    await window.api.keys.resetSingleCounter(
                      selectedKeyType,
                      globalKey
                    );
                  } catch (error) {
                    console.error("Failed to reset key counter", error);
                  }
                },
                t("confirm.reset")
              );
            } else if (id === "bringToFront") {
              if (typeof onMoveToFront === "function") {
                onMoveToFront(contextIndex);
              }
            } else if (id === "sendToBack") {
              if (typeof onMoveToBack === "function") {
                onMoveToBack(contextIndex);
              }
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
          position={gridContextClientPos || undefined}
          onClose={() => {
            setIsGridContextOpen(false);
            setGridContextClientPos(null);
            setGridAddLocalPos(null);
          }}
          items={getGridMenuItems(gridAddLocalPos)}
          onSelect={(id) => {
            // 플러그인 메뉴 처리
            const pluginItem = pluginGridMenuItems.find(
              (item) => item.fullId === id
            );
            if (pluginItem && gridAddLocalPos) {
              const context = {
                position: gridAddLocalPos,
                mode: selectedKeyType,
              };

              try {
                // 플러그인 컨텍스트 설정
                const previousPluginId = window.__dmn_current_plugin_id;
                window.__dmn_current_plugin_id = pluginItem.pluginId;

                const result = pluginItem.onClick(context);
                if (result && typeof result.then === "function") {
                  result
                    .catch((error) => {
                      console.error(
                        `[Plugin Menu] Error in '${pluginItem.label}':`,
                        error
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
                  error
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
            if (
              id === "add" &&
              gridAddLocalPos &&
              typeof onAddKeyAt === "function"
            ) {
              onAddKeyAt(gridAddLocalPos.dx, gridAddLocalPos.dy);
            } else if (id === "tabCss") {
              setIsTabCssModalOpen(true);
            }
            setIsGridContextOpen(false);
            setGridContextClientPos(null);
            setGridAddLocalPos(null);
          }}
        />
      </div>
      {selectedKey && (
        <KeySettingModal
          keyData={{
            key: selectedKey.key,
            activeImage:
              positions[selectedKeyType][selectedKey.index].activeImage,
            inactiveImage:
              positions[selectedKeyType][selectedKey.index].inactiveImage,
            activeTransparent:
              positions[selectedKeyType][selectedKey.index].activeTransparent ||
              false,
            idleTransparent:
              positions[selectedKeyType][selectedKey.index].idleTransparent ||
              false,
            width: positions[selectedKeyType][selectedKey.index].width,
            height: positions[selectedKeyType][selectedKey.index].height,
            noteColor:
              positions[selectedKeyType][selectedKey.index].noteColor ||
              "#FFFFFF",
            noteOpacity:
              positions[selectedKeyType][selectedKey.index].noteOpacity || 80,
            noteGlowEnabled:
              positions[selectedKeyType][selectedKey.index].noteGlowEnabled ??
              true,
            noteGlowSize:
              positions[selectedKeyType][selectedKey.index].noteGlowSize ?? 20,
            noteGlowOpacity:
              positions[selectedKeyType][selectedKey.index].noteGlowOpacity ??
              70,
            noteGlowColor:
              positions[selectedKeyType][selectedKey.index].noteGlowColor ||
              positions[selectedKeyType][selectedKey.index].noteColor ||
              "#FFFFFF",
            className:
              positions[selectedKeyType][selectedKey.index].className || "",
          }}
          onClose={() => setSelectedKey(null)}
          onSave={onKeyUpdate}
          skipAnimation={shouldSkipModalAnimation}
        />
      )}
      {/* 카운터 세팅 모달 */}
      {counterTargetIndex != null && (
        <CounterSettingModal
          onClose={() => {
            // 적용하지 않고 닫히는 경우, 원본으로 되돌리기 (미리보기 롤백)
            if (!counterApplied && typeof onCounterPreview === "function") {
              const original =
                counterOriginalSettings ??
                positions[selectedKeyType]?.[counterTargetIndex]?.counter;
              if (original) {
                onCounterPreview(counterTargetIndex, original);
              }
            }
            setCounterTargetIndex(null);
          }}
          onSave={(settings) => {
            if (typeof onCounterUpdate === "function") {
              onCounterUpdate(counterTargetIndex, settings);
            }
            // 저장되었음을 표시 (닫힐 때 롤백 방지)
            setCounterApplied(true);
            setCounterTargetIndex(null);
          }}
          onPreview={(settings) => {
            if (typeof onCounterPreview === "function") {
              onCounterPreview(counterTargetIndex, settings);
            }
          }}
          keyName={(() => {
            const keyCode =
              keyMappings[selectedKeyType]?.[counterTargetIndex] || "";
            return getKeyInfoByGlobalKey(keyCode)?.displayName || keyCode || "";
          })()}
          // 모달은 항상 최초 스냅샷으로 시작 (미리보기로 바뀐 값에 영향을 받지 않도록)
          initialSettings={counterOriginalSettings}
        />
      )}
      {/* 노트 색상 세팅 모달 */}
      {noteColorTargetIndex != null && (
        <NoteColorSettingModal
          onClose={() => setNoteColorTargetIndex(null)}
          onSave={(settings) => {
            if (typeof onNoteColorUpdate === "function") {
              onNoteColorUpdate(
                noteColorTargetIndex,
                settings.noteColor,
                settings.noteOpacity,
                settings.noteGlowEnabled,
                settings.noteGlowSize,
                settings.noteGlowOpacity,
                settings.noteGlowColor
              );
            }
            setNoteColorTargetIndex(null);
          }}
          initialNoteColor={
            positions[selectedKeyType]?.[noteColorTargetIndex]?.noteColor ||
            "#FFFFFF"
          }
          initialNoteOpacity={
            positions[selectedKeyType]?.[noteColorTargetIndex]?.noteOpacity ||
            80
          }
          initialNoteGlowEnabled={
            positions[selectedKeyType]?.[noteColorTargetIndex]
              ?.noteGlowEnabled ?? true
          }
          initialNoteGlowSize={
            positions[selectedKeyType]?.[noteColorTargetIndex]?.noteGlowSize ??
            20
          }
          initialNoteGlowOpacity={
            positions[selectedKeyType]?.[noteColorTargetIndex]
              ?.noteGlowOpacity ?? 70
          }
          initialNoteGlowColor={
            positions[selectedKeyType]?.[noteColorTargetIndex]?.noteGlowColor ||
            positions[selectedKeyType]?.[noteColorTargetIndex]?.noteColor ||
            "#FFFFFF"
          }
        />
      )}
      {/* 미니맵 */}
      <GridMinimap
        positions={positions[selectedKeyType] || []}
        zoom={zoom}
        panX={panX}
        panY={panY}
        containerRef={gridContainerRef}
        mode={selectedKeyType}
        visible={isGridHovered && !isExtrasPopupOpen}
      />
      {/* 줌 레벨 표시 */}
      <ZoomIndicator zoom={zoom} />
      {/* 탭 CSS 설정 모달 */}
      <TabCssModal
        isOpen={isTabCssModalOpen}
        onClose={() => setIsTabCssModalOpen(false)}
        showAlert={showAlert}
      />
    </div>
  );
}
