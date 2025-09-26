import { BootstrapPayload } from "@src/types/app";
import { SettingsState } from "@src/types/settings";
import { CustomTab, KeyMappings, KeyPositions } from "@src/types/keys";
import { CustomCss } from "@src/types/css";

type ModeChangePayload = { mode: string };
type CustomTabsChangePayload = {
  customTabs: CustomTab[];
  selectedKeyType: string;
};
type OverlayStatePayload = { visible: boolean };
type OverlayLockPayload = { locked: boolean };
type OverlayAnchorPayload = { anchor: string };
type OverlayResizePayload = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Unsubscribe = () => void;

declare global {
  interface DMNoteAPI {
    app: {
      bootstrap(): Promise<BootstrapPayload>;
      openExternal(url: string): Promise<void>;
      restart(): Promise<void>;
    };
    window: {
      minimize(): Promise<void>;
      close(): Promise<void>;
    };
    settings: {
      get(): Promise<SettingsState>;
      update(patch: Partial<SettingsState>): Promise<SettingsState>;
      onChanged(listener: (settings: SettingsState) => void): Unsubscribe;
    };
    keys: {
      get(): Promise<KeyMappings>;
      update(mappings: KeyMappings): Promise<KeyMappings>;
      getPositions(): Promise<KeyPositions>;
      updatePositions(positions: KeyPositions): Promise<KeyPositions>;
      setMode(mode: string): Promise<{ success: boolean; mode: string }>;
      resetAll(): Promise<{
        keys: KeyMappings;
        positions: KeyPositions;
        customTabs: CustomTab[];
        selectedKeyType: string;
      }>;
      resetMode(mode: string): Promise<{ success: boolean; mode: string }>;
      onChanged(listener: (keys: KeyMappings) => void): Unsubscribe;
      onPositionsChanged(
        listener: (positions: KeyPositions) => void
      ): Unsubscribe;
      onModeChanged(
        listener: (payload: ModeChangePayload) => void
      ): Unsubscribe;
      onKeyState(
        listener: (payload: {
          key: string;
          state: string;
          mode: string;
        }) => void
      ): Unsubscribe;
      customTabs: {
        list(): Promise<CustomTab[]>;
        create(name: string): Promise<{ result?: CustomTab; error?: string }>;
        delete(
          id: string
        ): Promise<{ success: boolean; selected: string; error?: string }>;
        select(
          id: string
        ): Promise<{ success: boolean; selected: string; error?: string }>;
        onChanged(
          listener: (payload: CustomTabsChangePayload) => void
        ): Unsubscribe;
      };
    };
    overlay: {
      get(): Promise<{ visible: boolean; locked: boolean; anchor: string }>;
      setVisible(visible: boolean): Promise<{ visible: boolean }>;
      setLock(locked: boolean): Promise<{ locked: boolean }>;
      setAnchor(anchor: string): Promise<{ anchor: string }>;
      resize(payload: {
        width: number;
        height: number;
        anchor?: string;
        contentTopOffset?: number;
      }): Promise<{ bounds?: OverlayResizePayload; error?: string }>;
      onVisibility(
        listener: (payload: OverlayStatePayload) => void
      ): Unsubscribe;
      onLock(listener: (payload: OverlayLockPayload) => void): Unsubscribe;
      onAnchor(listener: (payload: OverlayAnchorPayload) => void): Unsubscribe;
      onResized(listener: (payload: OverlayResizePayload) => void): Unsubscribe;
    };
    css: {
      get(): Promise<CustomCss>;
      getUse(): Promise<boolean>;
      toggle(enabled: boolean): Promise<{ enabled: boolean }>;
      load(): Promise<any>;
      setContent(content: string): Promise<any>;
      reset(): Promise<void>;
      onUse(listener: (payload: { enabled: boolean }) => void): Unsubscribe;
      onContent(listener: (payload: CustomCss) => void): Unsubscribe;
    };
    presets: {
      save(): Promise<any>;
      load(): Promise<any>;
    };
  }

  interface Window {
    api: DMNoteAPI;
  }
}

export {};
