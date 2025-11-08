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

export type Unsubscribe = () => void;

export interface DMNoteAPI {
  app: {
    bootstrap(): Promise<BootstrapPayload>;
    openExternal(url: string): Promise<void>;
    restart(): Promise<void>;
  };
  window: {
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
}
