import { elementRotationTransform } from '@utils/element/rotation';
import React from 'react';
import {
  useGridElementInteraction,
  type GridElementInteractionProps,
} from '@hooks/Grid/useGridElementInteraction';
import SpriteFaceView from './SpriteFaceView';
import { DEFAULT_SPRITE_SIZE } from '@src/types/key/sprites';
import type { CanonicalReactiveSpritePosition } from '@src/types/editor';

interface SpriteItemProps extends GridElementInteractionProps {
  position: CanonicalReactiveSpritePosition;
  zIndex?: number;
}

// 캔버스의 스프라이트는 정적이다: 평소엔 기본 자세, 자세 팝업이 열려 있으면
// 그 자세를 그린다 (편집창 전용 프리뷰). 키 눌림 라이브 반응은 오버레이 창 몫.
// 선택·기준점·자세 핸들은 그리드 오버레이 층(SpriteCanvasHandles)이 그린다
const SpriteItem = ({
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
}: SpriteItemProps) => {
  const {
    dx = 0,
    dy = 0,
    width = DEFAULT_SPRITE_SIZE,
    height = DEFAULT_SPRITE_SIZE,
    className,
  } = position;

  // 편집 중 프리뷰 - 자세 팝업이면 그 자세를 그린다. 드래그·스크럽 중이거나 무효
  // draft면 발행된 스냅샷을 우선하고, 평소에는 canonical 자세를 따른다
  // transform과 이미지는 같은 자세에서 함께 파생해 혼합 상태를 막는다
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
    elementWidth: width || DEFAULT_SPRITE_SIZE,
    elementHeight: height || DEFAULT_SPRITE_SIZE,
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

  if (position.hidden) return null;

  const rootTransform = `translate(calc(${renderDx}px + var(--key-offset-x, 0px)), calc(${renderDy}px + var(--key-offset-y, 0px)))${elementRotationTransform(
    position.rotation,
  )}`;

  return (
    <div
      ref={attachRef}
      className={`absolute select-none dmn-grabbable ${className || ''}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        transform: rootTransform,
        transformOrigin: '50% 50%',
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
      <SpriteFaceView
        position={position}
        elementId={elementId}
        isSelected={isSelected}
      />
    </div>
  );
};

export default SpriteItem;
