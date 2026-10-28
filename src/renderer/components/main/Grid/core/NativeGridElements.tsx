import { Fragment, useState, type MouseEvent } from 'react';
import DraggableKey from '@components/shared/key/Key';
import { renderCanvasItem } from '../layers/canvasItemRenderers';
import { commitElementPosition } from '@hooks/Grid/elementPositionCommit';
import { useStableHandlerSlots } from '@hooks/shared/useStableHandlerSlots';
import { deleteElementById } from '@src/renderer/editor/runtime/operations/elementOps';
import { reportElementOpError } from '@src/renderer/editor/runtime/intent/elementIntent';
import type { NativeElementType } from '@src/renderer/editor/model/elementIdMap';
import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  ITEM_ELEMENT_TYPES,
  type ElementCollectionsModeArrays,
} from '@src/types/editor';
import type { KeySlot } from '@src/types/key/keys';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import type { SelectedElement } from '@stores/grid/useGridSelectionStore';
import { slotDisplayName } from '@utils/keySlot';
import {
  collectElementsInKeyRange,
  getKeySelectionBounds,
  type KeySelectionBounds,
} from '@utils/grid/rangeSelection';
import {
  updateNativeElementReference,
  type NativeElementReferenceRegistry,
} from './nativeElementReferenceRegistry';

interface NativeGridElementsProps {
  mode: string;
  // 현재 모드의 종류별 위치 (키는 렌더 positions)
  modeArrays: ElementCollectionsModeArrays;
  keyMappings: readonly KeySlot[] | undefined;
  pluginElements: readonly PluginDisplayElementInternal[];
  selectedElements: SelectedElement[];
  activeTool: string;
  zoom: number;
  panX: number;
  panY: number;
  isViewportTransforming: boolean;
  keyCounterEnabled: boolean;
  lastSelectedKeyBounds: KeySelectionBounds | null;
  onSelectElement: (type: NativeElementType, index: number) => void;
  onToggleElement: (type: NativeElementType, index: number) => void;
  onClearSelection: () => void;
  onSetSelectedElements: (elements: SelectedElement[]) => void;
  onSetLastSelectedKeyBounds: (bounds: KeySelectionBounds | null) => void;
  onMoveSelection: (deltaX: number, deltaY: number) => void;
  onMultiDragStart: () => void | (() => void);
  onMultiDragEnd: () => void;
  onOpenElementEditor: (type: NativeElementType, index: number) => void;
  onOpenElementContextMenu: (
    type: NativeElementType,
    index: number,
    clientX: number,
    clientY: number,
    referenceElement: HTMLElement | null,
  ) => void;
}

const NativeGridElements = ({
  mode,
  modeArrays,
  keyMappings,
  pluginElements,
  selectedElements,
  activeTool,
  zoom,
  panX,
  panY,
  isViewportTransforming,
  keyCounterEnabled,
  lastSelectedKeyBounds,
  onSelectElement,
  onToggleElement,
  onClearSelection,
  onSetSelectedElements,
  onSetLastSelectedKeyBounds,
  onMoveSelection,
  onMultiDragStart,
  onMultiDragEnd,
  onOpenElementEditor,
  onOpenElementContextMenu,
}: NativeGridElementsProps) => {
  const [referenceElements] = useState<NativeElementReferenceRegistry>(
    () => new Map(),
  );
  const stableHandlers = useStableHandlerSlots();

  const createCommonHandlers = (
    type: NativeElementType,
    index: number,
    elementId: string,
  ) => {
    const referenceKey = `${type}:${elementId}`;
    return {
      onPositionChange: (
        _targetIndex: number,
        dx: number,
        dy: number,
        stableElementId: string,
      ) => commitElementPosition(type, stableElementId, dx, dy),
      onClick: () => onSelectElement(type, index),
      onDoubleClick: () => onOpenElementEditor(type, index),
      onCtrlClick: () => onToggleElement(type, index),
      onShiftClick: () => onToggleElement(type, index),
      onMultiDrag: onMoveSelection,
      onMultiDragStart,
      onMultiDragEnd,
      onEraserClick: () => {
        void deleteElementById(type, elementId).catch(reportElementOpError);
      },
      onContextMenu: (event: MouseEvent) => {
        onOpenElementContextMenu(
          type,
          index,
          event.clientX,
          event.clientY,
          referenceElements.get(referenceKey) || null,
        );
      },
      setReferenceRef: (node: HTMLElement | null) => {
        updateNativeElementReference(referenceElements, referenceKey, node);
      },
    };
  };

  const keyPositions = modeArrays.keyPositions;
  const keyElements =
    keyPositions?.map((position, index) => {
      const saveLastSelectedBounds = () => {
        const current = keyPositions[index];
        if (current) {
          onSetLastSelectedKeyBounds(getKeySelectionBounds(current));
        }
      };
      const handlers = stableHandlers(position.id, {
        ...createCommonHandlers('key', index, position.id),
        onClick: () => {
          onSelectElement('key', index);
          saveLastSelectedBounds();
        },
        onCtrlClick: () => {
          onToggleElement('key', index);
          saveLastSelectedBounds();
        },
        onShiftClick: () => {
          if (!lastSelectedKeyBounds) {
            onClearSelection();
            onToggleElement('key', index);
            saveLastSelectedBounds();
            return;
          }

          const clickedPosition = keyPositions[index];
          if (!clickedPosition) return;
          onSetSelectedElements(
            collectElementsInKeyRange(lastSelectedKeyBounds, clickedPosition, {
              ...modeArrays,
              mode,
              pluginElements,
            }),
          );
        },
      });

      return (
        <DraggableKey
          key={position.id}
          index={index}
          elementId={position.id}
          position={position}
          keyName={slotDisplayName(keyMappings?.[index] ?? '')}
          zIndex={position.zIndex ?? index}
          isSelected={selectedElements.some(
            (element) => element.type === 'key' && element.id === position.id,
          )}
          selectedElements={selectedElements}
          activeTool={activeTool}
          zoom={zoom}
          panX={panX}
          panY={panY}
          isViewportTransforming={isViewportTransforming}
          counterEnabled={keyCounterEnabled}
          counterPreviewValue={0}
          {...handlers}
        />
      );
    }) ?? null;

  const itemElements = ITEM_ELEMENT_TYPES.map((type) => (
    <Fragment key={type}>
      {modeArrays[EDITOR_ELEMENT_POSITION_FIELDS[type]].map((position, index) =>
        renderCanvasItem(type, position as never, {
          index,
          elementId: position.id,
          zIndex: position.zIndex ?? index,
          isSelected: selectedElements.some(
            (element) => element.type === type && element.id === position.id,
          ),
          selectedElements,
          activeTool,
          zoom,
          panX,
          panY,
          isViewportTransforming,
          ...stableHandlers(
            position.id,
            createCommonHandlers(type, index, position.id),
          ),
        }),
      )}
    </Fragment>
  ));

  return (
    <>
      {keyElements}
      {itemElements}
    </>
  );
};

export default NativeGridElements;
