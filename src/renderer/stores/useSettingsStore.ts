import { create } from "zustand";
import {
  NOTE_SETTINGS_DEFAULTS,
  type NoteSettings,
} from "@src/types/noteSettings";
import type { OverlayResizeAnchor } from "@src/types/settings";
import type { JsPlugin } from "@src/types/js";

interface SettingsState {
  hardwareAcceleration: boolean;
  alwaysOnTop: boolean;
  overlayLocked: boolean;
  angleMode: string;
  noteEffect: boolean;
  noteSettings: NoteSettings;
  useCustomCSS: boolean;
  customCSSContent: string;
  customCSSPath: string | null;
  useCustomJS: boolean;
  jsPlugins: JsPlugin[];
  backgroundColor: string;
  language: string;
  laboratoryEnabled: boolean;
  developerModeEnabled: boolean;
  overlayResizeAnchor: OverlayResizeAnchor;
  keyCounterEnabled: boolean;
  setAll: (payload: SettingsStateSnapshot) => void;
  merge: (payload: Partial<SettingsStateSnapshot>) => void;
  setLaboratoryEnabled: (value: boolean) => void;
  setDeveloperModeEnabled: (value: boolean) => void;
  setHardwareAcceleration: (value: boolean) => void;
  setAlwaysOnTop: (value: boolean) => void;
  setUseCustomCSS: (value: boolean) => void;
  setCustomCSSContent: (value: string) => void;
  setCustomCSSPath: (value: string | null) => void;
  setUseCustomJS: (value: boolean) => void;
  setJsPlugins: (value: JsPlugin[]) => void;
  setOverlayLocked: (value: boolean) => void;
  setAngleMode: (value: string) => void;
  setNoteEffect: (value: boolean) => void;
  setNoteSettings: (value: NoteSettings) => void;
  setLanguage: (value: string) => void;
  setBackgroundColor: (value: string) => void;
  setOverlayResizeAnchor: (value: OverlayResizeAnchor) => void;
  setKeyCounterEnabled: (value: boolean) => void;
}

export type SettingsStateSnapshot = Omit<
  SettingsState,
  | "setAll"
  | "merge"
  | "setLaboratoryEnabled"
  | "setHardwareAcceleration"
  | "setAlwaysOnTop"
  | "setUseCustomCSS"
  | "setCustomCSSContent"
  | "setCustomCSSPath"
  | "setUseCustomJS"
  | "setJsPlugins"
  | "setOverlayLocked"
  | "setAngleMode"
  | "setNoteEffect"
  | "setNoteSettings"
  | "setLanguage"
  | "setBackgroundColor"
  | "setOverlayResizeAnchor"
  | "setKeyCounterEnabled"
  | "setDeveloperModeEnabled"
>;

const initialState: SettingsStateSnapshot = {
  hardwareAcceleration: true,
  alwaysOnTop: true,
  overlayLocked: false,
  angleMode: "d3d11",
  noteEffect: false,
  noteSettings: NOTE_SETTINGS_DEFAULTS,
  useCustomCSS: false,
  customCSSContent: "",
  customCSSPath: null,
  useCustomJS: false,
  jsPlugins: [],
  backgroundColor: "transparent",
  language: "ko",
  laboratoryEnabled: false,
  developerModeEnabled: false,
  overlayResizeAnchor: "top-left",
  keyCounterEnabled: false,
};

function mergeSnapshot(
  prev: SettingsStateSnapshot,
  patch: Partial<SettingsStateSnapshot>
): SettingsStateSnapshot {
  const next: SettingsStateSnapshot = {
    ...prev,
    ...patch,
  };

  if (patch.noteSettings) {
    next.noteSettings = {
      ...prev.noteSettings,
      ...patch.noteSettings,
    };
  }
  if (
    patch.customCSSContent !== undefined ||
    patch.customCSSPath !== undefined
  ) {
    next.customCSSContent = patch.customCSSContent ?? prev.customCSSContent;
    next.customCSSPath = patch.customCSSPath ?? prev.customCSSPath;
  }
  if (patch.jsPlugins !== undefined) {
    next.jsPlugins = patch.jsPlugins
      ? patch.jsPlugins.map((plugin) => ({ ...plugin }))
      : prev.jsPlugins;
  }
  return next;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...initialState,
  setAll: (payload) => set(() => mergeSnapshot(initialState, payload)),
  merge: (payload) => set((state) => mergeSnapshot(state, payload)),
  setDeveloperModeEnabled: (value) => set({ developerModeEnabled: value }),
  setHardwareAcceleration: (value) => set({ hardwareAcceleration: value }),
  setAlwaysOnTop: (value) => set({ alwaysOnTop: value }),
  setUseCustomCSS: (value) => set({ useCustomCSS: value }),
  setCustomCSSContent: (value) => set({ customCSSContent: value }),
  setCustomCSSPath: (value) => set({ customCSSPath: value }),
  setUseCustomJS: (value) => set({ useCustomJS: value }),
  setJsPlugins: (value) => set({ jsPlugins: value }),
  setOverlayLocked: (value) => set({ overlayLocked: value }),
  setAngleMode: (value) => set({ angleMode: value }),
  setNoteEffect: (value) => set({ noteEffect: value }),
  setNoteSettings: (value) => set({ noteSettings: value }),
  setLanguage: (value) => set({ language: value }),
  setLaboratoryEnabled: (value) => set({ laboratoryEnabled: value }),
  setBackgroundColor: (value) => set({ backgroundColor: value }),
  setOverlayResizeAnchor: (value) => set({ overlayResizeAnchor: value }),
  setKeyCounterEnabled: (value) => set({ keyCounterEnabled: value }),
}));
