import React, {
  useRef,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import {
  PluginDisplayElementInternal,
  ElementResizeAnchor,
} from "@src/types/api";
import { useDraggable } from "@hooks/useDraggable";
import { useHistoryStore } from "@stores/useHistoryStore";
import { useKeyStore as useKeyStoreForHistory } from "@stores/useKeyStore";
import { useSmartGuidesElements } from "@hooks/useSmartGuidesElements";

/**
 * 리사이즈 앵커에 따라 크기 변경 시 위치 보정값 계산
 */
function calculateAnchorOffset(
  anchor: ElementResizeAnchor,
  prevSize: { width: number; height: number },
  newSize: { width: number; height: number }
): { dx: number; dy: number } {
  const dw = newSize.width - prevSize.width;
  const dh = newSize.height - prevSize.height;

  let dx = 0;
  let dy = 0;

  // X축 보정 (center, right 계열)
  if (anchor.includes("center") && !anchor.startsWith("center")) {
    // top-center, bottom-center
    dx = -dw / 2;
  } else if (anchor === "center") {
    dx = -dw / 2;
  } else if (anchor.includes("right")) {
    dx = -dw;
  } else if (anchor === "center-left") {
    dx = 0;
  } else if (anchor === "center-right") {
    dx = -dw;
  }

  // Y축 보정 (center, bottom 계열)
  if (anchor.startsWith("center")) {
    // center-left, center, center-right
    dy = -dh / 2;
  } else if (anchor.startsWith("bottom")) {
    dy = -dh;
  }

  return { dx, dy };
}
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import { useKeyStore } from "@stores/useKeyStore";
import { useTranslation } from "@contexts/I18nContext";
import ListPopup, { ListItem } from "./main/Modal/ListPopup";
import { html, styleMap, css } from "@utils/templateEngine";
import { translatePluginMessage } from "@utils/pluginI18n";
import {
  registerExposedActions,
  clearExposedActions,
} from "@utils/displayElementActions";

interface PluginElementProps {
  element: PluginDisplayElementInternal;
  windowType: "main" | "overlay";
  positionOffset?: { x: number; y: number };
  zoom?: number;
  panX?: number;
  panY?: number;
}

export const PluginElement: React.FC<PluginElementProps> = ({
  element,
  windowType,
  positionOffset = { x: 0, y: 0 },
  zoom = 1,
  panX = 0,
  panY = 0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);
  const updateElement = usePluginDisplayElementStore(
    (state) => state.updateElement
  );
  const updateElementBatched = usePluginDisplayElementStore(
    (state) => state.updateElementBatched
  );
  const definitions = usePluginDisplayElementStore(
    (state) => state.definitions
  );
  const definition = element.definitionId
    ? definitions.get(element.definitionId)
    : undefined;
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const localeRef = useRef(locale);

  // 이전 크기를 추적하여 리사이즈 앵커 기반 위치 보정에 사용
  // 초기값으로 element.measuredSize를 사용하여 리로드 후에도 올바르게 동작
  const prevMeasuredSizeRef = useRef<{ width: number; height: number } | null>(
    element.measuredSize ? { ...element.measuredSize } : null
  );

  // 이전 앵커를 추적하여 앵커 변경 시 prevMeasuredSizeRef 리셋
  const prevAnchorRef = useRef<string | undefined>(
    element.resizeAnchor || definition?.resizeAnchor || "top-left"
  );

  // 이전 줌 값을 추적하여 줌 변경 시 위치 보정을 스킵
  const prevZoomRef = useRef<number>(zoom);

  // 앵커가 변경되면 prevMeasuredSizeRef를 현재 크기로 리셋
  // 이렇게 하면 앵커 변경 직후의 크기 변화에서 불필요한 위치 보정이 발생하지 않음
  useEffect(() => {
    const currentAnchor =
      element.resizeAnchor || definition?.resizeAnchor || "top-left";
    if (prevAnchorRef.current !== currentAnchor) {
      // 앵커가 변경됨 - 현재 측정된 크기로 리셋
      if (element.measuredSize) {
        prevMeasuredSizeRef.current = { ...element.measuredSize };
      }
      prevAnchorRef.current = currentAnchor;
    }
  }, [element.resizeAnchor, definition?.resizeAnchor, element.measuredSize]);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  const pluginTranslate = useCallback(
    (
      key: string,
      params?: Record<string, string | number>,
      fallback?: string
    ) =>
      translatePluginMessage({
        messages: definition?.messages,
        locale,
        key,
        params,
        fallback,
      }),
    [definition?.messages, locale]
  );

  const pluginTranslateStable = useCallback(
    (
      key: string,
      params?: Record<string, string | number>,
      fallback?: string
    ) =>
      translatePluginMessage({
        messages: definition?.messages,
        locale: localeRef.current,
        key,
        params,
        fallback,
      }),
    [definition?.messages]
  );

  const positions = useKeyStore((state) => state.positions);
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  const exposedActionsRef = useRef<Record<string, (...args: any[]) => any>>({});

  // Settings 변경 감지용 ref와 콜백 리스트
  const prevSettingsRef = useRef<Record<string, any> | null>(null);
  const settingsChangeListenersRef = useRef<
    Set<
      (
        newSettings: Record<string, any>,
        oldSettings: Record<string, any>
      ) => void
    >
  >(new Set());

  // Settings 변경 감지 (overlay에서만)
  useEffect(() => {
    if (windowType !== "overlay") return;

    const currentSettings = element.settings || {};
    const prevSettings = prevSettingsRef.current;

    // 최초 마운트 시에는 이전 설정 저장만
    if (prevSettings === null) {
      prevSettingsRef.current = { ...currentSettings };
      return;
    }

    // 설정이 실제로 변경되었는지 확인
    const hasChanged =
      JSON.stringify(currentSettings) !== JSON.stringify(prevSettings);

    if (hasChanged) {
      // 모든 리스너에게 변경 알림
      settingsChangeListenersRef.current.forEach((listener) => {
        try {
          listener(currentSettings, prevSettings);
        } catch (error) {
          console.error(
            "[PluginElement] onSettingsChange listener error:",
            error
          );
        }
      });

      // 이전 설정 업데이트
      prevSettingsRef.current = { ...currentSettings };
    }
  }, [windowType, element.settings]);

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

  // 히스토리 저장 함수 (드래그 시작 시 호출)
  const saveToHistory = useCallback(() => {
    if (windowType !== "main") return;

    const { keyMappings, positions } = useKeyStoreForHistory.getState();
    const pluginElements = usePluginDisplayElementStore.getState().elements;
    useHistoryStore
      .getState()
      .pushState(keyMappings, positions, pluginElements);
  }, [windowType]);

  // 스마트 가이드를 위한 다른 요소들의 bounds 가져오기
  const { getOtherElements } = useSmartGuidesElements();

  // 드래그 지원 (main 윈도우에서만)
  const draggable = useDraggable({
    gridSize: 5,
    initialX: calculatedPosition.x,
    initialY: calculatedPosition.y,
    onDragStart: saveToHistory, // 드래그 시작 시 히스토리 저장
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
    zoom,
    panX,
    panY,
    // 스마트 가이드 옵션
    elementId: element.fullId,
    elementWidth: element.measuredSize?.width || 100,
    elementHeight: element.measuredSize?.height || 100,
    getOtherElements: windowType === "main" ? getOtherElements : null,
  });

  const { ref: draggableRef, dx: renderX, dy: renderY } = draggable;

  // Shadow DOM 설정 (scoped 옵션)
  useEffect(() => {
    if (element.scoped && containerRef.current && !shadowRoot) {
      try {
        // 이미 shadowRoot가 있는지 확인
        if (containerRef.current.shadowRoot) {
          setShadowRoot(containerRef.current.shadowRoot);
        } else {
          const root = containerRef.current.attachShadow({
            mode: "open",
          });
          setShadowRoot(root);
        }
      } catch (err) {
        console.warn(
          `[PluginElement] Shadow DOM already attached for ${element.fullId}`
        );
      }
    }
  }, [element.scoped, element.fullId, shadowRoot]);

  // 템플릿 렌더링 결과 계산
  const renderedContent = useMemo(() => {
    if (definition && definition.template) {
      const state = element.state || {};
      const settings = element.settings || {};

      const renderState =
        windowType === "main" && definition.previewState
          ? { ...state, ...definition.previewState }
          : state;

      try {
        return definition.template(renderState, settings, {
          html: html as any,
          styleMap,
          css,
          locale,
          t: pluginTranslate,
        });
      } catch (error) {
        console.error(`[PluginElement] Template render error:`, error);
        return null;
      }
    }
    return null;
  }, [
    definition,
    element.state,
    element.settings,
    windowType,
    locale,
    pluginTranslate,
  ]);

  // 이벤트 위임 (메인 윈도우에서만)
  useEffect(() => {
    const target = element.scoped ? shadowRoot : containerRef.current;
    if (!target) return;

    // 메인 윈도우에서만 실제 크기 측정 후 store 업데이트
    if (windowType === "main" && containerRef.current) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const measuredWidth = Math.ceil(rect.width / zoom);
          const measuredHeight = Math.ceil(rect.height / zoom);
          const newSize = { width: measuredWidth, height: measuredHeight };

          // 줌이 변경되었는지 확인
          const zoomChanged = prevZoomRef.current !== zoom;
          prevZoomRef.current = zoom;

          // 현재 크기와 이전 크기 비교
          const prevSize = prevMeasuredSizeRef.current;
          const sizeChanged =
            !element.measuredSize ||
            element.measuredSize.width !== measuredWidth ||
            element.measuredSize.height !== measuredHeight;

          if (sizeChanged) {
            // 리사이즈 앵커 결정 (우선순위: element > definition > default)
            const resizeAnchor: ElementResizeAnchor =
              element.resizeAnchor || definition?.resizeAnchor || "top-left";

            // 줌 변경으로 인한 크기 측정 차이는 위치 보정하지 않음
            // 실제 콘텐츠 변화에 의한 크기 변경만 위치 보정
            const shouldAdjustPosition =
              prevSize && resizeAnchor !== "top-left" && !zoomChanged;

            if (shouldAdjustPosition) {
              const { dx, dy } = calculateAnchorOffset(
                resizeAnchor,
                prevSize,
                newSize
              );

              if (dx !== 0 || dy !== 0) {
                // 위치와 크기를 함께 업데이트
                updateElement(element.fullId, {
                  position: {
                    x: element.position.x + dx,
                    y: element.position.y + dy,
                  },
                  measuredSize: newSize,
                });
              } else {
                updateElement(element.fullId, {
                  measuredSize: newSize,
                });
              }
            } else {
              // 첫 측정이거나 top-left 앵커이거나 줌 변경인 경우 크기만 업데이트
              updateElement(element.fullId, {
                measuredSize: newSize,
              });
            }

            // 이전 크기 저장
            prevMeasuredSizeRef.current = newSize;
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
  }, [
    element.scoped,
    element.fullId,
    element.position,
    element.resizeAnchor,
    updateElement,
    windowType,
    shadowRoot,
    renderedContent, // 컨텐츠 변경 시 크기 재측정
    zoom,
    definition?.resizeAnchor,
  ]);

  // Overlay Logic (onMount)
  useEffect(() => {
    if (windowType !== "overlay") return;

    if (!definition) {
      // definition이 아직 로드되지 않았을 수 있음.
      // definitions가 업데이트되면 리렌더링되므로 그때 다시 시도됨.
      return;
    }

    if (!definition.onMount) return;

    // reset previously exposed actions for this element
    exposedActionsRef.current = {};
    clearExposedActions(element.fullId);

    const cleanups: (() => void)[] = [];

    const context = {
      setState: (updates: Record<string, any>) => {
        // rAF 기반 배치 업데이트 사용 (성능 최적화)
        const currentElement = usePluginDisplayElementStore
          .getState()
          .elements.find((el) => el.fullId === element.fullId);
        if (currentElement) {
          updateElementBatched(element.fullId, {
            state: { ...currentElement.state, ...updates },
          });
        }
      },
      getSettings: () => {
        const currentElement = usePluginDisplayElementStore
          .getState()
          .elements.find((el) => el.fullId === element.fullId);
        return currentElement?.settings || {};
      },
      setAnchor: (anchor: ElementResizeAnchor) => {
        // 오버레이 로컬 스토어 업데이트
        updateElement(element.fullId, { resizeAnchor: anchor });
        // 메인 윈도우로 동기화 (브릿지 통해)
        if (window.api?.bridge) {
          window.api.bridge.sendTo(
            "main",
            "plugin:displayElement:updateAnchor",
            {
              fullId: element.fullId,
              resizeAnchor: anchor,
            }
          );
        }
      },
      getAnchor: (): ElementResizeAnchor => {
        const currentElement = usePluginDisplayElementStore
          .getState()
          .elements.find((el) => el.fullId === element.fullId);
        return (
          currentElement?.resizeAnchor || definition?.resizeAnchor || "top-left"
        );
      },
      onHook: (event: string, callback: (...args: any[]) => void) => {
        // console.log(`[PluginElement] onHook registered for ${event}`);
        if (event === "key") {
          // 백엔드 재구독 대신 키 이벤트 버스 사용
          import("@utils/keyEventBus").then(({ keyEventBus }) => {
            const unsub = keyEventBus.subscribe((payload) => {
              // console.log(`[PluginElement] Key event received via hook`, payload);
              callback(payload);
            });
            cleanups.push(unsub);
          });
        } else if (event === "rawKey") {
          // Raw key 이벤트 버스 사용 (구독 기반 - 구독자가 있을 때만 백엔드가 emit)
          import("@utils/rawKeyEventBus").then(({ rawKeyEventBus }) => {
            rawKeyEventBus
              .subscribe((payload) => {
                callback(payload);
              })
              .then((unsub) => {
                cleanups.push(unsub);
              })
              .catch((error) => {
                console.error(
                  `[PluginElement] Failed to subscribe to rawKey:`,
                  error
                );
              });
          });
        }
      },
      expose: (actions: Record<string, (...args: any[]) => any>) => {
        if (!actions || typeof actions !== "object") return;
        const validEntries = Object.entries(actions).filter(
          ([, fn]) => typeof fn === "function"
        );
        if (validEntries.length === 0) return;

        exposedActionsRef.current = {
          ...exposedActionsRef.current,
          ...Object.fromEntries(validEntries),
        };
        registerExposedActions(element.fullId, exposedActionsRef.current);
      },
      locale: localeRef.current,
      t: pluginTranslateStable,
      onLocaleChange: (listener: (locale: string) => void) => {
        if (window.api?.i18n?.onLocaleChange) {
          return window.api.i18n.onLocaleChange(listener);
        }
        console.warn(
          "[PluginElement] i18n API is not available in this context"
        );
        return () => undefined;
      },
      onSettingsChange: (
        listener: (
          newSettings: Record<string, any>,
          oldSettings: Record<string, any>
        ) => void
      ) => {
        settingsChangeListenersRef.current.add(listener);
        cleanups.push(() => {
          settingsChangeListenersRef.current.delete(listener);
        });
      },
    };

    console.log(`[PluginElement] Mounting ${element.fullId}`);

    const mountCleanup = definition.onMount(context);
    if (typeof mountCleanup === "function") {
      cleanups.push(mountCleanup);
    }

    return () => {
      clearExposedActions(element.fullId);
      exposedActionsRef.current = {};
      cleanups.forEach((fn) => fn());
    };
  }, [
    windowType,
    definition?.id,
    element.fullId,
    pluginTranslateStable,
    updateElementBatched,
  ]);

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

  const attachRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        containerRef.current = node;
        if (element.draggable && windowType === "main") {
          draggableRef(node);
        }
      }
    },
    [element.draggable, windowType, draggableRef]
  );

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
      items.push({
        id: "delete",
        label: pluginTranslate(deleteLabel, undefined, deleteLabel),
      });
    }

    // 커스텀 항목 추가
    customItems.forEach((item, index) => {
      items.push({
        id: `custom-${index}`,
        label: pluginTranslate(item.label, undefined, item.label),
      });
    });

    return items;
  }, [element.contextMenu, pluginTranslate]);

  const createActionsProxy = useCallback(
    (elementId: string) =>
      new Proxy(
        {},
        {
          get: (_target, prop: string | symbol) => {
            if (typeof prop !== "string") return undefined;
            return (...args: any[]) => {
              try {
                window.api?.bridge?.sendTo(
                  "overlay",
                  "plugin:displayElement:invokeAction",
                  {
                    elementId,
                    action: prop,
                    args,
                  }
                );
              } catch (error) {
                console.error(
                  "[PluginElement] Failed to invoke exposed action",
                  error
                );
              }
            };
          },
        }
      ),
    []
  );

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
        customItem.onClick({
          element,
          actions: createActionsProxy(element.fullId),
        });
      }
    }
  };

  // 렌더링 로직
  const renderContent = (): React.ReactNode => {
    if (renderedContent) {
      // 템플릿 결과가 문자열인 경우 (레거시)
      if (typeof renderedContent === "string") {
        return <div dangerouslySetInnerHTML={{ __html: renderedContent }} />;
      }
      // React Element인 경우
      return renderedContent as React.ReactNode;
    }

    // 템플릿이 없고 html 속성만 있는 경우 (레거시)
    if (element.html) {
      return <div dangerouslySetInnerHTML={{ __html: element.html }} />;
    }

    return null;
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
      >
        {element.scoped && shadowRoot
          ? createPortal(renderContent(), shadowRoot as any)
          : renderContent()}
      </div>

      {/* 컨텍스트 메뉴 - 줌 영향을 받지 않도록 body에 Portal로 렌더링 */}
      {windowType === "main" &&
        element.contextMenu &&
        contextMenuOpen &&
        createPortal(
          <ListPopup
            open={contextMenuOpen}
            position={contextMenuPosition}
            onClose={() => setContextMenuOpen(false)}
            items={contextMenuItems}
            onSelect={handleContextMenuSelect}
            className="!z-[10000]"
          />,
          document.body
        )}
    </>
  );
};
