import { create } from "zustand";
import type { KeyMappings, KeyPositions } from "@src/types/keys";

interface HistoryState {
  keyMappings: KeyMappings;
  positions: KeyPositions;
}

interface HistoryStore {
  past: HistoryState[];
  future: HistoryState[];
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushState: (keyMappings: KeyMappings, positions: KeyPositions) => void;
  undo: () => HistoryState | null;
  redo: () => HistoryState | null;
  clear: () => void;
  clearFuture: () => void;
}

const MAX_HISTORY_SIZE = 50;

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  past: [],
  future: [],

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  pushState: (keyMappings: KeyMappings, positions: KeyPositions) => {
    set((state) => {
      const newState: HistoryState = {
        keyMappings: JSON.parse(JSON.stringify(keyMappings)),
        positions: JSON.parse(JSON.stringify(positions)),
      };

      const newPast = [...state.past, newState];
      // 최대 히스토리 크기 유지
      if (newPast.length > MAX_HISTORY_SIZE) {
        newPast.shift();
      }

      return {
        past: newPast,
        future: [], // 새로운 상태 추가 시 future 초기화
      };
    });
  },

  undo: () => {
    const state = get();
    if (state.past.length === 0) return null;

    const previous = state.past[state.past.length - 1];
    const newPast = state.past.slice(0, -1);

    set({
      past: newPast,
      future: [...state.future, previous],
    });

    return previous;
  },

  redo: () => {
    const state = get();
    if (state.future.length === 0) return null;

    const next = state.future[state.future.length - 1];
    const newFuture = state.future.slice(0, -1);

    set({
      past: [...state.past, next],
      future: newFuture,
    });

    return next;
  },

  clear: () => {
    set({ past: [], future: [] });
  },

  clearFuture: () => {
    set({ future: [] });
  },
}));
