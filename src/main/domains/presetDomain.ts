import { app, dialog } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ipcRouter } from "@main/core/ipcRouter";
import { windowRegistry } from "@main/core/windowRegistry";
import { DomainContext } from "@main/domains/context";
import { DEFAULT_KEYS } from "@main/domains/keys/defaults";
import { DEFAULT_POSITIONS } from "@main/domains/positions/defaults";
import {
  NOTE_SETTINGS_DEFAULTS,
  noteSettingsSchema,
} from "@src/types/noteSettings";
import {
  customTabsSchema,
  keyMappingSchema,
  keyPositionsSchema,
  type KeyMappings,
} from "@src/types/keys";
import { customCssSchema } from "@src/types/css";

const presetSchema = z.object({
  keys: keyMappingSchema.optional(),
  keyPositions: keyPositionsSchema.optional(),
  backgroundColor: z.string().optional(),
  noteSettings: noteSettingsSchema.optional(),
  laboratoryEnabled: z.boolean().optional(),
  customTabs: customTabsSchema.optional(),
  selectedKeyType: z.string().optional(),
  useCustomCSS: z.boolean().optional(),
  customCSS: customCssSchema.optional(),
});

export function registerPresetDomain(ctx: DomainContext) {
  ipcRouter.handle("preset:save", async () => {
    const state = ctx.store.getState();
    const preset = {
      keys: state.keys,
      keyPositions: state.keyPositions,
      backgroundColor: state.backgroundColor,
      noteSettings: state.noteSettings,
      laboratoryEnabled: state.laboratoryEnabled,
      customTabs: state.customTabs,
      selectedKeyType: state.selectedKeyType,
      useCustomCSS: state.useCustomCSS,
      customCSS: state.customCSS,
    };

    const { filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath("documents"), "dm-note-preset.json"),
      filters: [{ name: "DM NOTE Preset", extensions: ["json"] }],
    });

    if (!filePath) {
      return { success: false };
    }

    try {
      writeFileSync(filePath, JSON.stringify(preset, null, 2), "utf8");
      return { success: true };
    } catch (error) {
      console.error("Failed to save preset:", error);
      return { success: false, error: String(error) };
    }
  });

  ipcRouter.handle("preset:load", async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "DM NOTE Preset", extensions: ["json"] }],
    });
    if (canceled || !filePaths.length) {
      return { success: false };
    }
    try {
      const content = readFileSync(filePaths[0], "utf8");
      const parsed = presetSchema.safeParse(JSON.parse(content));
      if (!parsed.success) {
        return { success: false, error: "invalid-preset" };
      }

      const preset = parsed.data;
      const keys = preset.keys ?? DEFAULT_KEYS;
      const positions = preset.keyPositions ?? DEFAULT_POSITIONS;
      const customTabs = Array.isArray(preset.customTabs)
        ? preset.customTabs
        : synthesizeCustomTabs(keys);
      const selectedKeyType = chooseSelectedKeyType({
        requested: preset.selectedKeyType,
        keys,
        fallback: ctx.store.getState().selectedKeyType,
      });

      ctx.settings.applyPatch({
        backgroundColor: preset.backgroundColor ?? "transparent",
        noteSettings: preset.noteSettings ?? NOTE_SETTINGS_DEFAULTS,
        laboratoryEnabled: preset.laboratoryEnabled ?? false,
        useCustomCSS: preset.useCustomCSS ?? false,
        customCSS: preset.customCSS ?? { path: null, content: "" },
      });

      ctx.store.setState({
        keys,
        keyPositions: positions,
        customTabs,
        selectedKeyType,
      });

      ctx.keyboard.updateKeyMapping(keys);
      ctx.keyboard.setKeyMode(selectedKeyType);

      windowRegistry.broadcast("keys:changed", keys);
      windowRegistry.broadcast("positions:changed", positions);
      windowRegistry.broadcast("customTabs:changed", {
        customTabs,
        selectedKeyType,
      });
      windowRegistry.broadcast("keys:mode-changed", { mode: selectedKeyType });
      windowRegistry.broadcast("css:use", {
        enabled: preset.useCustomCSS ?? false,
      });
      windowRegistry.broadcast(
        "css:content",
        preset.customCSS ?? { path: null, content: "" }
      );

      return { success: true };
    } catch (error) {
      console.error("Failed to load preset:", error);
      return { success: false, error: String(error) };
    }
  });
}

function synthesizeCustomTabs(keys: KeyMappings) {
  const defaultModes = new Set(Object.keys(DEFAULT_KEYS));
  return Object.keys(keys)
    .filter((key) => !defaultModes.has(key))
    .map((id, idx) => ({ id, name: `Custom ${idx + 1}` }));
}

function chooseSelectedKeyType({
  requested,
  keys,
  fallback,
}: {
  requested?: string;
  keys: KeyMappings;
  fallback: string;
}) {
  if (requested && keys[requested]) return requested;
  if (keys[fallback]) return fallback;
  return "4key";
}

