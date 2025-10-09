import { SettingsState } from "@src/types/settings";
import {
  CustomTab,
  KeyMappings,
  KeyPositions,
  KeyCounters,
} from "@src/types/keys";

export interface BootstrapPayload {
  settings: SettingsState;
  keys: KeyMappings;
  positions: KeyPositions;
  customTabs: CustomTab[];
  selectedKeyType: string;
  currentMode: string;
  overlay: {
    visible: boolean;
    locked: boolean;
    anchor: string;
  };
  keyCounters: KeyCounters;
}
