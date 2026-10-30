import React from 'react';
import GraphFaceView, { type GraphPosition } from './GraphFaceView';
import {
  useGridElementInteraction,
  type GridElementInteractionProps,
} from '@hooks/Grid/useGridElementInteraction';

interface GraphItemProps extends GridElementInteractionProps {
  position: GraphPosition;
  zIndex?: number;
}

const GraphItem = ({
  index,
  elementId,
  position,
  onPositionChange,
  onClick,
  onDoubleClick,
  onCtrlClick,
  onShiftClick,
  isSelected = false,
  selectedElements = [],
  onMultiDrag,
  onMultiDragStart,
  onMultiDragEnd,
  activeTool,
  onEraserClick,
  onContextMenu,
  setReferenceRef,
  zoom = 1,
  panX = 0,
  panY = 0,
  zIndex = 0,
  isViewportTransforming = false,
}: GraphItemProps) => {
  const {
    dx = 0,
    dy = 0,
    width = 200,
    height = 100,
  } = position ?? ({} as Partial<GraphPosition>);

  const {
    attachRef,
    dx: renderDx,
    dy: renderDy,
    handleClick,
    handleContextMenu,
    handleDoubleClick,
    handleSelectionDragPointerDown,
    isDraggingOrResizing,
    isSelectionMode,
  } = useGridElementInteraction({
    index,
    elementId,
    initialX: dx,
    initialY: dy,
    elementWidth: width || 200,
    elementHeight: height || 100,
    onPositionChange,
    onClick,
    onDoubleClick,
    onCtrlClick,
    onShiftClick,
    isSelected,
    selectedElements,
    onMultiDrag,
    onMultiDragStart,
    onMultiDragEnd,
    activeTool,
    onEraserClick,
    onContextMenu,
    setReferenceRef,
    zoom,
    panX,
    panY,
    isViewportTransforming,
  });

  if (position?.hidden) return null;
  return (
    <GraphFaceView
      ref={attachRef}
      position={position}
      elementId={elementId}
      isSelected={isSelected}
      dx={renderDx}
      dy={renderDy}
      rotation={position.rotation}
      zIndex={position.zIndex ?? zIndex}
      className={position.className}
      withOffsetVars={true}
      dataEditing={isDraggingOrResizing}
      onClick={handleClick}
      onPointerDown={
        isSelectionMode ? handleSelectionDragPointerDown : undefined
      }
      onDoubleClick={onDoubleClick ? handleDoubleClick : undefined}
      onContextMenu={handleContextMenu}
      onDragStart={(e: React.DragEvent) => e.preventDefault()}
    />
  );
};

export default GraphItem;
