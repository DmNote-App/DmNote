import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useTranslation } from "@contexts/I18nContext";
import DraggableKey from "@components/Key";
import { getKeyInfoByGlobalKey } from "@utils/KeyMaps";
import KeySettingModal from "./Modal/content/KeySetting";
import CounterSettingModal from "./Modal/content/CounterSetting";
import ListPopup from "./Modal/ListPopup";
import { useKeyStore } from "@stores/useKeyStore";
import { usePluginMenuStore } from "@stores/usePluginMenuStore";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import { PluginElementsRenderer } from "@components/PluginElementsRenderer";
import { translatePluginMessage } from "@utils/pluginI18n";
import { useGridZoomPan } from "@hooks/useGridZoomPan";
import GridMinimap from "./GridMinimap";
import ZoomIndicator from "./ZoomIndicator";

const GRID_SNAP = 5;
const snapToGrid = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / GRID_SNAP) * GRID_SNAP;
};
const snapCursorToGrid = (x, y) => ({
  x: snapToGrid(x),
  y: snapToGrid(y),
});

export default function Grid({
  showConfirm,
  selectedKey,
  setSelectedKey,
  keyMappings,
  positions,
  onPositionChange,
  onKeyUpdate,
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

  // 플러그인 메뉴 아이템
  const pluginKeyMenuItems = usePluginMenuStore((state) => state.keyMenuItems);
  const pluginGridMenuItems = usePluginMenuStore(
    (state) => state.gridMenuItems
  );
  const pluginDefinitions = usePluginDisplayElementStore(
    (state) => state.definitions
  );

  const pluginMessagesById = useMemo(() => {
    const map = new Map();
    pluginDefinitions.forEach((def) => {
      if (!map.has(def.pluginId)) {
        map.set(def.pluginId, def.messages);
      }
    });
    return map;
  }, [pluginDefinitions]);

  const resolvePluginLabel = useCallback(
    (pluginId, rawLabel) =>
      translatePluginMessage({
        messages: pluginMessagesById.get(pluginId),
        locale,
        key: rawLabel,
        fallback: rawLabel,
      }),
    [pluginMessagesById, locale]
  );

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

  // 키 메뉴 아이템 생성 (기본 + 플러그인)
  const getKeyMenuItems = () => {
    const baseItems = [
      { id: "delete", label: t("contextMenu.deleteKey") },
      { id: "duplicate", label: t("contextMenu.duplicateKey") },
      { id: "counter", label: t("contextMenu.counterSetting") },
      { id: "bringToFront", label: t("contextMenu.bringToFront") },
      { id: "sendToBack", label: t("contextMenu.sendToBack") },
    ];

    // 플러그인 메뉴 필터링 (조건부 표시)
    const context =
      contextIndex !== null
        ? {
            keyCode: keyMappings[selectedKeyType]?.[contextIndex] || "",
            index: contextIndex,
            position: positions[selectedKeyType]?.[contextIndex] || {},
            mode: selectedKeyType,
          }
        : null;

    const filterPluginItems = (items) => {
      if (!context) return [];
      return items
        .filter((item) => {
          // visible 체크
          if (item.visible === false) return false;
          if (typeof item.visible === "function" && !item.visible(context))
            return false;
          return true;
        })
        .map((item) => ({
          id: item.fullId,
          label: resolvePluginLabel(item.pluginId, item.label),
          disabled:
            typeof item.disabled === "function"
              ? item.disabled(context)
              : item.disabled || false,
          isPlugin: true,
        }));
    };

    const topPluginItems = filterPluginItems(
      pluginKeyMenuItems.filter((i) => i.position === "top")
    );
    const bottomPluginItems = filterPluginItems(
      pluginKeyMenuItems.filter((i) => i.position !== "top")
    );

    return [...topPluginItems, ...baseItems, ...bottomPluginItems];
  };

  // 그리드 메뉴 아이템 생성 (기본 + 플러그인)
  const getGridMenuItems = () => {
    const baseItems = [{ id: "add", label: t("tooltip.addKey") }];

    // 플러그인 메뉴 필터링
    const context = gridAddLocalPos
      ? {
          position: gridAddLocalPos,
          mode: selectedKeyType,
        }
      : null;

    const filterPluginItems = (items) => {
      if (!context) return [];
      return items
        .filter((item) => {
          if (item.visible === false) return false;
          if (typeof item.visible === "function" && !item.visible(context))
            return false;
          return true;
        })
        .map((item) => ({
          id: item.fullId,
          label: resolvePluginLabel(item.pluginId, item.label),
          disabled:
            typeof item.disabled === "function"
              ? item.disabled(context)
              : item.disabled || false,
          isPlugin: true,
        }));
    };

    const topPluginItems = filterPluginItems(
      pluginGridMenuItems.filter((i) => i.position === "top")
    );
    const bottomPluginItems = filterPluginItems(
      pluginGridMenuItems.filter((i) => i.position !== "top")
    );

    return [...topPluginItems, ...baseItems, ...bottomPluginItems];
  };

  // 그리드 컨텍스트 메뉴
  const [isGridContextOpen, setIsGridContextOpen] = useState(false);
  const [gridContextClientPos, setGridContextClientPos] = useState(null);
  const [gridAddLocalPos, setGridAddLocalPos] = useState(null);

  // Undo/Redo 단축키 핸들러
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 입력 요소에서는 단축키 무시
      const target = e.target;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Ctrl+Z: Undo
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (canUndo && typeof onUndo === "function") {
          onUndo();
        }
      }
      // Ctrl+Shift+Z: Redo
      else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (canRedo && typeof onRedo === "function") {
          onRedo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, onUndo, onRedo]);

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

  return (
    <div
      ref={(node) => {
        gridRef.current = node;
        gridContainerRef.current = node;
      }}
      className="grid-bg relative w-full h-full bg-[#3A3943] rounded-[0px] overflow-hidden"
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
      onMouseMove={(e) => {
        if (!duplicateState) return;
        const snapped = computeSnappedCursorFromClient(e.clientX, e.clientY);
        if (snapped) {
          console.log("onMouseMove snapped:", snapped);
          setDuplicateCursor(snapped);
        }
      }}
      onMouseLeave={() => {
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
        />
      </div>
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
          items={getKeyMenuItems()}
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
          items={getGridMenuItems()}
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
      {/* 미니맵 */}
      <GridMinimap
        positions={positions[selectedKeyType] || []}
        zoom={zoom}
        panX={panX}
        panY={panY}
        containerRef={gridContainerRef}
        mode={selectedKeyType}
      />
      {/* 줌 레벨 표시 */}
      <ZoomIndicator zoom={zoom} />
    </div>
  );
}
