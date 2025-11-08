import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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
};

if (typeof window !== "undefined" && !window.api) {
  window.api = api;
}

export default api;
