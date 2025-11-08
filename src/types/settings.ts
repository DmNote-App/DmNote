import {
  NOTE_SETTINGS_DEFAULTS,
  type NoteSettings,
  normalizeNoteSettings,
} from "@src/types/noteSettings";
import { type CustomCss } from "@src/types/css";
import { type CustomJs } from "@src/types/js";

export type OverlayResizeAnchor =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

export interface SettingsState {
  hardwareAcceleration: boolean;
  alwaysOnTop: boolean;
  overlayLocked: boolean;
  noteEffect: boolean;
  noteSettings: NoteSettings;
  angleMode: string;
  language: string;
  laboratoryEnabled: boolean;
  developerModeEnabled: boolean;
  backgroundColor: string;
  useCustomCSS: boolean;
  customCSS: CustomCss;
  useCustomJS: boolean;
  customJS: CustomJs;
  overlayResizeAnchor: OverlayResizeAnchor;
  keyCounterEnabled: boolean;
}

export const DEFAULT_SETTINGS_STATE: SettingsState = {
  hardwareAcceleration: true,
  alwaysOnTop: true,
  overlayLocked: false,
  noteEffect: false,
  noteSettings: NOTE_SETTINGS_DEFAULTS,
  angleMode: "d3d11",
  language: "ko",
  laboratoryEnabled: false,
  developerModeEnabled: false,
  backgroundColor: "transparent",
  useCustomCSS: false,
  customCSS: { path: null, content: "" },
  useCustomJS: false,
  customJS: { path: null, content: "", plugins: [] },
  overlayResizeAnchor: "top-left",
  keyCounterEnabled: false,
};

export type SettingsPatchInput = Partial<
  Omit<SettingsState, "noteSettings" | "customCSS" | "customJS">
> & {
  noteSettings?: Partial<NoteSettings>;
  customCSS?: Partial<CustomCss>;
  customJS?: Partial<CustomJs>;
};

export type SettingsPatch = Partial<
  Omit<SettingsState, "noteSettings" | "customCSS" | "customJS">
> & {
  noteSettings?: NoteSettings;
  customCSS?: CustomCss;
  customJS?: CustomJs;
};

export interface SettingsDiff {
  changed: SettingsPatch;
  full: SettingsState;
}

export function normalizeSettingsPatch(
  patch: SettingsPatchInput,
  current: SettingsState
): SettingsPatch {
  const next: SettingsPatch = {};
  const entries = Object.entries(patch) as Array<
    [keyof SettingsPatchInput, SettingsPatchInput[keyof SettingsPatchInput]]
  >;

  for (const [key, value] of entries) {
    if (value === undefined) continue;
    if (key === "noteSettings") {
      next.noteSettings = normalizeNoteSettings({
        ...current.noteSettings,
        ...(value as Partial<NoteSettings>),
      });
      continue;
    }
    if (key === "customCSS") {
      next.customCSS = {
        ...current.customCSS,
        ...(value as Partial<CustomCss>),
      } as CustomCss;
      continue;
    }
    if (key === "customJS") {
      next.customJS = {
        ...current.customJS,
        ...(value as Partial<CustomJs>),
      } as CustomJs;
      continue;
    }
    (next as Record<string, unknown>)[key as string] = value;
  }

  return next;
}
