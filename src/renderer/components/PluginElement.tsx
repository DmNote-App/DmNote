import React, { useRef, useEffect, useMemo, useState } from "react";
import { PluginDisplayElementInternal } from "@src/types/api";
import { useDraggable } from "@hooks/useDraggable";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import { useKeyStore } from "@stores/useKeyStore";
import ListPopup, { ListItem } from "./main/Modal/ListPopup";

type PatchTarget = Element | ShadowRoot;

const createNodesFromHtml = (html: string): Node[] => {
  if (typeof document === "undefined") {
    return [];
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  return Array.from(template.content.childNodes).map((node) =>
    node.cloneNode(true)
  );
};

const canPatchNode = (current: Node, next: Node): boolean => {
  if (current.nodeType !== next.nodeType) return false;
  if (
    current.nodeType === Node.ELEMENT_NODE &&
    next.nodeType === Node.ELEMENT_NODE
  ) {
    return (current as Element).tagName === (next as Element).tagName;
  }
  return true;
};

const syncAttributes = (target: Element, source: Element): void => {
  for (const attr of Array.from(target.attributes)) {
    if (!source.hasAttribute(attr.name)) {
      target.removeAttribute(attr.name);
    }
  }
  for (const attr of Array.from(source.attributes)) {
    const value = attr.value;
    if (target.getAttribute(attr.name) !== value) {
      target.setAttribute(attr.name, value);
    }
  }
};
function reconcileChildren(
  parent: PatchTarget,
  oldNodes: Node[],
  newNodes: Node[]
): void {
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldNodes.length || newIndex < newNodes.length) {
    const currentOld = oldNodes[oldIndex];
    const currentNew = newNodes[newIndex];

    if (!currentNew && currentOld) {
      parent.removeChild(currentOld);
      oldIndex += 1;
      continue;
    }

    if (!currentOld && currentNew) {
      parent.appendChild(currentNew.cloneNode(true));
      newIndex += 1;
      continue;
    }

    if (!currentOld || !currentNew) {
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    if (canPatchNode(currentOld, currentNew)) {
      patchNode(currentOld, currentNew);
    } else {
      parent.replaceChild(currentNew.cloneNode(true), currentOld);
    }

    oldIndex += 1;
    newIndex += 1;
  }
}

function patchNode(current: Node, next: Node): void {
  if (!canPatchNode(current, next)) {
    current.parentNode?.replaceChild(next.cloneNode(true), current);
    return;
  }

  if (
    current.nodeType === Node.TEXT_NODE ||
    current.nodeType === Node.COMMENT_NODE
  ) {
    if (current.textContent !== next.textContent) {
      current.textContent = next.textContent ?? "";
    }
    return;
  }

  if (
    current.nodeType === Node.ELEMENT_NODE &&
    next.nodeType === Node.ELEMENT_NODE
  ) {
    const currentEl = current as Element;
    const nextEl = next as Element;
    syncAttributes(currentEl, nextEl);
    reconcileChildren(
      currentEl,
      Array.from(currentEl.childNodes),
      Array.from(nextEl.childNodes)
    );
  }
}

function patchDomWithHtml(target: PatchTarget, html: string): void {
  const nextNodes = createNodesFromHtml(html);
  const currentNodes = Array.from(target.childNodes);
  reconcileChildren(target, currentNodes, nextNodes);
}

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
  const hasRenderedHtmlRef = useRef(false);
  const lastHtmlRef = useRef<string>("");
  const updateElement = usePluginDisplayElementStore(
    (state) => state.updateElement
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

        // onPositionChange 핸들러 호출 (자동 래핑되어 있음)
        if (
          element.onPositionChange &&
          typeof element.onPositionChange === "string"
        ) {
          const handler = (window as any)[element.onPositionChange];
          if (typeof handler === "function") {
            handler({ x: newX, y: newY });
          }
        }
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

  // HTML 콘텐츠 렌더링 + 이벤트 위임
  useEffect(() => {
    const target = element.scoped
      ? shadowRootRef.current
      : containerRef.current;
    if (!target) return;

    const nextHtml = element.html || "";
    const htmlChanged = lastHtmlRef.current !== nextHtml;

    if (!hasRenderedHtmlRef.current) {
      target.innerHTML = nextHtml;
      hasRenderedHtmlRef.current = true;
    } else if (htmlChanged) {
      patchDomWithHtml(target, nextHtml);
    }
    lastHtmlRef.current = nextHtml;

    // 메인 윈도우에서만 실제 크기 측정 후 store 업데이트
    if (windowType === "main" && containerRef.current && htmlChanged) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const measuredWidth = Math.ceil(rect.width);
          const measuredHeight = Math.ceil(rect.height);

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

    // data-plugin-handler 이벤트 위임 (메인 윈도우에서만)
    if (windowType === "main") {
      // Input blur 핸들러: min/max 자동 정규화
      const handleInputBlur = (e: Event) => {
        const targetEl = e.target as HTMLInputElement;
        if (
          targetEl.tagName === "INPUT" &&
          targetEl.type === "number" &&
          targetEl.hasAttribute("data-plugin-input-blur")
        ) {
          const minStr = targetEl.getAttribute("data-plugin-input-min");
          const maxStr = targetEl.getAttribute("data-plugin-input-max");
          const currentValue = targetEl.value;

          // 빈 값이거나 숫자가 아닌 경우
          if (currentValue === "" || isNaN(parseFloat(currentValue))) {
            // min이 있으면 min으로, 없으면 0으로
            const defaultValue = minStr ? parseFloat(minStr) : 0;
            targetEl.value = String(defaultValue);
            // change 이벤트 발생
            targetEl.dispatchEvent(new Event("change", { bubbles: true }));
            return;
          }

          const numValue = parseFloat(currentValue);
          let clampedValue = numValue;

          // min/max 범위로 제한
          if (minStr && numValue < parseFloat(minStr)) {
            clampedValue = parseFloat(minStr);
          }
          if (maxStr && numValue > parseFloat(maxStr)) {
            clampedValue = parseFloat(maxStr);
          }

          // 값이 변경되었으면 업데이트
          if (clampedValue !== numValue) {
            targetEl.value = String(clampedValue);
            // change 이벤트 발생
            targetEl.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      };

      // 체크박스 토글 기능
      const handleCheckboxToggle = (e: Event) => {
        const targetEl = e.target as HTMLElement;
        const checkbox = targetEl.closest("[data-checkbox-toggle]");
        if (checkbox) {
          const input = checkbox.querySelector(
            "input[type=checkbox]"
          ) as HTMLInputElement;
          const knob = checkbox.querySelector("div") as HTMLElement;

          if (input) {
            input.checked = !input.checked;

            // 스타일 토글
            if (input.checked) {
              checkbox.classList.remove("bg-[#3B4049]");
              checkbox.classList.add("bg-[#493C1D]");
              knob.classList.remove("left-[2px]", "bg-[#989BA6]");
              knob.classList.add("left-[13px]", "bg-[#FFB400]");
            } else {
              checkbox.classList.remove("bg-[#493C1D]");
              checkbox.classList.add("bg-[#3B4049]");
              knob.classList.remove("left-[13px]", "bg-[#FFB400]");
              knob.classList.add("left-[2px]", "bg-[#989BA6]");
            }

            // change 이벤트 발생
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      };

      // 드롭다운 토글 기능
      const handleDropdownToggle = (e: Event) => {
        const targetEl = e.target as HTMLElement;
        const toggleBtn = targetEl.closest("[data-dropdown-toggle]");
        const dropdownItem = targetEl.closest(
          "[data-dropdown-menu] button"
        ) as HTMLElement;

        if (toggleBtn) {
          const dropdown = toggleBtn.closest(".plugin-dropdown");
          const menu = dropdown?.querySelector("[data-dropdown-menu]");
          const arrow = toggleBtn.querySelector("svg");

          if (menu && arrow) {
            const isHidden = menu.classList.contains("hidden");
            if (isHidden) {
              menu.classList.remove("hidden");
              menu.classList.add("flex");
              arrow.style.transform = "rotate(180deg)";
            } else {
              menu.classList.add("hidden");
              menu.classList.remove("flex");
              arrow.style.transform = "rotate(0deg)";
            }
          }
          e.stopPropagation();
        } else if (dropdownItem) {
          const dropdown = dropdownItem.closest(".plugin-dropdown");
          const menu = dropdown?.querySelector("[data-dropdown-menu]");
          const arrow = dropdown?.querySelector("svg");
          const display = dropdown?.querySelector(
            "[data-dropdown-toggle] span"
          );
          const value = dropdownItem.getAttribute("data-value");

          if (dropdown && menu && arrow && display && value) {
            // 선택 값 업데이트
            dropdown.setAttribute("data-selected", value);
            display.textContent = dropdownItem.textContent?.trim() || value;

            // 메뉴 닫기
            menu.classList.add("hidden");
            menu.classList.remove("flex");
            arrow.style.transform = "rotate(0deg)";

            // change 이벤트 발생
            const changeEvent = new Event("change", { bubbles: true });
            dropdown.dispatchEvent(changeEvent);
          }
          e.stopPropagation();
        }
      };

      const handleEvent = (e: Event) => {
        const targetEl = e.target as HTMLElement;
        const handlerAttr =
          e.type === "click"
            ? "data-plugin-handler"
            : e.type === "input"
            ? "data-plugin-handler-input"
            : e.type === "change"
            ? "data-plugin-handler-change"
            : null;

        if (!handlerAttr) return;

        // 클릭/변경된 요소 또는 부모에서 핸들러 찾기
        let currentElement: HTMLElement | null = targetEl;
        let handlerName: string | null = null;

        while (currentElement && currentElement !== target) {
          handlerName = currentElement.getAttribute(handlerAttr);
          if (handlerName) break;
          currentElement = currentElement.parentElement;
        }

        if (!handlerName) return;

        // 핸들러 실행 (자동 래핑되어 있음)
        const handler = (window as any)[handlerName];
        if (typeof handler === "function") {
          handler(e);
        }
      };

      target.addEventListener("click", handleCheckboxToggle);
      target.addEventListener("click", handleDropdownToggle);
      target.addEventListener("click", handleEvent);
      target.addEventListener("change", handleEvent);
      target.addEventListener("input", handleEvent);
      target.addEventListener("blur", handleInputBlur, true); // capture phase

      // cleanup
      return () => {
        target.removeEventListener("click", handleCheckboxToggle);
        target.removeEventListener("click", handleDropdownToggle);
        target.removeEventListener("click", handleEvent);
        target.removeEventListener("change", handleEvent);
        target.removeEventListener("input", handleEvent);
        target.removeEventListener("blur", handleInputBlur, true);
      };
    }

    return undefined;
  }, [element.html, element.scoped, element.fullId, updateElement, windowType]);

  const renderX = draggable.dx;
  const renderY = draggable.dy;

  const elementStyle: React.CSSProperties = useMemo(
    () => ({
      position: "absolute",
      left: 0,
      top: 0,
      transform: `translate3d(${renderX}px, ${renderY}px, 0)`,
      zIndex: element.zIndex ?? 50, // 기본값: 키(0-1)보다 위, 컨텍스트 메뉴(1000)보다 아래
      cursor:
        element.draggable && windowType === "main"
          ? "move"
          : element.onClick && windowType === "main"
          ? "pointer"
          : "default",
      willChange: "transform",
      pointerEvents: windowType === "main" ? "auto" : "none",
      ...element.style,
    }),
    [
      renderX,
      renderY,
      element.zIndex,
      element.draggable,
      element.onClick,
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

  // onClick 핸들러
  const handleClick = (e: React.MouseEvent) => {
    // onClick 핸들러가 있고, 메인 윈도우에서만
    if (!element.onClick || windowType !== "main") return;

    // 우클릭은 컨텍스트 메뉴용이므로 제외
    if (e.button !== 0) return;

    // onClick 핸들러 실행 (자동 래핑되어 있음)
    if (typeof element.onClick === "string") {
      const handler = (window as any)[element.onClick];
      if (typeof handler === "function") {
        handler(e);
      }
    }
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
      // onDelete 핸들러 호출 (자동 래핑되어 있음)
      if (element.onDelete && typeof element.onDelete === "string") {
        const handler = (window as any)[element.onDelete];
        if (typeof handler === "function") {
          handler();
        }
      }

      if (window.api?.ui?.displayElement) {
        window.api.ui.displayElement.remove(element.fullId);
      } else {
        usePluginDisplayElementStore.getState().removeElement(element.fullId);
      }
    } else if (itemId.startsWith("custom-")) {
      const index = parseInt(itemId.replace("custom-", ""), 10);
      const customItem = element.contextMenu?.customItems?.[index];
      if (customItem) {
        // 커스텀 메뉴 실행 (자동 래핑되어 있음)
        customItem.onClick({ element });
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
        onClick={handleClick}
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
