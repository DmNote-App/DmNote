import React from 'react';

import {
  DEFAULT_ELEMENT_ACTIVE_BG,
  DEFAULT_ELEMENT_ACTIVE_SHADOW_SPEC,
  DEFAULT_ELEMENT_BG,
  DEFAULT_ELEMENT_RADIUS,
  DEFAULT_ELEMENT_SHADOW_SPEC,
} from '@utils/element/elementDefaults';
import { resolveElementBorder } from '@utils/element/elementBorder';
import {
  gradientRingStyle,
  gradientToCss,
  resolveStatePair,
  type GradientSpec,
} from '@src/types/color';
import {
  elementShadowToCss,
  resolveElementShadow,
  type ElementShadowSpec,
} from '@src/types/key/shadows';

// 표면 묶음 - 칸 이름은 키·그래프·노브의 표면 칸과 같다
export interface SurfaceBundle {
  backgroundColor?: string | null;
  backgroundGradient?: GradientSpec | null;
  activeBackgroundColor?: string | null;
  activeBackgroundGradient?: GradientSpec | null;
  borderColor?: string | null;
  borderGradient?: GradientSpec | null;
  activeBorderColor?: string | null;
  activeBorderGradient?: GradientSpec | null;
  borderWidth?: number | null;
  borderRadius?: number | null;
  shadow?: ElementShadowSpec | null;
  activeShadow?: ElementShadowSpec | null;
}

interface ElementSurfaceProps {
  surface: SurfaceBundle | undefined;
  active?: boolean;
  // 사용자 CSS가 앱 인라인 스타일을 이기게 둘지 (useInlineStyles가 false면 링 배경을 전역 규칙에 맡긴다)
  useInlineStyles?: boolean;
  children?: React.ReactNode;
}

/** 표면 묶음을 쓰는 종류의 바탕 - 배경·테두리(단색·그라데이션 링)·그림자 */
const ElementSurface = ({
  surface = {},
  active = false,
  useInlineStyles = false,
  children,
}: ElementSurfaceProps) => {
  const background = resolveStatePair(
    active,
    {
      color: surface.backgroundColor ?? undefined,
      gradient: surface.backgroundGradient,
    },
    {
      color: surface.activeBackgroundColor ?? undefined,
      gradient: surface.activeBackgroundGradient,
    },
  );
  const border = resolveElementBorder(surface, active);
  const shadow = resolveElementShadow({
    active,
    shadow: surface.shadow ?? undefined,
    activeShadow: surface.activeShadow ?? undefined,
    defaultShadow: DEFAULT_ELEMENT_SHADOW_SPEC,
    defaultActiveShadow: DEFAULT_ELEMENT_ACTIVE_SHADOW_SPEC,
  });
  const ring = border.gradient && border.width > 0 ? border.gradient : null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
        borderRadius: `${surface.borderRadius ?? DEFAULT_ELEMENT_RADIUS}px`,
        background: background.gradient
          ? gradientToCss(background.gradient)
          : background.color ||
            (active ? DEFAULT_ELEMENT_ACTIVE_BG : DEFAULT_ELEMENT_BG),
        border: ring ? undefined : `${border.width}px solid ${border.color}`,
        boxShadow: elementShadowToCss(shadow),
      }}
    >
      {ring ? (
        <span
          aria-hidden="true"
          data-gradient-border-ring="true"
          style={{
            ...gradientRingStyle(ring, border.width),
            ...(useInlineStyles ? { background: gradientToCss(ring) } : {}),
          }}
        />
      ) : null}
      {children}
    </div>
  );
};

export default ElementSurface;
