import React, { useRef, useEffect, useMemo, useState } from "react";
import { PluginDisplayElementInternal } from "@src/types/api";
import { useDraggable } from "@hooks/useDraggable";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import { useKeyStore } from "@stores/useKeyStore";
import ListPopup, { ListItem } from "./main/Modal/ListPopup";

interface PluginElementProps {
  element: PluginDisplayElementInternal;
  windowType: "main" | "overlay";
  positionOffset?: { x: number; y: number };
}

export const PluginElement: React.FC<PluginElementProps> = ({
  element,
  windowType,
  positionOffset = { x: 0, y: 0 },
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const updateElement = usePluginDisplayElementStore(
    (state) => state.updateElement
  );
  const removeElement = usePluginDisplayElementStore(
    (state) => state.removeElement
  );
  const positions = useKeyStore((state) => state.positions);
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);

  // 컨텍스트 메뉴 상태
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({
    x: 0,
    y: 0,
  });

  // 앵커 기반 위치 계산
  const calculatedPosition = useMemo(() => {
    let baseX = element.position.x;
    let baseY = element.position.y;

    // 앵커가 있으면 키 위치 기반으로 계산
    if (element.anchor?.keyCode && positions && selectedKeyType) {
      const keyMappings = useKeyStore.getState().keyMappings;
      const modeKeys = keyMappings[selectedKeyType] || [];
      const keyIndex = modeKeys.findIndex(
        (key) => key === element.anchor?.keyCode
      );

      if (keyIndex >= 0 && positions[selectedKeyType]?.[keyIndex]) {
        const keyPosition = positions[selectedKeyType][keyIndex];
        const offsetX = element.anchor.offset?.x ?? 0;
        const offsetY = element.anchor.offset?.y ?? 0;

        baseX = keyPosition.dx + offsetX;
        baseY = keyPosition.dy + offsetY;
      }
    }

    // 오버레이에서는 positionOffset 적용
    return {
      x: baseX + positionOffset.x,
      y: baseY + positionOffset.y,
    };
  }, [
    element.anchor,
    element.position,
    positions,
    selectedKeyType,
    positionOffset,
  ]);

  // 드래그 지원 (main 윈도우에서만)
  const draggable = useDraggable({
    gridSize: 5,
    initialX: calculatedPosition.x,
    initialY: calculatedPosition.y,
    onPositionChange: (newX, newY) => {
      if (windowType === "main" && element.draggable) {
        updateElement(element.fullId, {
          position: { x: newX, y: newY },
          anchor: undefined, // 드래그하면 앵커 제거
        });
      }
    },
  });

  // Shadow DOM 설정 (scoped 옵션)
  useEffect(() => {
    if (element.scoped && containerRef.current && !shadowRootRef.current) {
      try {
        shadowRootRef.current = containerRef.current.attachShadow({
          mode: "open",
        });
      } catch (err) {
        console.warn(
          `[PluginElement] Shadow DOM already attached for ${element.fullId}`
        );
      }
    }
  }, [element.scoped, element.fullId]);

  // HTML 콘텐츠 렌더링
  useEffect(() => {
    const target = element.scoped
      ? shadowRootRef.current
      : containerRef.current;
    if (target) {
      target.innerHTML = element.html;

      // 메인 윈도우에서만 실제 크기 측정 후 store 업데이트
      if (windowType === "main" && containerRef.current) {
        requestAnimationFrame(() => {
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const measuredWidth = Math.ceil(rect.width);
            const measuredHeight = Math.ceil(rect.height);

            // 크기가 변경되었거나 처음 측정되는 경우에만 업데이트
            if (
              !element.measuredSize ||
              element.measuredSize.width !== measuredWidth ||
              element.measuredSize.height !== measuredHeight
            ) {
              updateElement(element.fullId, {
                measuredSize: { width: measuredWidth, height: measuredHeight },
              });
            }
          }
        });
      }
    }
  }, [
    element.html,
    element.scoped,
    element.fullId,
    element.measuredSize,
    updateElement,
    windowType,
  ]);

  const renderX = draggable.dx;
  const renderY = draggable.dy;

  const elementStyle: React.CSSProperties = useMemo(
    () => ({
      position: "absolute",
      left: 0,
      top: 0,
      transform: `translate3d(${renderX}px, ${renderY}px, 0)`,
      zIndex: element.zIndex ?? 50, // 기본값: 키(0-1)보다 위, 컨텍스트 메뉴(1000)보다 아래
      cursor: element.draggable && windowType === "main" ? "move" : "default",
      willChange: "transform",
      pointerEvents: windowType === "main" ? "auto" : "none",
      ...element.style,
    }),
    [
      renderX,
      renderY,
      element.zIndex,
      element.draggable,
      element.style,
      windowType,
    ]
  );

  const attachRef = (node: HTMLDivElement | null) => {
    if (node) {
      containerRef.current = node;
      if (element.draggable && windowType === "main") {
        draggable.ref(node);
      }
    }
  };

  // 컨텍스트 메뉴 핸들러
  const handleContextMenu = (e: React.MouseEvent) => {
    // contextMenu 옵션이 있고, 메인 윈도우에서만
    if (!element.contextMenu || windowType !== "main") return;

    const {
      enableDelete = true,
      deleteLabel = "🗑️ 삭제",
      customItems = [],
    } = element.contextMenu;

    // 메뉴 항목이 하나도 없으면 표시 안 함
    if (!enableDelete && customItems.length === 0) return;

    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuOpen(true);
  };

  // 컨텍스트 메뉴 항목 생성
  const contextMenuItems = useMemo<ListItem[]>(() => {
    if (!element.contextMenu) return [];

    const {
      enableDelete = true,
      deleteLabel = "삭제",
      customItems = [],
    } = element.contextMenu;
    const items: ListItem[] = [];

    if (enableDelete) {
      items.push({ id: "delete", label: deleteLabel });
    }

    // 커스텀 항목 추가
    customItems.forEach((item, index) => {
      items.push({
        id: `custom-${index}`,
        label: item.label,
      });
    });

    return items;
  }, [element.contextMenu]);

  // 컨텍스트 메뉴 항목 선택
  const handleContextMenuSelect = (itemId: string) => {
    if (itemId === "delete") {
      removeElement(element.fullId);
    } else if (itemId.startsWith("custom-")) {
      const index = parseInt(itemId.replace("custom-", ""), 10);
      const customItem = element.contextMenu?.customItems?.[index];
      if (customItem) {
        // 커스텀 메뉴 실행 시 플러그인 컨텍스트 설정
        const previousPluginId = (window as any).__dmn_current_plugin_id;
        (window as any).__dmn_current_plugin_id = element.pluginId;

        try {
          customItem.onClick({ element });
        } finally {
          (window as any).__dmn_current_plugin_id = previousPluginId;
        }
      }
    }
  };
  return (
    <>
      <div
        ref={attachRef}
        id={element.id}
        className={element.className}
        style={elementStyle}
        data-plugin-element={element.fullId}
        data-plugin-id={element.pluginId}
        onContextMenu={handleContextMenu}
      />

      {/* 컨텍스트 메뉴 */}
      {windowType === "main" && element.contextMenu && (
        <ListPopup
          open={contextMenuOpen}
          position={contextMenuPosition}
          onClose={() => setContextMenuOpen(false)}
          items={contextMenuItems}
          onSelect={handleContextMenuSelect}
          className="!z-[10000]"
        />
      )}
    </>
  );
};
