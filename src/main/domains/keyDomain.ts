import crypto from "node:crypto";
import { ipcRouter } from "@main/core/ipcRouter";
import { windowRegistry } from "@main/core/windowRegistry";
import { DomainContext } from "@main/domains/context";
import { DEFAULT_KEYS } from "@main/domains/keys/defaults";
import { DEFAULT_POSITIONS } from "@main/domains/positions/defaults";
import { appStoreDefaults } from "@main/store/schema";
import { NOTE_SETTINGS_DEFAULTS } from "@src/types/noteSettings";
import { CustomTab, KeyMappings, KeyPositions } from "@src/types/keys";

// 기본 제공 탭(모드)
const DEFAULT_MODES = ["4key", "5key", "6key", "8key"];

interface ModePayload {
  mode: string;
}

// 키 매핑/포지션/커스텀 탭 관련 IPC 라우팅
export function registerKeyDomain(ctx: DomainContext) {
  ipcRouter.handle("keys:get", async () => ctx.store.getState().keys);
  ipcRouter.handle(
    "positions:get",
    async () => ctx.store.getState().keyPositions
  );

  ipcRouter.handle<KeyMappings, KeyMappings>(
    "keys:update",
    async (mappings) => {
      const normalized: KeyMappings = mappings;
      ctx.store.update("keys", normalized);
      ctx.keyboard.updateKeyMapping(normalized);
      windowRegistry.broadcast("keys:changed", normalized);
      return normalized;
    }
  );

  ipcRouter.handle<KeyPositions, KeyPositions>(
    "positions:update",
    async (positions) => {
      ctx.store.update("keyPositions", positions);
      windowRegistry.broadcast("positions:changed", positions);
      return positions;
    }
  );

  ipcRouter.handle<ModePayload, { success: boolean; mode: string }>(
    "keys:set-mode",
    async ({ mode }) => {
      const success = ctx.keyboard.setKeyMode(mode);
      const effective = success ? mode : ctx.keyboard.getCurrentMode();
      ctx.store.update("selectedKeyType", effective);
      windowRegistry.broadcast("keys:mode-changed", { mode: effective });
      return { success, mode: effective };
    }
  );

  // 전체 탭/설정 초기화 
  ipcRouter.handle("keys:reset-all", async () => {
    ctx.store.setState({
      keys: DEFAULT_KEYS,
      keyPositions: DEFAULT_POSITIONS,
      backgroundColor: appStoreDefaults.backgroundColor,
      useCustomCSS: false,
      customCSS: { path: null, content: "" },
      noteEffect: false,
      noteSettings: NOTE_SETTINGS_DEFAULTS,
      overlayLocked: appStoreDefaults.overlayLocked,
    });
    ctx.keyboard.updateKeyMapping(DEFAULT_KEYS);
    windowRegistry.broadcast("keys:changed", DEFAULT_KEYS);
    windowRegistry.broadcast("positions:changed", DEFAULT_POSITIONS);
    windowRegistry.broadcast("settings:changed", {
      backgroundColor: appStoreDefaults.backgroundColor,
      useCustomCSS: false,
      customCSS: { path: null, content: "" },
      noteEffect: false,
      noteSettings: NOTE_SETTINGS_DEFAULTS,
      overlayLocked: appStoreDefaults.overlayLocked,
    });
    return {
      keys: DEFAULT_KEYS,
      positions: DEFAULT_POSITIONS,
    };
  });

  // 특정 모드(탭)만 기본값으로 초기화
  ipcRouter.handle<ModePayload, { success: boolean; mode: string }>(
    "keys:reset-mode",
    async ({ mode }) => {
      if (!DEFAULT_MODES.includes(mode)) {
        return { success: false, mode };
      }
      const state = ctx.store.getState();
      const newKeys = {
        ...state.keys,
        [mode]: DEFAULT_KEYS[mode],
      };
      const newPositions = {
        ...state.keyPositions,
        [mode]: DEFAULT_POSITIONS[mode],
      };
      ctx.store.update("keys", newKeys as KeyMappings);
      ctx.store.update("keyPositions", newPositions as KeyPositions);
      ctx.keyboard.updateKeyMapping(newKeys as KeyMappings);
      windowRegistry.broadcast("keys:changed", newKeys);
      windowRegistry.broadcast("positions:changed", newPositions);
      return { success: true, mode };
    }
  );

  ipcRouter.handle(
    "custom-tabs:list",
    async () => ctx.store.getState().customTabs
  );

  ipcRouter.handle<{ name: string }, { result?: CustomTab; error?: string }>(
    "custom-tabs:create",
    async ({ name }) => {
      if (!name || !name.trim()) {
        return { error: "invalid-name" };
      }
      const state = ctx.store.getState();
      if (state.customTabs.some((t) => t.name === name)) {
        return { error: "duplicate-name" };
      }
      if (state.customTabs.length >= 5) {
        return { error: "max-reached" };
      }

      const id = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      const tab: CustomTab = { id, name: name.trim() };
      const customTabs = [...state.customTabs, tab];
      const keys: KeyMappings = { ...state.keys, [id]: [] };
      const positions: KeyPositions = { ...state.keyPositions, [id]: [] };

      ctx.store.setState({
        customTabs,
        keys,
        keyPositions: positions,
        selectedKeyType: id,
      });

      ctx.keyboard.updateKeyMapping(keys);
      ctx.keyboard.setKeyMode(id);

      windowRegistry.broadcast("customTabs:changed", {
        customTabs,
        selectedKeyType: id,
      });
      windowRegistry.broadcast("keys:changed", keys);
      windowRegistry.broadcast("positions:changed", positions);
      windowRegistry.broadcast("keys:mode-changed", { mode: id });

      return { result: tab };
    }
  );

  ipcRouter.handle<
    { id: string },
    { success: boolean; selected: string; error?: string }
  >("custom-tabs:delete", async ({ id }) => {
    const state = ctx.store.getState();
    if (!state.customTabs.some((t) => t.id === id)) {
      return {
        success: false,
        selected: state.selectedKeyType,
        error: "not-found",
      };
    }
    const customTabs = state.customTabs.filter((t) => t.id !== id);
    const keys = { ...state.keys } as KeyMappings;
    const positions = { ...state.keyPositions } as KeyPositions;
    delete keys[id];
    delete positions[id];

    let nextSelected = state.selectedKeyType;
    if (nextSelected === id) {
      const index = state.customTabs.findIndex((t) => t.id === id);
      if (customTabs.length > 0) {
        const pickIndex = index - 1 >= 0 ? index - 1 : 0;
        nextSelected = customTabs[pickIndex].id;
      } else {
        nextSelected = "8key";
      }
    }

    ctx.store.setState({
      customTabs,
      keys,
      keyPositions: positions,
      selectedKeyType: nextSelected,
    });

    ctx.keyboard.updateKeyMapping(keys);
    ctx.keyboard.setKeyMode(nextSelected);

    windowRegistry.broadcast("customTabs:changed", {
      customTabs,
      selectedKeyType: nextSelected,
    });
    windowRegistry.broadcast("keys:changed", keys);
    windowRegistry.broadcast("positions:changed", positions);
    windowRegistry.broadcast("keys:mode-changed", { mode: nextSelected });

    return { success: true, selected: nextSelected };
  });

  ipcRouter.handle<
    { id: string },
    { success: boolean; selected: string; error?: string }
  >("custom-tabs:select", async ({ id }) => {
    const state = ctx.store.getState();
    const exists =
      DEFAULT_MODES.includes(id) || state.customTabs.some((t) => t.id === id);
    if (!exists) {
      return {
        success: false,
        selected: state.selectedKeyType,
        error: "not-found",
      };
    }

    ctx.store.update("selectedKeyType", id);
    ctx.keyboard.setKeyMode(id);
    windowRegistry.broadcast("keys:mode-changed", { mode: id });
    return { success: true, selected: id };
  });
}
