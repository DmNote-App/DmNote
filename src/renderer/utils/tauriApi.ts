import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { usePluginMenuStore } from "@stores/usePluginMenuStore";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import type { PluginDisplayElement } from "@src/types/api";
import {
  createButton,
  createCheckbox,
  createInput,
  createDropdown,
  createPanel,
  createFormRow,
  type ButtonOptions,
  type CheckboxOptions,
  type InputOptions,
  type DropdownOptions,
  type PanelOptions,
} from "./pluginComponents";

import type {
  CssLoadResult,
  CssSetContentResult,
  CssTogglePayload,
  CustomTabDeleteResult,
  CustomTabResult,
  DMNoteAPI,
  KeyCounterUpdate,
  KeysModeResponse,
  KeysResetAllResponse,
  OverlayBounds,
  OverlayAnchorPayload,
  OverlayLockPayload,
  OverlayResizePayload,
  OverlayState,
  OverlayVisibilityPayload,
  Unsubscribe,
  ModeChangePayload,
  CustomTabsChangePayload,
  KeyStatePayload,
  PresetOperationResult,
  JsLoadResult,
  JsSetContentResult,
  JsTogglePayload,
  JsReloadResult,
  JsRemoveResult,
  JsPluginUpdateResult,
  BridgeMessage,
  BridgeMessageListener,
  BridgeAnyListener,
  WindowTarget,
} from "@src/types/api";
import type { BootstrapPayload } from "@src/types/app";
import type { CustomCss } from "@src/types/css";
import type { CustomJs } from "@src/types/js";
import type {
  CustomTab,
  KeyMappings,
  KeyPositions,
  KeyCounters,
} from "@src/types/keys";
import type {
  SettingsState,
  SettingsPatchInput,
  SettingsDiff,
} from "@src/types/settings";

function subscribe<T>(
  event: string,
  listener: (payload: T) => void
): Unsubscribe {
  const registration = listen<T>(event, ({ payload }) => listener(payload));
  return () => {
    registration.then((unlisten) => unlisten()).catch(() => undefined);
  };
}

const api: DMNoteAPI = {
  app: {
    bootstrap: () => invoke<BootstrapPayload>("app_bootstrap"),
    openExternal: (url: string) => invoke("app_open_external", { url }),
    restart: () => invoke("app_restart"),
  },
  window: {
    type: (window as any).__dmn_window_type as "main" | "overlay",
    minimize: () => invoke("window_minimize"),
    close: () => invoke("window_close"),
    openDevtoolsAll: () => invoke("window_open_devtools_all"),
  },
  settings: {
    get: () => invoke<SettingsState>("settings_get"),
    update: (patch: SettingsPatchInput) =>
      invoke<SettingsState>("settings_update", { patch }),
    onChanged: (listener: (diff: SettingsDiff) => void) =>
      subscribe<SettingsDiff>("settings:changed", listener),
  },
  keys: {
    get: () => invoke<KeyMappings>("keys_get"),
    update: (mappings: KeyMappings) =>
      invoke<KeyMappings>("keys_update", { mappings }),
    getPositions: () => invoke<KeyPositions>("positions_get"),
    updatePositions: (positions: KeyPositions) =>
      invoke<KeyPositions>("positions_update", { positions }),
    setMode: (mode: string) =>
      invoke<KeysModeResponse>("keys_set_mode", { mode }),
    resetAll: () => invoke<KeysResetAllResponse>("keys_reset_all"),
    resetMode: (mode: string) =>
      invoke<KeysModeResponse>("keys_reset_mode", { mode }),
    resetCounters: () => invoke<KeyCounters>("keys_reset_counters"),
    resetCountersMode: (mode: string) =>
      invoke<KeyCounters>("keys_reset_counters_mode", { mode }),
    onChanged: (listener: (keys: KeyMappings) => void) =>
      subscribe<KeyMappings>("keys:changed", listener),
    onPositionsChanged: (listener: (positions: KeyPositions) => void) =>
      subscribe<KeyPositions>("positions:changed", listener),
    onModeChanged: (listener: (payload: ModeChangePayload) => void) =>
      subscribe<ModeChangePayload>("keys:mode-changed", listener),
    onKeyState: (listener: (payload: KeyStatePayload) => void) =>
      subscribe<KeyStatePayload>("keys:state", listener),
    onCounterChanged: (listener: (payload: KeyCounterUpdate) => void) =>
      subscribe<KeyCounterUpdate>("keys:counter", listener),
    onCountersChanged: (listener: (payload: KeyCounters) => void) =>
      subscribe<KeyCounters>("keys:counters", listener),
    customTabs: {
      list: () => invoke<CustomTab[]>("custom_tabs_list"),
      create: (name: string) =>
        invoke<CustomTabResult>("custom_tabs_create", { name }),
      delete: (id: string) =>
        invoke<CustomTabDeleteResult>("custom_tabs_delete", { id }),
      select: (id: string) =>
        invoke<CustomTabDeleteResult>("custom_tabs_select", { id }),
      onChanged: (listener: (payload: CustomTabsChangePayload) => void) =>
        subscribe<CustomTabsChangePayload>("customTabs:changed", listener),
    },
  },
  overlay: {
    get: () => invoke<OverlayState>("overlay_get"),
    setVisible: (visible: boolean) =>
      invoke("overlay_set_visible", { visible }),
    setLock: (locked: boolean) => invoke("overlay_set_lock", { locked }),
    setAnchor: (anchor: string) =>
      invoke<string>("overlay_set_anchor", { anchor }),
    resize: (payload: {
      width: number;
      height: number;
      anchor?: string;
      contentTopOffset?: number;
    }) => invoke<OverlayBounds>("overlay_resize", { payload }),
    onVisibility: (listener: (payload: OverlayVisibilityPayload) => void) =>
      subscribe<OverlayVisibilityPayload>("overlay:visibility", listener),
    onLock: (listener: (payload: OverlayLockPayload) => void) =>
      subscribe<OverlayLockPayload>("overlay:lock", listener),
    onAnchor: (listener: (payload: OverlayAnchorPayload) => void) =>
      subscribe<OverlayAnchorPayload>("overlay:anchor", listener),
    onResized: (listener: (payload: OverlayResizePayload) => void) =>
      subscribe<OverlayResizePayload>("overlay:resized", listener),
  },
  css: {
    get: () => invoke<CustomCss>("css_get"),
    getUse: () => invoke<boolean>("css_get_use"),
    toggle: (enabled: boolean) =>
      invoke<CssTogglePayload>("css_toggle", { enabled }),
    load: () => invoke<CssLoadResult>("css_load"),
    setContent: (content: string) =>
      invoke<CssSetContentResult>("css_set_content", { content }),
    reset: () => invoke("css_reset"),
    onUse: (listener: (payload: CssTogglePayload) => void) =>
      subscribe<CssTogglePayload>("css:use", listener),
    onContent: (listener: (payload: CustomCss) => void) =>
      subscribe<CustomCss>("css:content", listener),
  },
  js: {
    get: () => invoke<CustomJs>("js_get"),
    getUse: () => invoke<boolean>("js_get_use"),
    toggle: (enabled: boolean) =>
      invoke<JsTogglePayload>("js_toggle", { enabled }),
    load: () => invoke<JsLoadResult>("js_load"),
    reload: () => invoke<JsReloadResult>("js_reload"),
    remove: (id: string) => invoke<JsRemoveResult>("js_remove_plugin", { id }),
    setPluginEnabled: (id: string, enabled: boolean) =>
      invoke<JsPluginUpdateResult>("js_set_plugin_enabled", { id, enabled }),
    setContent: (content: string) =>
      invoke<JsSetContentResult>("js_set_content", { content }),
    reset: () => invoke("js_reset"),
    onUse: (listener: (payload: JsTogglePayload) => void) =>
      subscribe<JsTogglePayload>("js:use", listener),
    onState: (listener: (payload: CustomJs) => void) =>
      subscribe<CustomJs>("js:content", listener),
  },
  presets: {
    save: () => invoke<PresetOperationResult>("preset_save"),
    load: () => invoke<PresetOperationResult>("preset_load"),
  },
  bridge: (() => {
    const listeners = new Map<string, Set<BridgeMessageListener>>();
    const anyListeners = new Set<BridgeAnyListener>();
    const onceListeners = new Map<string, Set<BridgeMessageListener>>();

    // 백엔드에서 브로드캐스트한 메시지 수신
    listen<BridgeMessage>("plugin-bridge:message", ({ payload }) => {
      const { type, data } = payload;

      // 타입별 리스너 호출
      const typeListeners = listeners.get(type);
      if (typeListeners) {
        typeListeners.forEach((listener) => {
          try {
            listener(data);
          } catch (error) {
            console.error(`[Bridge] Error in listener for '${type}':`, error);
          }
        });
      }

      // once 리스너 호출 및 제거
      const onceTypeListeners = onceListeners.get(type);
      if (onceTypeListeners) {
        onceTypeListeners.forEach((listener) => {
          try {
            listener(data);
          } catch (error) {
            console.error(
              `[Bridge] Error in once listener for '${type}':`,
              error
            );
          }
        });
        onceListeners.delete(type);
      }

      // any 리스너 호출
      anyListeners.forEach((listener) => {
        try {
          listener(type, data);
        } catch (error) {
          console.error("[Bridge] Error in any listener:", error);
        }
      });
    }).catch((error) => {
      console.error("[Bridge] Failed to setup message listener:", error);
    });

    return {
      send: (type: string, data?: any) =>
        invoke("plugin_bridge_send", {
          messageType: type,
          data: data ?? null,
        }),

      sendTo: (target: WindowTarget, type: string, data?: any) =>
        invoke("plugin_bridge_send_to", {
          target,
          messageType: type,
          data: data ?? null,
        }),

      on: <T = any>(type: string, listener: BridgeMessageListener<T>) => {
        if (!listeners.has(type)) {
          listeners.set(type, new Set());
        }
        listeners.get(type)!.add(listener as BridgeMessageListener);

        return () => {
          const typeListeners = listeners.get(type);
          if (typeListeners) {
            typeListeners.delete(listener as BridgeMessageListener);
            if (typeListeners.size === 0) {
              listeners.delete(type);
            }
          }
        };
      },

      once: <T = any>(type: string, listener: BridgeMessageListener<T>) => {
        if (!onceListeners.has(type)) {
          onceListeners.set(type, new Set());
        }
        onceListeners.get(type)!.add(listener as BridgeMessageListener);

        return () => {
          const typeListeners = onceListeners.get(type);
          if (typeListeners) {
            typeListeners.delete(listener as BridgeMessageListener);
            if (typeListeners.size === 0) {
              onceListeners.delete(type);
            }
          }
        };
      },

      onAny: (listener: BridgeAnyListener) => {
        anyListeners.add(listener);
        return () => {
          anyListeners.delete(listener);
        };
      },

      off: (type: string, listener?: BridgeMessageListener) => {
        if (listener) {
          const typeListeners = listeners.get(type);
          if (typeListeners) {
            typeListeners.delete(listener);
            if (typeListeners.size === 0) {
              listeners.delete(type);
            }
          }
        } else {
          listeners.delete(type);
        }
      },
    };
  })(),
  plugin: {
    storage: {
      get: <T = any>(key: string) =>
        invoke<T | null>("plugin_storage_get", { key }),

      set: (key: string, value: any) =>
        invoke<void>("plugin_storage_set", { key, value }),

      remove: (key: string) => invoke<void>("plugin_storage_remove", { key }),

      clear: () => invoke<void>("plugin_storage_clear"),

      keys: () => invoke<string[]>("plugin_storage_keys"),

      hasData: (prefix: string) =>
        invoke<boolean>("plugin_storage_has_data", { prefix }),

      clearByPrefix: (prefix: string) =>
        invoke<number>("plugin_storage_clear_by_prefix", { prefix }),
    },
    registerCleanup: () => {
      console.warn(
        "[Plugin API] registerCleanup is managed by useCustomJsInjection and should not be called directly from tauriApi"
      );
    },
  },
  ui: {
    contextMenu: {
      addKeyMenuItem: (item) => {
        // 메인 윈도우에서만 동작
        if ((window as any).__dmn_window_type !== "main") {
          console.warn("[UI API] contextMenu is only available in main window");
          return "";
        }

        return usePluginMenuStore.getState().addKeyMenuItem(item);
      },

      addGridMenuItem: (item) => {
        if ((window as any).__dmn_window_type !== "main") {
          console.warn("[UI API] contextMenu is only available in main window");
          return "";
        }

        return usePluginMenuStore.getState().addGridMenuItem(item);
      },

      removeMenuItem: (fullId) => {
        if ((window as any).__dmn_window_type !== "main") {
          console.warn("[UI API] contextMenu is only available in main window");
          return;
        }

        usePluginMenuStore.getState().removeMenuItem(fullId);
      },

      updateMenuItem: (fullId, updates) => {
        if ((window as any).__dmn_window_type !== "main") {
          console.warn("[UI API] contextMenu is only available in main window");
          return;
        }

        usePluginMenuStore.getState().updateMenuItem(fullId, updates);
      },

      clearMyMenuItems: () => {
        if ((window as any).__dmn_window_type !== "main") {
          console.warn("[UI API] contextMenu is only available in main window");
          return;
        }

        const pluginId = (window as any).__dmn_current_plugin_id;
        if (!pluginId) {
          console.warn(
            "[UI API] clearMyMenuItems called outside plugin context"
          );
          return;
        }

        usePluginMenuStore.getState().clearByPluginId(pluginId);
      },
    },
    displayElement: {
      add: (element: Omit<PluginDisplayElement, "id">) => {
        // 메인 윈도우에서만 추가 가능
        if ((window as any).__dmn_window_type !== "main") {
          console.warn(
            "[UI API] displayElement.add is only available in main window"
          );
          return "";
        }

        const pluginId = (window as any).__dmn_current_plugin_id;
        if (!pluginId) {
          console.warn(
            "[UI API] displayElement.add called outside plugin context"
          );
          return "";
        }

        const id = `element-${Date.now()}-${Math.random()
          .toString(36)
          .substring(7)}`;
        const fullId = `${pluginId}::${id}`;

        const internalElement = {
          ...element,
          id,
          pluginId,
          fullId,
        };

        usePluginDisplayElementStore.getState().addElement(internalElement);
        return fullId;
      },

      update: (fullId: string, updates: Partial<PluginDisplayElement>) => {
        if ((window as any).__dmn_window_type !== "main") {
          console.warn(
            "[UI API] displayElement.update is only available in main window"
          );
          return;
        }

        usePluginDisplayElementStore.getState().updateElement(fullId, updates);
      },

      remove: (fullId: string) => {
        if ((window as any).__dmn_window_type !== "main") {
          console.warn(
            "[UI API] displayElement.remove is only available in main window"
          );
          return;
        }

        usePluginDisplayElementStore.getState().removeElement(fullId);
      },

      clearMyElements: () => {
        if ((window as any).__dmn_window_type !== "main") {
          console.warn(
            "[UI API] displayElement.clearMyElements is only available in main window"
          );
          return;
        }

        const pluginId = (window as any).__dmn_current_plugin_id;
        if (!pluginId) {
          console.warn(
            "[UI API] clearMyElements called outside plugin context"
          );
          return;
        }

        usePluginDisplayElementStore.getState().clearByPluginId(pluginId);
      },
    },

    // Dialog API
    dialog: {
      alert: (message: string, options?: { confirmText?: string }) => {
        return new Promise<void>((resolve) => {
          const showAlert = (window as any).__dmn_showAlert;
          if (typeof showAlert !== "function") {
            console.warn("[Dialog API] showAlert function not available");
            resolve();
            return;
          }
          showAlert(message, options?.confirmText);
          // Alert는 확인만 있으므로 바로 resolve
          setTimeout(resolve, 0);
        });
      },

      confirm: (
        message: string,
        options?: {
          confirmText?: string;
          cancelText?: string;
          danger?: boolean;
        }
      ) => {
        return new Promise<boolean>((resolve) => {
          const showConfirm = (window as any).__dmn_showConfirm;
          if (typeof showConfirm !== "function") {
            console.warn("[Dialog API] showConfirm function not available");
            resolve(false);
            return;
          }
          showConfirm(
            message,
            () => resolve(true),
            () => resolve(false),
            options?.confirmText
          );
        });
      },

      custom: (
        html: string,
        options?: {
          confirmText?: string;
          cancelText?: string;
          showCancel?: boolean;
        }
      ) => {
        return new Promise<boolean>((resolve) => {
          const showCustomDialog = (window as any).__dmn_showCustomDialog;
          if (typeof showCustomDialog !== "function") {
            console.warn(
              "[Dialog API] showCustomDialog function not available"
            );
            resolve(false);
            return;
          }

          // 플러그인 ID 캡처
          const pluginId = (window as any).__dmn_current_plugin_id;

          // HTML 내 data-plugin-handler 이벤트 바인딩을 위한 래퍼
          const wrappedHtml = `<div data-plugin-dialog-content data-plugin-id="${
            pluginId || ""
          }">${html}</div>`;

          showCustomDialog(wrappedHtml, {
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false),
            confirmText: options?.confirmText,
            cancelText: options?.cancelText,
            showCancel: options?.showCancel,
          });

          // 다음 틱에 이벤트 리스너 등록
          setTimeout(() => {
            const dialogContent = document.querySelector(
              "[data-plugin-dialog-content]"
            );
            if (!dialogContent) return;

            // 체크박스 토글 기능
            dialogContent.addEventListener("click", (e: Event) => {
              const target = e.target as HTMLElement;
              const checkbox = target.closest("[data-checkbox-toggle]");
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
            });

            // 드롭다운 토글 기능
            dialogContent.addEventListener("click", (e: Event) => {
              const target = e.target as HTMLElement;
              const toggleBtn = target.closest("[data-dropdown-toggle]");
              const dropdownItem = target.closest(
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
                  display.textContent =
                    dropdownItem.textContent?.trim() || value;

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
            });

            // data-plugin-handler 이벤트 위임
            const handleEvent = (e: Event) => {
              const target = e.target as HTMLElement;
              const handlerAttr =
                e.type === "click"
                  ? "data-plugin-handler"
                  : e.type === "input"
                  ? "data-plugin-handler-input"
                  : e.type === "change"
                  ? "data-plugin-handler-change"
                  : null;

              if (!handlerAttr) return;

              // 클릭된 요소 또는 부모에서 핸들러 찾기
              let element: HTMLElement | null = target;
              let handlerName: string | null = null;

              while (element && element !== dialogContent) {
                handlerName = element.getAttribute(handlerAttr);
                if (handlerName) break;
                element = element.parentElement;
              }

              if (!handlerName) return;

              // 핸들러 실행 (자동 래핑되어 있음)
              const handler = (window as any)[handlerName];
              if (typeof handler === "function") {
                handler(e);
              }
            };

            dialogContent.addEventListener("click", handleEvent);
            dialogContent.addEventListener("change", handleEvent);
            dialogContent.addEventListener("input", handleEvent);
          }, 0);
        });
      },
    },

    // Components API
    components: {
      button: (text: string, options?: ButtonOptions) =>
        createButton(text, options),
      checkbox: (options?: CheckboxOptions) => createCheckbox(options),
      input: (options?: InputOptions) => createInput(options),
      dropdown: (options: DropdownOptions) => createDropdown(options),
      panel: (content: string, options?: PanelOptions) =>
        createPanel(content, options),
      formRow: (label: string, component: string) =>
        createFormRow(label, component),
    },
  },
};

if (typeof window !== "undefined" && !window.api) {
  window.api = api;
}

export default api;
