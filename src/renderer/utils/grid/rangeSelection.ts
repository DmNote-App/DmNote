import {
  isElementInMarquee,
  type SelectedElement,
} from '@stores/grid/useGridSelectionStore';
import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  ITEM_ELEMENT_TYPES,
  type ElementModeArrays,
} from '@src/types/editor';
import { fallbackElementSize } from '@src/types/elementKinds';

export interface KeySelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NativeRangeBounds {
  dx: number;
  dy: number;
  width?: number;
  height?: number;
}

interface NativeRangeElement extends NativeRangeBounds {
  id: string;
  hidden?: boolean;
}

interface PluginRangeElement {
  fullId: string;
  tabId?: string;
  position: { x: number; y: number };
  measuredSize?: { width: number; height: number };
}

type KeyRangeSelectionSource = ElementModeArrays<
  NativeRangeElement | null | undefined
> & {
  mode: string;
  keyPositions: readonly NativeRangeElement[];
  pluginElements: readonly PluginRangeElement[];
};

const boundsFor = (
  position: NativeRangeBounds,
  defaultWidth: number,
  defaultHeight: number,
): KeySelectionBounds => ({
  x: position.dx,
  y: position.dy,
  width: position.width || defaultWidth,
  height: position.height || defaultHeight,
});

export const getKeySelectionBounds = (
  position: NativeRangeBounds,
): KeySelectionBounds => boundsFor(position, 60, 60);

export const collectElementsInKeyRange = (
  anchor: KeySelectionBounds,
  clickedPosition: NativeRangeElement,
  source: KeyRangeSelectionSource,
): SelectedElement[] => {
  const clicked = getKeySelectionBounds(clickedPosition);
  const minX = Math.min(anchor.x, clicked.x);
  const maxX = Math.max(anchor.x + anchor.width, clicked.x + clicked.width);
  const minY = Math.min(anchor.y, clicked.y);
  const maxY = Math.max(anchor.y + anchor.height, clicked.y + clicked.height);
  const rangeRect = {
    left: minX,
    top: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
  const selected: SelectedElement[] = [];

  source.keyPositions.forEach((position, index) => {
    if (isElementInMarquee(getKeySelectionBounds(position), rangeRect)) {
      selected.push({ type: 'key', id: position.id, index });
    }
  });

  source.pluginElements.forEach((element) => {
    const belongsToCurrentTab = !element.tabId || element.tabId === source.mode;
    if (!belongsToCurrentTab || !element.measuredSize) return;
    const elementBounds = {
      x: element.position.x,
      y: element.position.y,
      width: element.measuredSize.width,
      height: element.measuredSize.height,
    };
    if (isElementInMarquee(elementBounds, rangeRect)) {
      selected.push({ type: 'plugin', id: element.fullId });
    }
  });

  for (const type of ITEM_ELEMENT_TYPES) {
    const { width, height } = fallbackElementSize(type);
    source[EDITOR_ELEMENT_POSITION_FIELDS[type]].forEach((position, index) => {
      if (!position || position.hidden) return;
      if (isElementInMarquee(boundsFor(position, width, height), rangeRect)) {
        selected.push({ type, id: position.id, index });
      }
    });
  }
  return selected;
};
