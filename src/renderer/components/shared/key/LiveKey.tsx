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

interface KeyProps {
  keyName: string;
  globalKey: string;
  position: KeyElementPosition;
  mode?: string;
  counterEnabled?: boolean;
}

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
