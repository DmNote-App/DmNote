import { create } from "zustand";
import type { CustomTab, KeyMappings, KeyPositions } from "@src/types/keys";

interface KeyStoreState {
  selectedKeyType: string;
  customTabs: CustomTab[];
  keyMappings: KeyMappings;
  positions: KeyPositions;
  setSelectedKeyType: (mode: string) => void;
  setCustomTabs: (tabs: CustomTab[]) => void;
  setKeyMappings: (mappings: KeyMappings) => void;
  setPositions: (positions: KeyPositions) => void;
}

export const useKeyStore = create<KeyStoreState>((set) => ({
  selectedKeyType: "4key",
  customTabs: [],
  keyMappings: {} as KeyMappings,
  positions: {} as KeyPositions,
  setSelectedKeyType: (mode) => set({ selectedKeyType: mode }),
  setCustomTabs: (tabs) => set({ customTabs: tabs }),
  setKeyMappings: (mappings) => set({ keyMappings: mappings }),
  setPositions: (positions) => set({ positions }),
}));
