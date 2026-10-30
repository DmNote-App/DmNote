'use no memo';
import React, { useEffect } from 'react';
import { getKeySignal } from '@stores/signals/keySignals';
import { getKeyCounterSignal } from '@stores/signals/keyCounterSignals';
import { useSignals } from '@preact/signals-react/runtime';
import { useCounterSettings } from '@hooks/overlay/useCounterSettings';
import { useFailedImageSrcs } from '@hooks/overlay/useFailedImageSrcs';
import { warmupImageSource } from '@utils/media/imageWarmup';
import {
  computeKeyElementStyles,
  type KeyElementPosition,
} from '@hooks/overlay/useKeyElementStyles';
import InsideCounterLayout from '@components/overlay/counters/InsideCounterLayout';
import { OverlayKeyElementFace } from '@components/shared/key/KeyElementFace';
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

interface KeyProps {
  keyName: string;
  globalKey: string;
  position: KeyElementPosition;
  mode?: string;
  counterEnabled?: boolean;
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

export const Key = React.memo(function Key({
  keyName,
  globalKey,
  position,
  mode,
  counterEnabled = false,
}: KeyProps) {
  useSignals();
  const selectorKey = globalKey || keyName;
  const active = getKeySignal(selectorKey).value;

  const { failedImageSrcs, markFailed } = useFailedImageSrcs(
    position.inactiveImage,
    position.activeImage,
  );
  const styles = computeKeyElementStyles({
    position,
    active,
    label: keyName,
    failedImageSrcs,
  });
  const {
    textStyle,
    labelPaintStyle,
    labelHasGradient,
    labelMetricsDep,
    inactiveImageSrc,
    activeImageSrc,
    labelText,
  } = styles;

  useEffect(() => {
    warmupImageSource(inactiveImageSrc);
    warmupImageSource(activeImageSrc);
  }, [inactiveImageSrc, activeImageSrc]);

  const counterSettings = useCounterSettings(position?.counter);

  if (position.hidden) return null;
  if (styles.isTransparent) {
    return (
      <OverlayKeyElementFace
        position={position}
        active={active}
        styles={styles}
        markImageFailed={markFailed}
      />
    );
  }

  const showInsideCounter =
    counterEnabled &&
    counterSettings.enabled &&
    counterSettings.placement === 'inside';

  // 시그널 객체만 넘기고 .value는 읽지 않음 — 카운터 갱신이 Key 전체 리렌더를 만들지 않도록
  const counterSignal = showInsideCounter
    ? getKeyCounterSignal(mode ?? '', globalKey)
    : undefined;

  const insideContent =
    showInsideCounter && counterSignal ? (
      <InsideCounterLayout
        countSignal={counterSignal}
        labelText={labelText}
        textStyle={textStyle}
        labelPaintStyle={labelPaintStyle}
        labelHasGradient={labelHasGradient}
        labelMetricsDep={labelMetricsDep}
        active={active}
        counterSettings={counterSettings}
        useInlineStyles={position.useInlineStyles === true}
      />
    ) : undefined;

  return (
    <OverlayKeyElementFace
      position={position}
      active={active}
      styles={styles}
      insideContent={insideContent}
      markImageFailed={markFailed}
    />
  );
});
