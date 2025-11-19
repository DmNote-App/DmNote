import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { usePluginMenuStore } from "@stores/usePluginMenuStore";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import { DisplayElementInstance } from "@utils/displayElementInstance";
import { html } from "@utils/templateEngine";
import type {
  DisplayElementTemplate,
  DisplayElementTemplateFactoryValue,
  DisplayElementTemplateHelpers,
  DisplayElementTemplateValueResolver,
  PluginDisplayElement,
} from "@src/types/api";

// ===== 플러그인 핸들러 레지스트리 =====
// 플러그인별로 이벤트 핸들러를 자동 관리하는 시스템
type HandlerFunction = (...args: any[]) => void | Promise<void>;

class PluginHandlerRegistry {
  private handlers: Map<string, HandlerFunction> = new Map();
  private pluginHandlers: Map<string, Set<string>> = new Map();

  /**
   * 핸들러 함수를 등록하고 고유 ID를 반환
   * @param pluginId 플러그인 ID
   * @param handler 핸들러 함수
   * @returns 생성된 핸들러 ID
   */
  register(pluginId: string, handler: HandlerFunction): string {
    const handlerId = `__dmn_handler_${pluginId}_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}`;

    this.handlers.set(handlerId, handler);

    if (!this.pluginHandlers.has(pluginId)) {
      this.pluginHandlers.set(pluginId, new Set());
    }
    this.pluginHandlers.get(pluginId)!.add(handlerId);

    // window 객체에도 등록 (기존 시스템과 호환)
    (window as any)[handlerId] = handler;

    return handlerId;
  }

  /**
   * 핸들러 ID로 핸들러 함수 가져오기
   */
  get(handlerId: string): HandlerFunction | undefined {
    return this.handlers.get(handlerId);
  }

  /**
   * 특정 핸들러 삭제
   */
  unregister(handlerId: string): void {
    this.handlers.delete(handlerId);
    delete (window as any)[handlerId];
  }

  /**
   * 플러그인의 모든 핸들러 삭제
   */
  clearPlugin(pluginId: string): void {
    const handlerIds = this.pluginHandlers.get(pluginId);
    if (handlerIds) {
      handlerIds.forEach((id) => {
        this.handlers.delete(id);
        delete (window as any)[id];
      });
      this.pluginHandlers.delete(pluginId);
    }

    // Components API 핸들러도 정리
    clearComponentHandlers(pluginId);
  }

  /**
   * 모든 핸들러 삭제
   */
  clear(): void {
    this.handlers.forEach((_, id) => {
      delete (window as any)[id];
    });
    this.handlers.clear();
    this.pluginHandlers.clear();
  }
}

const handlerRegistry = new PluginHandlerRegistry();
import {
  createButton,
  createCheckbox,
  createInput,
  createDropdown,
  createPanel,
  createFormRow,
} from "./pluginComponents";
import { clearComponentHandlers } from "./pluginUtils";
import type { DisplayElementInstance as DisplayElementInstanceType } from "@src/types/api";

type DisplayElementTarget =
  | string
  | DisplayElementInstance
  | DisplayElementInstanceType
  | null
  | undefined;

const displayElementInstances = new Map<string, DisplayElementInstance>();
const displayElementInstancesByPlugin = new Map<string, Set<string>>();

const registerDisplayElementInstance = (instance: DisplayElementInstance) => {
  displayElementInstances.set(instance.id, instance);
  if (!displayElementInstancesByPlugin.has(instance.pluginId)) {
    displayElementInstancesByPlugin.set(instance.pluginId, new Set());
  }
  displayElementInstancesByPlugin.get(instance.pluginId)!.add(instance.id);
};

const unregisterDisplayElementInstance = (fullId: string) => {
  const instance = displayElementInstances.get(fullId);
  if (!instance) return;
  instance.dispose();
  displayElementInstances.delete(fullId);
  const pluginSet = displayElementInstancesByPlugin.get(instance.pluginId);
  if (pluginSet) {
    pluginSet.delete(fullId);
    if (pluginSet.size === 0) {
      displayElementInstancesByPlugin.delete(instance.pluginId);
    }
  }
};

const resolveFullId = (target: DisplayElementTarget): string | null => {
  if (!target) return null;
  if (typeof target === "string") return target;
  if (target instanceof DisplayElementInstance) return target.id;
  if (
    typeof target === "object" &&
    typeof (target as DisplayElementInstanceType).id === "string"
  ) {
    return (target as DisplayElementInstanceType).id;
  }
  if (typeof target === "object" && "toString" in target) {
    return String(target);
  }
  return null;
};

const resolveInstance = (
  target: DisplayElementTarget
): DisplayElementInstance | undefined => {
  if (target instanceof DisplayElementInstance) {
    return target;
  }
  const fullId = resolveFullId(target);
  if (!fullId) return undefined;
  return displayElementInstances.get(fullId);
};

const createNoopDisplayElementInstance = () =>
  new DisplayElementInstance({
    fullId: "",
    pluginId: "",
    updateElement: () => undefined,
    removeElement: () => undefined,
  });

const clearInstancesByPlugin = (pluginId: string) => {
  const ids = displayElementInstancesByPlugin.get(pluginId);
  if (!ids) return;
  Array.from(ids).forEach((id) => unregisterDisplayElementInstance(id));
};

const clearAllInstances = () => {
  Array.from(displayElementInstances.keys()).forEach((id) =>
    unregisterDisplayElementInstance(id)
  );
  displayElementInstancesByPlugin.clear();
};

type CompiledTemplateChunk =
  | { type: "fn"; fn: DisplayElementTemplateValueResolver }
  | { type: "value"; value: DisplayElementTemplateFactoryValue };

const displayElementTemplateHelpers: DisplayElementTemplateHelpers = {
  html,
};

const buildDisplayElementTemplate = (
  strings: TemplateStringsArray,
  ...values: DisplayElementTemplateFactoryValue[]
): DisplayElementTemplate => {
  const compiledChunks: CompiledTemplateChunk[] = values.map((value) =>
    typeof value === "function"
      ? { type: "fn", fn: value as DisplayElementTemplateValueResolver }
      : { type: "value", value }
  );

  return (state, helpers = displayElementTemplateHelpers) => {
    const resolvedValues = compiledChunks.map((chunk) => {
      if (chunk.type === "fn") {
        try {
          return chunk.fn(state, helpers);
        } catch (error) {
          console.error(
            "[UI API] displayElement.template value resolver failed",
            error
          );
          return "";
        }
      }
      return chunk.value;
    });

    return helpers.html(strings, ...resolvedValues);
  };
};

const removeDisplayElementInternal = (fullId: string) => {
  const store = usePluginDisplayElementStore.getState();
  const element = store.elements.find((el) => el.fullId === fullId);
  if (element) {
    if (element._onClickId) handlerRegistry.unregister(element._onClickId);
    if (element._onPositionChangeId)
      handlerRegistry.unregister(element._onPositionChangeId);
    if (element._onDeleteId) handlerRegistry.unregister(element._onDeleteId);
  }

  store.removeElement(fullId);

  unregisterDisplayElementInstance(fullId);
};

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
  ButtonOptions,
  CheckboxOptions,
  InputOptions,
  DropdownOptions,
  PanelOptions,
  PluginDisplayElementConfig,
  PluginDisplayElementInternal,
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
    defineElement: () => {
      console.warn(
        "[Plugin API] defineElement is managed by useCustomJsInjection and should not be called directly from tauriApi"
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
      html,
      template: buildDisplayElementTemplate,
      add: (element: PluginDisplayElementConfig) => {
        if ((window as any).__dmn_window_type !== "main") {
          console.warn(
            "[UI API] displayElement.add is only available in main window"
          );
          return createNoopDisplayElementInstance();
        }

        const pluginId = (window as any).__dmn_current_plugin_id;
        if (!pluginId) {
          console.warn(
            "[UI API] displayElement.add called outside plugin context"
          );
          return createNoopDisplayElementInstance();
        }

        const id = `element-${Date.now()}-${Math.random()
          .toString(36)
          .substring(7)}`;
        const fullId = `${pluginId}::${id}`;

        const {
          template,
          state: initialState,
          html: initialHtml,
          ...elementOptions
        } = element as PluginDisplayElementConfig;

        const templateFn =
          typeof template === "function" ? template : undefined;
        const stateSnapshot = initialState
          ? { ...initialState }
          : templateFn
          ? {}
          : undefined;

        const html = typeof initialHtml === "string" ? initialHtml : "";

        if (!html && !templateFn) {
          console.warn(
            `[UI API] displayElement '${fullId}' has no HTML content. The panel will be empty until setState/setHTML is called.`
          );
        }

        let onClickId: string | undefined;
        let onPositionChangeId: string | undefined;
        let onDeleteId: string | undefined;

        if (typeof elementOptions.onClick === "function") {
          onClickId = handlerRegistry.register(
            pluginId,
            elementOptions.onClick
          );
        }
        if (typeof elementOptions.onPositionChange === "function") {
          onPositionChangeId = handlerRegistry.register(
            pluginId,
            elementOptions.onPositionChange
          );
        }
        if (typeof elementOptions.onDelete === "function") {
          onDeleteId = handlerRegistry.register(
            pluginId,
            elementOptions.onDelete
          );
        }

        const internalElement: PluginDisplayElementInternal = {
          ...elementOptions,
          html,
          id,
          pluginId,
          fullId,
          onClick:
            onClickId ||
            (typeof elementOptions.onClick === "string"
              ? elementOptions.onClick
              : undefined),
          onPositionChange:
            onPositionChangeId ||
            (typeof elementOptions.onPositionChange === "string"
              ? elementOptions.onPositionChange
              : undefined),
          onDelete:
            onDeleteId ||
            (typeof elementOptions.onDelete === "string"
              ? elementOptions.onDelete
              : undefined),
          _onClickId: onClickId,
          _onPositionChangeId: onPositionChangeId,
          _onDeleteId: onDeleteId,
        };

        usePluginDisplayElementStore.getState().addElement(internalElement);

        const instance = new DisplayElementInstance({
          fullId,
          pluginId,
          scoped: Boolean(elementOptions.scoped),
          initialState: stateSnapshot,
          template: templateFn,
          updateElement: (targetId, updates) => {
            usePluginDisplayElementStore
              .getState()
              .updateElement(targetId, updates);
          },
          removeElement: (targetId) => {
            removeDisplayElementInternal(targetId);
          },
        });

        registerDisplayElementInstance(instance);

        if (templateFn) {
          instance.setState({});
        }

        return instance;
      },

      get: (fullId: string) => resolveInstance(fullId),

      setState: (target, updates) => {
        const instance = resolveInstance(target);
        if (!instance) return;
        instance.setState(updates || {});
      },

      setData: (target, updates) => {
        const instance = resolveInstance(target);
        if (!instance) return;
        instance.setData(updates || {});
      },

      setText: (target, selector, text) => {
        const instance = resolveInstance(target);
        if (!instance) return;
        instance.setText(selector, text);
      },

      setHTML: (target, selector, htmlContent) => {
        const instance = resolveInstance(target);
        if (!instance) return;
        instance.setHTML(selector, htmlContent);
      },

      setStyle: (target, selector, styles) => {
        const instance = resolveInstance(target);
        if (!instance) return;
        instance.setStyle(selector, styles);
      },

      addClass: (target, selector, ...classNames) => {
        const instance = resolveInstance(target);
        if (!instance) return;
        instance.addClass(selector, ...classNames);
      },

      removeClass: (target, selector, ...classNames) => {
        const instance = resolveInstance(target);
        if (!instance) return;
        instance.removeClass(selector, ...classNames);
      },

      toggleClass: (target, selector, className) => {
        const instance = resolveInstance(target);
        if (!instance || !className) return;
        instance.toggleClass(selector, className);
      },

      query: (target, selector) => {
        const instance = resolveInstance(target);
        if (!instance) return null;
        return instance.query(selector);
      },

      update: (
        target: DisplayElementTarget,
        updates: Partial<PluginDisplayElement>
      ) => {
        if ((window as any).__dmn_window_type !== "main") {
          console.warn(
            "[UI API] displayElement.update is only available in main window"
          );
          return;
        }
        const fullId = resolveFullId(target);
        if (!fullId) return;
        usePluginDisplayElementStore.getState().updateElement(fullId, updates);
      },

      remove: (target: DisplayElementTarget) => {
        if ((window as any).__dmn_window_type !== "main") {
          console.warn(
            "[UI API] displayElement.remove is only available in main window"
          );
          return;
        }
        const fullId = resolveFullId(target);
        if (!fullId) return;
        removeDisplayElementInternal(fullId);
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

        const elements = usePluginDisplayElementStore
          .getState()
          .elements.filter((el) => el.pluginId === pluginId);
        elements.forEach((element) => {
          removeDisplayElementInternal(element.fullId);
        });
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
                  targetEl.dispatchEvent(
                    new Event("change", { bubbles: true })
                  );
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
                  targetEl.dispatchEvent(
                    new Event("change", { bubbles: true })
                  );
                }
              }
            };

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
            dialogContent.addEventListener("blur", handleInputBlur, true); // capture phase
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

    // Color Picker API
    pickColor: (options: {
      initialColor: string;
      onColorChange: (color: string) => void;
      position?: { x: number; y: number };
      id?: string;
      referenceElement?: HTMLElement;
      onClose?: () => void;
      onColorChangeComplete?: (color: string) => void;
    }) => {
      const showColorPicker = (window as any).__dmn_showColorPicker;
      if (typeof showColorPicker === "function") {
        showColorPicker(options);
      } else {
        console.warn("[UI API] pickColor function not available");
      }
    },
  },
};

if (typeof window !== "undefined") {
  window.api = api;
}

// 핸들러 레지스트리를 외부에서 사용할 수 있도록 export
export const displayElementInstanceRegistry = {
  get(fullId: string) {
    return displayElementInstances.get(fullId);
  },
  clearByPluginId(pluginId: string) {
    clearInstancesByPlugin(pluginId);
  },
  clearAll() {
    clearAllInstances();
  },
};

export { handlerRegistry };

export default api;
