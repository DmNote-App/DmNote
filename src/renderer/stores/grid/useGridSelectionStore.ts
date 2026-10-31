import { create } from 'zustand';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import type { EditorElementTypeV1 } from '@src/types/editor';

export type SelectableElementType = EditorElementTypeV1 | 'plugin';

export type IndexedSelectableElementType = Exclude<
  SelectableElementType,
  'plugin'
>;

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

// 선택은 useDocumentSelectionStore가 맡는다
interface GridSelectionState {
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
}

export const selectGridTransformLayerPromotion = (state: {
  isDraggingOrResizing: boolean;
  isResizing: boolean;
}): boolean => state.isDraggingOrResizing && !state.isResizing;

export const useGridSelectionStore = create<GridSelectionState>((set) => ({
  lastSelectedKeyBounds: null,
  clipboard: [],
  isMarqueeSelecting: false,
  marqueeStart: null,
  marqueeEnd: null,
  isMiddleButtonDragging: false,
  isDraggingOrResizing: false,
  isResizing: false,

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
}));

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
