'use no memo';
import React, { useEffect, useState } from 'react';
import { useSignals } from '@preact/signals-react/runtime';

import KnobFace from '@components/shared/KnobFace';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import { getAxisSignal } from '@stores/signals/axisSignals';
import {
  gradientToCss,
  resolveStatePair,
  type GradientSpec,
} from '@src/types/color';
import {
  elementShadowToCss,
  resolveElementShadow,
  type ElementShadowSpec,
} from '@src/types/key/shadows';
import { resolveElementBorder } from '@utils/element/elementBorder';
import {
  DEFAULT_ELEMENT_ACTIVE_BG,
  DEFAULT_ELEMENT_ACTIVE_FONT,
  DEFAULT_ELEMENT_ACTIVE_SHADOW_SPEC,
  DEFAULT_ELEMENT_BG,
  DEFAULT_ELEMENT_FONT,
  DEFAULT_ELEMENT_SHADOW_SPEC,
} from '@utils/element/elementDefaults';
import { elementRotationTransform } from '@utils/element/rotation';
import { resolveImageSource } from '@utils/media/imageSource';
import { warmupImageSource } from '@utils/media/imageWarmup';

// 노브 그리기 한 벌 - 오버레이·OBS는 HID 축 신호로 돌리고 회전 중에는 입력 상태, 편집 화면은 눌림 미리보기 상태로 그린다.
// 편집 화면은 일부러 다르게 그린다 (편집할 수 있게): 투명 배경을 칠하고, 대기 이미지가 없으면 입력 이미지를 보인다

interface KnobValues {
  sensitivity: number;
  reverse: boolean;
}

interface SurfaceFields {
  backgroundColor?: string;
  activeBackgroundColor?: string;
  borderColor?: string;
  activeBorderColor?: string;
  backgroundGradient?: GradientSpec | null;
  activeBackgroundGradient?: GradientSpec | null;
  borderGradient?: GradientSpec | null;
  activeBorderGradient?: GradientSpec | null;
  borderWidth?: number;
  borderRadius?: number;
  shadow?: ElementShadowSpec;
  activeShadow?: ElementShadowSpec;
}

interface ImageFields {
  inactiveImage?: string;
  activeImage?: string;
  idleImageFit?: string;
  activeImageFit?: string;
  imageFit?: string;
  idleTransparent?: boolean;
  activeTransparent?: boolean;
}

type KnobFaceProps = ElementRenderProps<KnobValues>;

// 회전 멈춤 후 입력(active) 상태를 유지하는 시간(ms)
const ACTIVE_HOLD_MS = 150;

const KnobDrawing = ({
  element,
  bundles,
  live,
  active,
  motionStyle,
}: KnobFaceProps & {
  active: boolean;
  motionStyle?: React.CSSProperties;
}) => {
  const {
    backgroundColor,
    activeBackgroundColor,
    borderColor,
    activeBorderColor,
    backgroundGradient,
    activeBackgroundGradient,
    borderGradient,
    activeBorderGradient,
    borderWidth,
    borderRadius,
    shadow,
    activeShadow,
  } = (bundles.surface ?? {}) as SurfaceFields;
  const {
    inactiveImage,
    activeImage,
    idleImageFit,
    activeImageFit,
    imageFit,
    idleTransparent,
    activeTransparent,
  } = (bundles.image ?? {}) as ImageFields;

  const inactiveImageSrc = resolveImageSource(inactiveImage);
  const activeImageSrc = resolveImageSource(activeImage);
  // 편집 화면은 대기 이미지가 없으면 입력 이미지로 보인다
  const imageSrc =
    (active && activeImageSrc
      ? activeImageSrc
      : inactiveImageSrc || (live ? null : activeImageSrc)) || null;
  const resolvedFit = (
    active && activeImageSrc
      ? activeImageFit || imageFit || 'cover'
      : idleImageFit || imageFit || 'cover'
  ) as React.CSSProperties['objectFit'];

  const isTransparent = active
    ? activeTransparent === true
    : idleTransparent === true;
  // 그라데이션 쌍 해석 — 상태 간 색/그라데이션이 섞이지 않도록 쌍 단위 폴백
  const bgPair = resolveStatePair(
    active,
    { color: backgroundColor, gradient: backgroundGradient },
    { color: activeBackgroundColor, gradient: activeBackgroundGradient },
  );
  const borderPair = resolveStatePair(
    active,
    { color: borderColor, gradient: borderGradient },
    { color: activeBorderColor, gradient: activeBorderGradient },
  );
  // 보더는 키·그래프와 같은 공용 해석기 (미지정이면 기본 글래스 립)
  const resolvedBorder = resolveElementBorder(
    {
      borderColor,
      activeBorderColor,
      borderGradient,
      activeBorderGradient,
      borderWidth,
    },
    active,
  );
  // 회전 인식 막대 색은 명시 단색 보더만 겸한다 - 그라데이션 보더의 대표 첫 스톱은 막대 색이 아니다
  // (패널이 보여주는 기본 립을 그대로 커밋하면 막대가 사라지므로, 그라데이션이거나 미지정이면 텍스트 색 계열)
  const indicatorColor =
    borderPair.gradient == null && borderPair.color
      ? borderPair.color
      : active
      ? DEFAULT_ELEMENT_ACTIVE_FONT
      : DEFAULT_ELEMENT_FONT;
  const ringWidth = resolvedBorder.width;
  const showBorderRing = Boolean(resolvedBorder.gradient) && ringWidth > 0;
  const stateBackground =
    bgPair.color || (active ? DEFAULT_ELEMENT_ACTIVE_BG : DEFAULT_ELEMENT_BG);
  // 오버레이는 투명 노브의 배경을 비운다 (편집 화면은 칠해서 보인다)
  const background =
    live && isTransparent
      ? 'transparent'
      : bgPair.gradient
      ? gradientToCss(bgPair.gradient)
      : stateBackground;
  // 투명 노브·이미지·명시 테두리는 기본 그림자를 억제한다
  const resolvedShadow = elementShadowToCss(
    resolveElementShadow({
      active,
      shadow,
      activeShadow,
      defaultShadow: DEFAULT_ELEMENT_SHADOW_SPEC,
      defaultActiveShadow: DEFAULT_ELEMENT_ACTIVE_SHADOW_SPEC,
      suppressDefault: Boolean(
        isTransparent || imageSrc || (borderWidth && borderWidth > 0),
      ),
    }),
  );

  return (
    <KnobFace
      active={active}
      useInlineStyles={element.useInlineStyles === true}
      background={background}
      border={
        !showBorderRing && ringWidth > 0
          ? `${ringWidth}px solid ${resolvedBorder.color}`
          : 'none'
      }
      // 모서리 반경 미지정 시 원형 유지 (px 지정 시 키와 동일한 px 단위)
      borderRadius={borderRadius != null ? `${borderRadius}px` : '50%'}
      shadow={resolvedShadow}
      indicatorColor={indicatorColor}
      borderGradient={resolvedBorder.gradient}
      borderWidth={ringWidth}
      showBorderRing={showBorderRing}
      imageSrc={imageSrc}
      imageFit={resolvedFit}
      motionStyle={motionStyle}
    />
  );
};

// 오버레이·OBS 동작 - 축 신호의 누적 회전수(정규화된 wrap-델타)에 배율·방향을 적용해 돌리고,
// 마지막 움직임 뒤 ACTIVE_HOLD_MS 동안 입력(active) 상태를 유지한다. 입력 사이 보간은 CSS transition
const LiveKnob = (props: KnobFaceProps) => {
  useSignals();
  const { element, values, placement } = props;
  const axisId = element.input?.type === 'axis' ? element.input.axisId : '';
  const accum = axisId ? getAxisSignal(axisId).value : 0;
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!axisId) return undefined;
    const signal = getAxisSignal(axisId);
    let prev = signal.value;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = signal.subscribe((value) => {
      if (value === prev) return;
      prev = value;
      setIsActive(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        setIsActive(false);
      }, ACTIVE_HOLD_MS);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      setIsActive(false);
    };
  }, [axisId]);

  const image = (props.bundles.image ?? {}) as ImageFields;
  const inactiveImageSrc = resolveImageSource(image.inactiveImage);
  const activeImageSrc = resolveImageSource(image.activeImage);
  // 첫 회전 입력에서 active 이미지 cold decode가 겹치지 않도록 선행 디코드 (Key/StatItem과 동일 패턴)
  useEffect(() => {
    warmupImageSource(inactiveImageSrc);
    warmupImageSource(activeImageSrc);
  }, [inactiveImageSrc, activeImageSrc]);

  // accum은 회전수 단위(물리 1회전 ≈ 1.0) — sensitivity는 순수 배율
  const angle =
    accum * 360 * (values.sensitivity ?? 1) * (values.reverse ? -1 : 1);
  const drawing = (
    <KnobDrawing
      {...props}
      active={isActive}
      motionStyle={{
        transform: `rotate(${angle}deg)`,
        transition: 'transform 0.1s linear',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
      }}
    />
  );
  if (!placement) return drawing;
  const { x, y, zIndex } = placement;
  const { width, height, rotation } = element.frame;
  return (
    <div
      className={`absolute select-none ${element.className || ''}`}
      data-overlay-hit="true"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        // 요소 회전은 배치 div에만 - 안쪽 KnobFace의 rotate는 HID 값 표시라 섞지 않는다
        transform: `translate3d(calc(${x}px + var(--key-offset-x, 0px)), calc(${y}px + var(--key-offset-y, 0px)), 0)${elementRotationTransform(
          rotation,
        )}`,
        zIndex,
        contain: 'layout style',
      }}
    >
      {drawing}
    </div>
  );
};

const KnobElementFace = (props: KnobFaceProps) =>
  props.live ? (
    <LiveKnob {...props} />
  ) : (
    <KnobDrawing {...props} active={props.inputs.pressed?.value ?? false} />
  );

export default KnobElementFace;
