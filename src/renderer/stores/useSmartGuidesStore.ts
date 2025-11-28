import { create } from "zustand";
import type { GuideLine, ElementBounds } from "@utils/smartGuides";

interface SmartGuidesState {
  // 현재 활성화된 가이드라인들
  activeGuides: GuideLine[];
  // 드래그 중인 요소의 bounds
  draggedBounds: ElementBounds | null;
  // 스마트 가이드 활성화 여부
  isActive: boolean;

  // Actions
  setActiveGuides: (guides: GuideLine[]) => void;
  setDraggedBounds: (bounds: ElementBounds | null) => void;
  clearGuides: () => void;
}

export const useSmartGuidesStore = create<SmartGuidesState>((set) => ({
  activeGuides: [],
  draggedBounds: null,
  isActive: false,

  setActiveGuides: (guides) =>
    set({
      activeGuides: guides,
      isActive: guides.length > 0,
    }),

  setDraggedBounds: (bounds) =>
    set({
      draggedBounds: bounds,
    }),

  clearGuides: () =>
    set({
      activeGuides: [],
      draggedBounds: null,
      isActive: false,
    }),
}));
