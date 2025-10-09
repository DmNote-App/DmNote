import {
  NOTE_SETTINGS_DEFAULTS,
  type NoteSettings,
  normalizeNoteSettings,
} from "@src/types/noteSettings";
import { type CustomCss } from "@src/types/css";

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
  backgroundColor: string;
  useCustomCSS: boolean;
  customCSS: CustomCss;
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
  backgroundColor: "transparent",
  useCustomCSS: false,
  customCSS: { path: null, content: "" },
  overlayResizeAnchor: "top-left",
  keyCounterEnabled: false,
};

export type SettingsPatchInput = Partial<
  Omit<SettingsState, "noteSettings" | "customCSS">
> & {
  noteSettings?: Partial<NoteSettings>;
  customCSS?: Partial<CustomCss>;
};

export type SettingsPatch = Partial<
  Omit<SettingsState, "noteSettings" | "customCSS">
> & {
  noteSettings?: NoteSettings;
  customCSS?: CustomCss;
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
    (next as Record<string, unknown>)[key as string] = value;
  }

  return next;
}
