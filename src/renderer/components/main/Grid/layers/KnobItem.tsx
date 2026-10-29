import React from 'react';
import KnobFaceView, { type KnobPosition } from './KnobFaceView';
import {
  useGridElementInteraction,
  type GridElementInteractionProps,
} from '@hooks/Grid/useGridElementInteraction';
import { elementRotationTransform } from '@utils/element/rotation';

interface KnobItemProps extends GridElementInteractionProps {
  position: KnobPosition;
  zIndex?: number;
}

const KnobItem = ({
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
}: KnobItemProps) => {
  const {
    dx = 0,
    dy = 0,
    width = 60,
    height = 60,
    className,
  } = position ?? ({} as Partial<KnobPosition>);
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
    elementWidth: width || 60,
    elementHeight: height || 60,
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
  const transform = `translate(calc(${renderDx}px + var(--key-offset-x, 0px)), calc(${renderDy}px + var(--key-offset-y, 0px)))${elementRotationTransform(
    position.rotation,
  )}`;

  return (
    <div
      ref={attachRef}
      className={`absolute select-none dmn-grabbable ${className || ''}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        transform,
        zIndex: position.zIndex ?? zIndex,
        // 그리드 안 승격 금지 - WebKit은 합성 자식이 생기면 스케일 컨테이너를
        // 레이어로 만들어 전체가 흐려진다
        willChange: 'auto',
        contain: 'layout style',
      }}
      data-editing={isDraggingOrResizing ? 'true' : undefined}
      onClick={handleClick}
      onDoubleClick={onDoubleClick ? handleDoubleClick : undefined}
      onPointerDown={
        isSelectionMode ? handleSelectionDragPointerDown : undefined
      }
      onContextMenu={handleContextMenu}
      onDragStart={(e: React.DragEvent) => e.preventDefault()}
    >
      <KnobFaceView
        position={position}
        elementId={elementId}
        isSelected={isSelected}
      />
    </div>
  );
};

export default KnobItem;
