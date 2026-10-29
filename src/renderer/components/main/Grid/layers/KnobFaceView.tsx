import React from 'react';
import {
  gradientToCss,
  resolveStatePair,
  type GradientSpec,
} from '@src/types/color';
import KnobFace from '@components/shared/KnobFace';
import { useGradientPreviewSession } from '@stores/grid/useGradientEditStore';
import { useEditStatePreviewActive } from '@stores/grid/useEditStatePreviewStore';
import { resolveImageSource } from '@utils/media/imageSource';
import {
  DEFAULT_ELEMENT_BG,
  DEFAULT_ELEMENT_ACTIVE_BG,
  DEFAULT_ELEMENT_FONT,
  DEFAULT_ELEMENT_ACTIVE_FONT,
  DEFAULT_ELEMENT_SHADOW_SPEC,
  DEFAULT_ELEMENT_ACTIVE_SHADOW_SPEC,
} from '@utils/element/elementDefaults';
import { resolveElementBorder } from '@utils/element/elementBorder';
import {
  elementShadowToCss,
  resolveElementShadow,
  type ElementShadowSpec,
} from '@src/types/key/shadows';

export interface KnobPosition {
  hidden?: boolean;
  rotation?: number;
  dx?: number;
  dy?: number;
  width?: number;
  height?: number;
  className?: string;
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
  inactiveImage?: string;
  activeImage?: string;
  idleImageFit?: string;
  activeImageFit?: string;
  imageFit?: string;
  idleTransparent?: boolean;
  activeTransparent?: boolean;
  useInlineStyles?: boolean;
  zIndex?: number;
}

interface KnobFaceViewProps {
  position: KnobPosition;
  elementId: string;
  isSelected: boolean;
}

/** 편집 화면 노브 겉모습 - 옛 노브 요소와 트리 요소가 같이 쓴다 (편집 미리보기 세션·상태 미리보기 포함) */
const KnobFaceView = ({
  position,
  elementId,
  isSelected,
}: KnobFaceViewProps) => {
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
    inactiveImage,
    activeImage,
    idleImageFit,
    activeImageFit,
    imageFit,
    idleTransparent,
    activeTransparent,
    useInlineStyles,
  } = position;
  const useInline = useInlineStyles === true;

  // 편집 세션 일시 페인트 — 대상 spec과 대기/입력 상태를 한 묶음으로 렌더
  const previewSession = useGradientPreviewSession(
    'knob',
    elementId,
    isSelected,
  );
  // 상태 프리뷰는 전용 스토어가 유일한 원천 (세션은 spec 페인트 전용)
  const previewActive = useEditStatePreviewActive(
    'knob',
    elementId,
    isSelected,
  );
  const bgPair = resolveStatePair(
    previewActive,
    { color: backgroundColor, gradient: backgroundGradient },
    { color: activeBackgroundColor, gradient: activeBackgroundGradient },
  );
  const borderPair = resolveStatePair(
    previewActive,
    { color: borderColor, gradient: borderGradient },
    { color: activeBorderColor, gradient: activeBorderGradient },
  );
  const effectiveBgGradient =
    previewSession?.surface === 'background'
      ? previewSession.spec
      : bgPair.gradient;
  // 보더는 키·그래프와 같은 공용 해석기 (미지정이면 기본 글래스 립)
  const resolvedKnobBorder = resolveElementBorder(
    {
      borderColor,
      activeBorderColor,
      borderGradient,
      activeBorderGradient,
      borderWidth,
    },
    previewActive,
  );
  const effectiveBorderGradient =
    previewSession?.surface === 'border'
      ? previewSession.spec
      : resolvedKnobBorder.gradient;
  const stateBackgroundColor =
    bgPair.color ||
    (previewActive ? DEFAULT_ELEMENT_ACTIVE_BG : DEFAULT_ELEMENT_BG);
  // 회전 인식 막대 색은 명시 단색 보더만 겸한다. 그라데이션 보더의 대표 첫 스톱은
  // 막대 색이 아니다 - 패널이 보여주는 기본 립(0.14 알파)을 그대로 커밋하면 막대가
  // 사라지므로, 그라데이션이거나 미지정이면 텍스트 색 계열.
  // 프리뷰 중에도 링과 같은 기준(effective)을 봐야 커밋 순간 막대가 튀지 않는다
  const stateBorderColor =
    effectiveBorderGradient == null && borderPair.color
      ? borderPair.color
      : previewActive
      ? DEFAULT_ELEMENT_ACTIVE_FONT
      : DEFAULT_ELEMENT_FONT;

  const gradientRingWidth = resolvedKnobBorder.width;
  const showBorderRing =
    Boolean(effectiveBorderGradient) && gradientRingWidth > 0;
  const resolvedRadius = borderRadius != null ? `${borderRadius}px` : '50%';
  const resolvedBorder =
    !showBorderRing && gradientRingWidth > 0
      ? `${gradientRingWidth}px solid ${resolvedKnobBorder.color}`
      : 'none';
  const inactiveImageSrc = resolveImageSource(inactiveImage);
  const activeImageSrc = resolveImageSource(activeImage);
  const imageSrc =
    (previewActive && activeImageSrc
      ? activeImageSrc
      : inactiveImageSrc || activeImageSrc) || null;
  // 투명 노브의 기본 그림자 억제 — 오버레이(OverlayKnobItem)와 동일 규칙
  const isTransparent = previewActive
    ? activeTransparent === true
    : idleTransparent === true;
  const resolvedShadow = elementShadowToCss(
    resolveElementShadow({
      active: previewActive,
      shadow,
      activeShadow,
      defaultShadow: DEFAULT_ELEMENT_SHADOW_SPEC,
      defaultActiveShadow: DEFAULT_ELEMENT_ACTIVE_SHADOW_SPEC,
      suppressDefault: Boolean(
        isTransparent || imageSrc || (borderWidth && borderWidth > 0),
      ),
    }),
  );
  const resolvedFit = (
    previewActive && activeImageSrc
      ? activeImageFit || imageFit || 'cover'
      : idleImageFit || imageFit || 'cover'
  ) as React.CSSProperties['objectFit'];

  return (
    <KnobFace
      active={previewActive}
      useInlineStyles={useInline}
      background={
        effectiveBgGradient
          ? gradientToCss(effectiveBgGradient)
          : stateBackgroundColor
      }
      border={resolvedBorder}
      borderRadius={resolvedRadius}
      shadow={resolvedShadow}
      indicatorColor={stateBorderColor}
      borderGradient={effectiveBorderGradient}
      borderWidth={gradientRingWidth}
      showBorderRing={showBorderRing}
      imageSrc={imageSrc}
      imageFit={resolvedFit}
    />
  );
};

export default KnobFaceView;
