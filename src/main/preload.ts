import { contextBridge, ipcRenderer } from "electron";
import { BootstrapPayload } from "src/types/app";
import {
  SettingsState,
  SettingsPatchInput,
  SettingsDiff,
} from "@src/types/settings";
import { CustomTab, KeyMappings, KeyPositions } from "src/types/keys";
import { CustomCss } from "src/types/css";

type Listener<T> = (payload: T) => void;
type Unsubscribe = () => void;

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

declare global {
  interface Window {
    api: ReturnType<typeof createApi>;
  }
}

function on<T>(channel: string, listener: Listener<T>): Unsubscribe {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) =>
    listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// 렌더러에서 사용 가능한 단일 API 네임스페이스(window.api)
function createApi() {
  return {
    app: {
      // 초기 스냅샷(설정/키/포지션 등) 로드
      bootstrap(): Promise<BootstrapPayload> {
        return ipcRenderer.invoke("app:bootstrap");
      },
      // 외부 링크 열기
      openExternal(url: string) {
        return ipcRenderer.invoke("app:open-external", { url });
      },
      // 앱 재시작
      restart() {
        return ipcRenderer.invoke("app:restart");
      },
    },
    window: {
      minimize() {
        return ipcRenderer.invoke("window:minimize");
      },
      close() {
        return ipcRenderer.invoke("window:close");
      },
    },
    settings: {
      get(): Promise<SettingsState> {
        return ipcRenderer.invoke("settings:get");
      },
      update(patch: SettingsPatchInput): Promise<SettingsState> {
        return ipcRenderer.invoke("settings:update", patch);
      },
      onChanged(listener: Listener<SettingsDiff>): Unsubscribe {
        return on("settings:changed", listener);
      },
    },
    keys: {
      get(): Promise<KeyMappings> {
        return ipcRenderer.invoke("keys:get");
      },
      update(mappings: KeyMappings): Promise<KeyMappings> {
        return ipcRenderer.invoke("keys:update", mappings);
      },
      getPositions(): Promise<KeyPositions> {
        return ipcRenderer.invoke("positions:get");
      },
      updatePositions(positions: KeyPositions): Promise<KeyPositions> {
        return ipcRenderer.invoke("positions:update", positions);
      },
      setMode(mode: string): Promise<{ success: boolean; mode: string }> {
        return ipcRenderer.invoke("keys:set-mode", { mode });
      },
      resetAll(): Promise<{ keys: KeyMappings; positions: KeyPositions }> {
        return ipcRenderer.invoke("keys:reset-all");
      },
      resetMode(mode: string): Promise<{ success: boolean; mode: string }> {
        return ipcRenderer.invoke("keys:reset-mode", { mode });
      },
      onChanged(listener: Listener<KeyMappings>): Unsubscribe {
        return on("keys:changed", listener);
      },
      onPositionsChanged(listener: Listener<KeyPositions>): Unsubscribe {
        return on("positions:changed", listener);
      },
      onModeChanged(listener: Listener<ModeChangePayload>): Unsubscribe {
        return on("keys:mode-changed", listener);
      },
      onKeyState(
        listener: Listener<{ key: string; state: string; mode: string }>
      ): Unsubscribe {
        return on("keys:state", listener);
      },
      customTabs: {
        list(): Promise<CustomTab[]> {
          return ipcRenderer.invoke("custom-tabs:list");
        },
        create(name: string): Promise<{ result?: CustomTab; error?: string }> {
          return ipcRenderer.invoke("custom-tabs:create", { name });
        },
        delete(
          id: string
        ): Promise<{ success: boolean; selected: string; error?: string }> {
          return ipcRenderer.invoke("custom-tabs:delete", { id });
        },
        select(
          id: string
        ): Promise<{ success: boolean; selected: string; error?: string }> {
          return ipcRenderer.invoke("custom-tabs:select", { id });
        },
        onChanged(listener: Listener<CustomTabsChangePayload>): Unsubscribe {
          return on("customTabs:changed", listener);
        },
      },
    },
    overlay: {
      get(): Promise<{ visible: boolean; locked: boolean; anchor: string }> {
        return ipcRenderer.invoke("overlay:get");
      },
      setVisible(visible: boolean) {
        return ipcRenderer.invoke("overlay:set-visible", { visible });
      },
      setLock(locked: boolean) {
        return ipcRenderer.invoke("overlay:set-lock", { locked });
      },
      setAnchor(anchor: string) {
        return ipcRenderer.invoke("overlay:set-anchor", { anchor });
      },
      resize(payload: {
        width: number;
        height: number;
        anchor?: string;
        contentTopOffset?: number;
      }) {
        return ipcRenderer.invoke("overlay:resize", payload);
      },
      onVisibility(listener: Listener<OverlayStatePayload>): Unsubscribe {
        return on("overlay:visibility", listener);
      },
      onLock(listener: Listener<OverlayLockPayload>): Unsubscribe {
        return on("overlay:lock", listener);
      },
      onAnchor(listener: Listener<OverlayAnchorPayload>): Unsubscribe {
        return on("overlay:anchor", listener);
      },
      onResized(listener: Listener<OverlayResizePayload>): Unsubscribe {
        return on("overlay:resized", listener);
      },
    },
    css: {
      get(): Promise<CustomCss> {
        return ipcRenderer.invoke("css:get");
      },
      getUse(): Promise<boolean> {
        return ipcRenderer.invoke("css:get-use");
      },
      toggle(enabled: boolean) {
        return ipcRenderer.invoke("css:toggle", { enabled });
      },
      load() {
        return ipcRenderer.invoke("css:load");
      },
      setContent(content: string) {
        return ipcRenderer.invoke("css:set-content", { content });
      },
      reset() {
        return ipcRenderer.invoke("css:reset");
      },
      onUse(listener: Listener<{ enabled: boolean }>): Unsubscribe {
        return on("css:use", listener);
      },
      onContent(listener: Listener<CustomCss>): Unsubscribe {
        return on("css:content", listener);
      },
    },
    presets: {
      save() {
        return ipcRenderer.invoke("preset:save");
      },
      load() {
        return ipcRenderer.invoke("preset:load");
      },
    },
  };
}

contextBridge.exposeInMainWorld("api", createApi());
