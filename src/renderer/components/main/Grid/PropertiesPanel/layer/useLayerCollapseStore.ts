import { create } from 'zustand';

// 레이어 패널에서 접은 그룹 - 패널을 다시 열거나 창을 분리해도 유지한다
interface LayerCollapseState {
  collapsed: ReadonlySet<string>;
  toggle: (groupId: string) => void;
}

export const useLayerCollapseStore = create<LayerCollapseState>((set) => ({
  collapsed: new Set(),
  toggle: (groupId) =>
    set((state) => {
      const next = new Set(state.collapsed);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return { collapsed: next };
    }),
}));
