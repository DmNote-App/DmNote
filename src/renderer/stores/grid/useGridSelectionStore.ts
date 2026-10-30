import { create } from 'zustand';
import {
  isKeepingOtherSelection,
  keepOtherSelection,
  replaceOtherSelection,
  routeOtherMembers,
} from './keepOtherSelection';
import { TREE_EDITED_KINDS } from '@src/types/elementKinds';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import type {
  CanonicalPositionOf,
  EditorElementTypeV1,
  ItemElementType,
} from '@src/types/editor';

export type SelectableElementType = EditorElementTypeV1 | 'plugin';

export type IndexedSelectableElementType = Exclude<
  SelectableElementType,
  'plugin'
>;

export type IndexedElementArrays = {
  keyMappings: readonly unknown[];
  keyPositions: readonly CanonicalPositionOf<'key'>[];
} & { [K in ItemElementType]: readonly CanonicalPositionOf<K>[] };

type NativeSelectedElement = {
  [Type in IndexedSelectableElementType]: {
    type: Type;
    id: string;
    // canonical에서 파생된 locator 캐시. 신원이 아니다 - 문서 적용 시 id로 재계산된다
    index?: number;
  };
}[IndexedSelectableElementType];

interface PluginSelectedElement {
  type: 'plugin';
  id: string;
  index?: never;
}

export type SelectedElement = NativeSelectedElement | PluginSelectedElement;

// 클립보드 - 옛 선택은 플러그인 요소만 담는다 (트리 요소는 트리 클립보드)
export interface ClipboardItem {
  type: 'plugin';
  element: Omit<PluginDisplayElementInternal, 'fullId'>;
}

interface GridSelectionState {
  // 선택된 요소들
  selectedElements: SelectedElement[];
  // 명시적으로 선택된 그룹 ID들 (그룹 헤더 클릭으로 선택된 경우)
  selectedGroupIds: string[];

  // 마지막으로 선택된 키의 좌표 (Shift+클릭 범위 선택용)
  lastSelectedKeyBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;

  // 클립보드 (복사된 요소들)
  clipboard: ClipboardItem[];

  // 마퀴 선택 상태
  isMarqueeSelecting: boolean;
  marqueeStart: { x: number; y: number } | null;
  marqueeEnd: { x: number; y: number } | null;

  // 미들 버튼 드래그 상태
  isMiddleButtonDragging: boolean;

  // 드래그/리사이즈 중인 상태 (CSS 애니메이션 비활성화용)
  isDraggingOrResizing: boolean;

  // 리사이즈 중인 상태 (이동 합성 레이어와 분리)
  isResizing: boolean;

  // 액션
  selectElement: (element: SelectedElement, addToSelection?: boolean) => void;
  toggleSelection: (element: SelectedElement) => void;
  deselectElement: (id: string) => void;
  clearSelection: () => void;
  setSelectedElements: (elements: SelectedElement[]) => void;
  setFullSelection: (elements: SelectedElement[], groupIds: string[]) => void;
  isSelected: (id: string) => boolean;
  setLastSelectedKeyBounds: (
    bounds: { x: number; y: number; width: number; height: number } | null,
  ) => void;

  // 클립보드 Actions
  setClipboard: (items: ClipboardItem[]) => void;
  clearClipboard: () => void;

  // 마퀴 선택 Actions
  startMarqueeSelection: (x: number, y: number) => void;
  updateMarqueeSelection: (x: number, y: number) => void;
  endMarqueeSelection: () => void;

  // 미들 버튼 드래그 Actions
  setMiddleButtonDragging: (isDragging: boolean) => void;

  // 드래그/리사이즈 상태 설정
  setDraggingOrResizing: (isDragging: boolean) => void;
  setResizing: (isResizing: boolean) => void;

  // 선택된 요소들 일괄 이동
  moveSelectedElements: (deltaX: number, deltaY: number) => void;
}

export const selectGridTransformLayerPromotion = (state: {
  isDraggingOrResizing: boolean;
  isResizing: boolean;
}): boolean => state.isDraggingOrResizing && !state.isResizing;

// 트리로 옮긴 옛 종류(TREE_EDITED_KINDS)는 트리 선택이 맡는다 - 옛 선택으로 들어오면 그쪽으로 보낸다
const isTreeEditedSelection = (element: SelectedElement) =>
  element.type !== 'plugin' && TREE_EDITED_KINDS.has(element.type);

const splitTreeEdited = (incoming: SelectedElement[]) => {
  if (!incoming.some(isTreeEditedSelection)) {
    return { elements: incoming, treeIds: [] as string[] };
  }
  return {
    elements: incoming.filter((element) => !isTreeEditedSelection(element)),
    treeIds: incoming.filter(isTreeEditedSelection).map(({ id }) => id),
  };
};

export const useGridSelectionStore = create<GridSelectionState>((set, get) => ({
  selectedElements: [],
  selectedGroupIds: [],
  lastSelectedKeyBounds: null,
  clipboard: [],
  isMarqueeSelecting: false,
  marqueeStart: null,
  marqueeEnd: null,
  isMiddleButtonDragging: false,
  isDraggingOrResizing: false,
  isResizing: false,

  selectElement: (element, addToSelection = false) => {
    if (isTreeEditedSelection(element)) {
      if (!addToSelection) {
        set({ selectedElements: [], selectedGroupIds: [] });
        replaceOtherSelection();
      }
      routeOtherMembers([element.id], addToSelection ? 'toggle' : 'replace');
      return;
    }
    set((state) => {
      if (addToSelection) {
        const existingIndex = state.selectedElements.findIndex(
          (el) => el.id === element.id,
        );
        if (existingIndex >= 0) {
          return {
            selectedElements: state.selectedElements.filter(
              (el) => el.id !== element.id,
            ),
            selectedGroupIds: [],
          };
        }
        return {
          selectedElements: [...state.selectedElements, element],
          selectedGroupIds: [],
        };
      }
      return {
        selectedElements: [element],
        selectedGroupIds: [],
      };
    });
    if (!addToSelection) replaceOtherSelection();
  },

  toggleSelection: (element) => {
    if (isTreeEditedSelection(element)) {
      routeOtherMembers([element.id], 'toggle');
      return;
    }
    set((state) => {
      const existingIndex = state.selectedElements.findIndex(
        (el) => el.id === element.id,
      );
      if (existingIndex >= 0) {
        return {
          selectedElements: state.selectedElements.filter(
            (el) => el.id !== element.id,
          ),
          selectedGroupIds: [],
        };
      }
      return {
        selectedElements: [...state.selectedElements, element],
        selectedGroupIds: [],
      };
    });
  },

  deselectElement: (id) => {
    set((state) => ({
      selectedElements: state.selectedElements.filter((el) => el.id !== id),
      selectedGroupIds: [],
    }));
  },

  // 선택 해제는 트리 선택도 함께 (넣고 빼기 안에서는 지킨다)
  clearSelection: () => {
    set({ selectedElements: [], selectedGroupIds: [] });
    replaceOtherSelection();
  },

  setSelectedElements: (incoming) => {
    const { elements, treeIds } = splitTreeEdited(incoming);
    set((state) => {
      // 논리적으로 같은 선택이면 참조를 유지해 구독자 리렌더 방지
      const same =
        state.selectedElements.length === elements.length &&
        state.selectedElements.every((el, i) => {
          const next = elements[i];
          return (
            el.type === next.type &&
            el.id === next.id &&
            el.index === next.index
          );
        });
      if (same && state.selectedGroupIds.length === 0) return {};
      return {
        selectedElements: same ? state.selectedElements : elements,
        selectedGroupIds: [],
      };
    });
    // 트리 몫이 있으면 트리 선택을 그 요소로 바로 (비우고 다시 채우면 중간의 빈 선택이 편집 제스처를 취소한다)
    if (treeIds.length > 0) {
      routeOtherMembers(treeIds, isKeepingOtherSelection() ? 'replace' : 'set');
    } else if (elements.length > 0) {
      replaceOtherSelection();
    }
  },

  setFullSelection: (incoming, groupIds) => {
    const { elements, treeIds } = splitTreeEdited(incoming);
    set({ selectedElements: elements, selectedGroupIds: groupIds });
    if (treeIds.length > 0) {
      routeOtherMembers(treeIds, isKeepingOtherSelection() ? 'replace' : 'set');
    } else if (elements.length > 0 || groupIds.length > 0) {
      replaceOtherSelection();
    }
  },

  isSelected: (id) => {
    return get().selectedElements.some((el) => el.id === id);
  },

  setLastSelectedKeyBounds: (bounds) => {
    set({ lastSelectedKeyBounds: bounds });
  },

  setClipboard: (items) => {
    set({ clipboard: items });
  },

  clearClipboard: () => {
    set({ clipboard: [] });
  },

  startMarqueeSelection: (x, y) => {
    set({
      isMarqueeSelecting: true,
      marqueeStart: { x, y },
      marqueeEnd: { x, y },
    });
  },

  updateMarqueeSelection: (x, y) => {
    set({ marqueeEnd: { x, y } });
  },

  endMarqueeSelection: () => {
    set({
      isMarqueeSelecting: false,
      marqueeStart: null,
      marqueeEnd: null,
    });
  },

  setMiddleButtonDragging: (isDragging) => {
    set({ isMiddleButtonDragging: isDragging });
  },

  setDraggingOrResizing: (isDragging) => {
    set({ isDraggingOrResizing: isDragging, isResizing: false });
  },

  setResizing: (isResizing) => {
    set({ isDraggingOrResizing: isResizing, isResizing });
  },

  moveSelectedElements: (_deltaX, _deltaY) => {
    // 실제 이동 로직은 Grid 컴포넌트에서 처리
    // 이 함수는 외부에서 호출될 콜백을 위한 placeholder
  },
}));

export function invalidateSelectionForChangedIndexedElementArrays(
  _current: IndexedElementArrays,
  next: IndexedElementArrays,
) {
  const selection = useGridSelectionStore.getState();
  if (selection.selectedElements.length === 0) return;

  const nextPositionsFor = (
    type: IndexedSelectableElementType,
  ): readonly { id: string }[] =>
    type === 'key' ? next.keyPositions : next[type];

  let changed = false;
  const selectedElements = selection.selectedElements.reduce<SelectedElement[]>(
    (resolved, element) => {
      if (element.type === 'plugin') {
        resolved.push(element);
        return resolved;
      }

      const newIndex = nextPositionsFor(element.type).findIndex(
        (position) => position?.id === element.id,
      );
      if (newIndex === -1) {
        changed = true;
        return resolved;
      }
      if (newIndex !== element.index) {
        changed = true;
        resolved.push({ ...element, index: newIndex });
        return resolved;
      }
      resolved.push(element);
      return resolved;
    },
    [],
  );

  // 고쳐 맞추기는 바꿔 고르기가 아니다 - 함께 고른 트리 요소 선택을 지킨다
  if (changed) {
    keepOtherSelection(() => selection.setSelectedElements(selectedElements));
  }
}

// 재주입으로 fullId가 갈린 플러그인 선택 제거. 현존 fullId 집합 기준.
// ownerPluginId를 주면 그 플러그인 소유 선택만 판정한다 - 스토어는 전
// 플러그인 공용이라, 리로드 공백(요소가 잠시 비는 창)에 있는 다른 플러그인의
// 정당한 선택까지 죽은 것으로 보고 지우는 것을 막는다
export function pruneStalePluginSelection(
  liveFullIds: ReadonlySet<string>,
  ownerPluginId?: string,
) {
  const selection = useGridSelectionStore.getState();
  if (selection.selectedElements.length === 0) return;
  // 표시 요소 fullId는 `${pluginId}::${id}`다. pluginId에는 콜론이 들어갈 수
  // 없으므로(백엔드 validate_plugin_id: 영숫자·하이픈·언더스코어) 콜론 1개
  // 접두사로 충분하고, plugin-a ↔ plugin-ab 오탐도 막힌다
  const ownedByPull = (fullId: string) =>
    ownerPluginId === undefined || fullId.startsWith(`${ownerPluginId}:`);
  const kept = selection.selectedElements.filter(
    (element) =>
      element.type !== 'plugin' ||
      !ownedByPull(element.id) ||
      liveFullIds.has(element.id),
  );
  if (kept.length === selection.selectedElements.length) return;
  keepOtherSelection(() => selection.setSelectedElements(kept));
}

/**
 * 마퀴 영역 계산 헬퍼
 */
export function getMarqueeRect(
  start: { x: number; y: number } | null,
  end: { x: number; y: number } | null,
): { left: number; top: number; width: number; height: number } | null {
  if (!start || !end) return null;

  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  return { left, top, width, height };
}

/**
 * 요소가 마퀴 영역 내에 있는지 확인
 */
export function isElementInMarquee(
  elementBounds: { x: number; y: number; width: number; height: number },
  marqueeRect: { left: number; top: number; width: number; height: number },
): boolean {
  const elementRight = elementBounds.x + elementBounds.width;
  const elementBottom = elementBounds.y + elementBounds.height;
  const marqueeRight = marqueeRect.left + marqueeRect.width;
  const marqueeBottom = marqueeRect.top + marqueeRect.height;

  // 교차 여부 확인
  return !(
    elementBounds.x > marqueeRight ||
    elementRight < marqueeRect.left ||
    elementBounds.y > marqueeBottom ||
    elementBottom < marqueeRect.top
  );
}
