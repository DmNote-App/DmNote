'use no memo';
import React from 'react';
import KeyFaceView, {
  type KeyFacePosition,
} from '@components/shared/key/KeyFaceView';
import {
  useGridElementInteraction,
  type GridElementInteractionProps,
} from '@hooks/Grid/useGridElementInteraction';

interface DraggableKeyProps extends GridElementInteractionProps {
  /** 그라디언트 프리뷰 앵커 종류. id 문자열 모양으로 추론하지 않는다 */
  anchorKind?: 'key' | 'stat';
  position: KeyFacePosition;
  keyName: string;
  zIndex?: number;
  counterEnabled?: boolean;
  counterPreviewValue?: number;
  counterValueSignal?: { value: number };
}

const DraggableKey = React.memo(
  ({
    index,
    elementId,
    anchorKind,
    position,
    keyName,
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
    counterEnabled = false,
    counterPreviewValue = 0,
    counterValueSignal,
  }: DraggableKeyProps) => {
    const { dx, dy, width, height = 60 } = position;

    const interaction = useGridElementInteraction({
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
    const {
      dx: renderDx,
      dy: renderDy,
      handleClick,
      handleContextMenu,
      handleDoubleClick,
      handleSelectionDragPointerDown,
      isDraggingOrResizing,
      isSelectionMode,
    } = interaction;

    if (position?.hidden) return null;

    return (
      <KeyFaceView
        anchorKind={anchorKind ?? 'key'}
        elementId={elementId}
        position={position}
        keyName={keyName}
        isSelected={isSelected}
        counterEnabled={counterEnabled}
        counterPreviewValue={counterPreviewValue}
        counterValueSignal={counterValueSignal}
        placement={{
          dx: renderDx,
          dy: renderDy,
          rotation: position.rotation,
          zIndex: position.zIndex ?? zIndex,
        }}
        attachRef={interaction.attachRef}
        editing={isDraggingOrResizing}
        onClick={handleClick}
        onDoubleClick={onDoubleClick ? handleDoubleClick : undefined}
        onPointerDown={
          isSelectionMode ? handleSelectionDragPointerDown : undefined
        }
        onContextMenu={handleContextMenu}
      />
    );
  },
);

export default DraggableKey;

// 오버레이·OBS 키 - 편집 화면 끌기 훅 없이 쓰도록 따로 둔다 (키 종류 정의가 가져간다)
export { Key } from './LiveKey';
