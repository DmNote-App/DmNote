import { create } from "zustand";
import {
  PluginDisplayElementInternal,
  PluginDefinitionInternal,
} from "@src/types/api";

interface PluginDisplayElementStore {
  elements: PluginDisplayElementInternal[];
  definitions: Map<string, PluginDefinitionInternal>;
  addElement: (element: PluginDisplayElementInternal) => void;
  updateElement: (
    fullId: string,
    updates: Partial<PluginDisplayElementInternal>
  ) => void;
  removeElement: (fullId: string) => void;
  clearByPluginId: (pluginId: string) => void;
  setElements: (elements: PluginDisplayElementInternal[]) => void;
  registerDefinition: (definition: PluginDefinitionInternal) => void;
}

export const usePluginDisplayElementStore = create<PluginDisplayElementStore>(
  (set) => ({
    elements: [],
    definitions: new Map(),

    addElement: (element) =>
      set((state) => {
        const newElements = [...state.elements, element];
        // 메인 윈도우에서만 오버레이로 동기화
        if ((window as any).__dmn_window_type === "main") {
          syncToOverlay(newElements);
        }
        return { elements: newElements };
      }),

    updateElement: (fullId, updates) =>
      set((state) => {
        const newElements = state.elements.map((el) =>
          el.fullId === fullId ? { ...el, ...updates } : el
        );
        // 메인 윈도우에서만 오버레이로 동기화
        if ((window as any).__dmn_window_type === "main") {
          syncToOverlay(newElements);
        }
        return { elements: newElements };
      }),

    removeElement: (fullId) =>
      set((state) => {
        const newElements = state.elements.filter((el) => el.fullId !== fullId);
        // 메인 윈도우에서만 오버레이로 동기화
        if ((window as any).__dmn_window_type === "main") {
          syncToOverlay(newElements);
        }
        return { elements: newElements };
      }),

    clearByPluginId: (pluginId) =>
      set((state) => {
        const newElements = state.elements.filter(
          (el) => el.pluginId !== pluginId
        );
        const newDefinitions = new Map(state.definitions);
        for (const [id, def] of newDefinitions.entries()) {
          if (def.pluginId === pluginId) {
            newDefinitions.delete(id);
          }
        }
        // 메인 윈도우에서만 오버레이로 동기화
        if ((window as any).__dmn_window_type === "main") {
          syncToOverlay(newElements);
        }
        return { elements: newElements, definitions: newDefinitions };
      }),

    setElements: (elements) =>
      set(() => ({
        elements,
      })),

    registerDefinition: (definition) =>
      set((state) => {
        const newDefinitions = new Map(state.definitions);
        newDefinitions.set(definition.id, definition);
        return { definitions: newDefinitions };
      }),
  })
);

// 메인 윈도우에서 오버레이로 동기화
function syncToOverlay(elements: PluginDisplayElementInternal[]) {
  try {
    if (window.api?.bridge) {
      window.api.bridge.sendTo("overlay", "plugin:displayElements:sync", {
        elements,
      });
    }
  } catch (error) {
    console.error("[DisplayElement Store] Failed to sync to overlay:", error);
  }
}
