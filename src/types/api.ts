import { BootstrapPayload } from "@src/types/app";
import { CustomCss } from "@src/types/css";
import { CustomJs, JsPlugin } from "@src/types/js";
import {
  CustomTab,
  KeyMappings,
  KeyPositions,
  KeyCounters,
} from "@src/types/keys";
import {
  SettingsDiff,
  SettingsPatchInput,
  SettingsState,
} from "@src/types/settings";

export type ModeChangePayload = { mode: string };
export type CustomTabsChangePayload = {
  customTabs: CustomTab[];
  selectedKeyType: string;
};
export type KeyStatePayload = { key: string; state: string; mode: string };
export type OverlayBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type OverlayState = BootstrapPayload["overlay"];
export type OverlayVisibilityPayload = { visible: boolean };
export type OverlayLockPayload = { locked: boolean };
export type OverlayAnchorPayload = { anchor: string };
export type OverlayResizePayload = OverlayBounds;

export type CssTogglePayload = { enabled: boolean };
export type CssSetContentResult = { success: boolean; error?: string };
export type CssLoadResult = {
  success: boolean;
  error?: string;
  content?: string;
  path?: string;
};

export type JsTogglePayload = { enabled: boolean };
export type JsSetContentResult = { success: boolean; error?: string };
export type JsPluginError = { path: string; error: string };
export type JsLoadResult = {
  success: boolean;
  added: JsPlugin[];
  errors?: JsPluginError[];
};
export type JsReloadResult = {
  updated: JsPlugin[];
  errors?: JsPluginError[];
};
export type JsRemoveResult = {
  success: boolean;
  removedId?: string;
  error?: string;
};
export type JsPluginUpdateResult = {
  success: boolean;
  plugin?: JsPlugin;
  error?: string;
};

export type KeysModeResponse = { success: boolean; mode: string };
export type KeysResetAllResponse = {
  keys: KeyMappings;
  positions: KeyPositions;
  customTabs: CustomTab[];
  selectedKeyType: string;
};
export type CustomTabResult = { result?: CustomTab; error?: string };
export type CustomTabDeleteResult = {
  success: boolean;
  selected: string;
  error?: string;
};
export type KeyCounterUpdate = { mode: string; key: string; count: number };

export type PresetOperationResult = { success: boolean; error?: string };

export type BridgeMessage<T = any> = { type: string; data?: T };
export type BridgeMessageListener<T = any> = (data: T) => void;
export type BridgeAnyListener = (type: string, data: any) => void;
export type WindowTarget = "main" | "overlay";

// UI Plugin 컨텍스트 메뉴 types
export type KeyMenuContext = {
  keyCode: string;
  index: number;
  position: any; // KeyPosition from keys.ts
  mode: string;
};

export type GridMenuContext = {
  position: { dx: number; dy: number };
  mode: string;
};

export type PluginMenuItem<TContext = any> = {
  id: string;
  label: string;
  disabled?: boolean | ((context: TContext) => boolean);
  visible?: boolean | ((context: TContext) => boolean);
  position?: "top" | "bottom";
  onClick: (context: TContext) => void | Promise<void>;
};

export type PluginMenuItemInternal<TContext = any> =
  PluginMenuItem<TContext> & {
    pluginId: string;
    fullId: string;
  };

// UI Plugin Display Element types
export type PluginDisplayElementContextMenu = {
  enableDelete?: boolean;
  deleteLabel?: string; // 삭제 메뉴 텍스트 (기본: "삭제")
  customItems?: PluginMenuItem<{ element: PluginDisplayElement }>[];
};

export type PluginDisplayElement = {
  id: string;
  html: string;
  position: {
    x: number;
    y: number;
  };
  anchor?: {
    keyCode: string;
    offset?: { x: number; y: number };
  };
  draggable?: boolean;
  zIndex?: number;
  scoped?: boolean;
  className?: string;
  style?: Record<string, string>;
  estimatedSize?: { width: number; height: number };
  onClick?: string; // 이벤트 핸들러 ID (메인 윈도우에서만)
  onPositionChange?: string; // 위치 변경 핸들러 ID (메인 윈도우에서만)
  onDelete?: string; // 삭제 핸들러 ID (메인 윈도우에서만)
  contextMenu?: PluginDisplayElementContextMenu;
};

export type PluginDisplayElementInternal = PluginDisplayElement & {
  pluginId: string;
  fullId: string;
  measuredSize?: { width: number; height: number };
};

export type Unsubscribe = () => void;

export interface DMNoteAPI {
  app: {
    bootstrap(): Promise<BootstrapPayload>;
    openExternal(url: string): Promise<void>;
    restart(): Promise<void>;
  };
  window: {
    type: "main" | "overlay";
    minimize(): Promise<void>;
    close(): Promise<void>;
    openDevtoolsAll?(): Promise<void>;
  };
  settings: {
    get(): Promise<SettingsState>;
    update(patch: SettingsPatchInput): Promise<SettingsState>;
    onChanged(listener: (diff: SettingsDiff) => void): Unsubscribe;
  };
  keys: {
    get(): Promise<KeyMappings>;
    update(mappings: KeyMappings): Promise<KeyMappings>;
    getPositions(): Promise<KeyPositions>;
    updatePositions(positions: KeyPositions): Promise<KeyPositions>;
    setMode(mode: string): Promise<KeysModeResponse>;
    resetAll(): Promise<KeysResetAllResponse>;
    resetMode(mode: string): Promise<KeysModeResponse>;
    onChanged(listener: (keys: KeyMappings) => void): Unsubscribe;
    onPositionsChanged(
      listener: (positions: KeyPositions) => void
    ): Unsubscribe;
    onModeChanged(listener: (payload: ModeChangePayload) => void): Unsubscribe;
    onKeyState(listener: (payload: KeyStatePayload) => void): Unsubscribe;
    resetCounters(): Promise<KeyCounters>;
    resetCountersMode(mode: string): Promise<KeyCounters>;
    onCounterChanged(
      listener: (payload: KeyCounterUpdate) => void
    ): Unsubscribe;
    onCountersChanged(listener: (payload: KeyCounters) => void): Unsubscribe;
    customTabs: {
      list(): Promise<CustomTab[]>;
      create(name: string): Promise<CustomTabResult>;
      delete(id: string): Promise<CustomTabDeleteResult>;
      select(id: string): Promise<CustomTabDeleteResult>;
      onChanged(
        listener: (payload: CustomTabsChangePayload) => void
      ): Unsubscribe;
    };
  };
  overlay: {
    get(): Promise<OverlayState>;
    setVisible(visible: boolean): Promise<void>;
    setLock(locked: boolean): Promise<void>;
    setAnchor(anchor: string): Promise<string>;
    resize(payload: {
      width: number;
      height: number;
      anchor?: string;
      contentTopOffset?: number;
    }): Promise<OverlayBounds>;
    onVisibility(
      listener: (payload: OverlayVisibilityPayload) => void
    ): Unsubscribe;
    onLock(listener: (payload: OverlayLockPayload) => void): Unsubscribe;
    onAnchor(listener: (payload: OverlayAnchorPayload) => void): Unsubscribe;
    onResized(listener: (payload: OverlayResizePayload) => void): Unsubscribe;
  };
  css: {
    get(): Promise<CustomCss>;
    getUse(): Promise<boolean>;
    toggle(enabled: boolean): Promise<CssTogglePayload>;
    load(): Promise<CssLoadResult>;
    setContent(content: string): Promise<CssSetContentResult>;
    reset(): Promise<void>;
    onUse(listener: (payload: CssTogglePayload) => void): Unsubscribe;
    onContent(listener: (payload: CustomCss) => void): Unsubscribe;
  };
  js: {
    get(): Promise<CustomJs>;
    getUse(): Promise<boolean>;
    toggle(enabled: boolean): Promise<JsTogglePayload>;
    load(): Promise<JsLoadResult>;
    reload(): Promise<JsReloadResult>;
    remove(id: string): Promise<JsRemoveResult>;
    setPluginEnabled(
      id: string,
      enabled: boolean
    ): Promise<JsPluginUpdateResult>;
    setContent(content: string): Promise<JsSetContentResult>;
    reset(): Promise<void>;
    onUse(listener: (payload: JsTogglePayload) => void): Unsubscribe;
    onState(listener: (payload: CustomJs) => void): Unsubscribe;
  };
  presets: {
    save(): Promise<PresetOperationResult>;
    load(): Promise<PresetOperationResult>;
  };
  bridge: {
    send(type: string, data?: any): Promise<void>;
    sendTo(target: WindowTarget, type: string, data?: any): Promise<void>;
    on<T = any>(type: string, listener: BridgeMessageListener<T>): Unsubscribe;
    once<T = any>(
      type: string,
      listener: BridgeMessageListener<T>
    ): Unsubscribe;
    onAny(listener: BridgeAnyListener): Unsubscribe;
    off(type: string, listener?: BridgeMessageListener): void;
  };
  plugin: {
    storage: {
      get<T = any>(key: string): Promise<T | null>;
      set(key: string, value: any): Promise<void>;
      remove(key: string): Promise<void>;
      clear(): Promise<void>;
      keys(): Promise<string[]>;
      hasData(prefix: string): Promise<boolean>;
      clearByPrefix(prefix: string): Promise<number>;
    };
    registerCleanup(cleanup: () => void): void;
  };
  ui: {
    contextMenu: {
      addKeyMenuItem(item: PluginMenuItem<KeyMenuContext>): string;
      addGridMenuItem(item: PluginMenuItem<GridMenuContext>): string;
      removeMenuItem(fullId: string): void;
      updateMenuItem(
        fullId: string,
        updates: Partial<PluginMenuItem<any>>
      ): void;
      clearMyMenuItems(): void;
    };
    displayElement: {
      add(element: Omit<PluginDisplayElement, "id">): string;
      update(fullId: string, updates: Partial<PluginDisplayElement>): void;
      remove(fullId: string): void;
      clearMyElements(): void;
    };
    dialog: {
      alert(message: string, options?: { confirmText?: string }): Promise<void>;
      confirm(
        message: string,
        options?: {
          confirmText?: string;
          cancelText?: string;
          danger?: boolean;
        }
      ): Promise<boolean>;
      custom(
        html: string,
        options?: {
          confirmText?: string;
          cancelText?: string;
          showCancel?: boolean;
        }
      ): Promise<boolean>;
    };
    components: {
      button(text: string, options?: any): string;
      checkbox(options?: any): string;
      input(options?: any): string;
      dropdown(options: any): string;
      panel(content: string, options?: any): string;
      formRow(label: string, component: string): string;
    };
  };
}
