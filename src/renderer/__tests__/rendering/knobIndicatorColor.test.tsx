/**
 * 노브 회전 인식 막대 색 계약
 * - 명시 단색 보더만 막대 색을 겸한다. 그라데이션 보더(패널 기본 립을 그대로 커밋한 경우
 *   포함)의 대표 첫 스톱은 막대 색이 아니므로 텍스트 색 계열로 남는다
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import KnobElementFace from '@src/renderer/elementKinds/definitions/knob/KnobElementFace';
import { resetAllAxisSignals } from '@stores/signals/axisSignals';
import {
  DEFAULT_ELEMENT_BORDER,
  DEFAULT_ELEMENT_BORDER_GRADIENT,
  DEFAULT_ELEMENT_FONT,
} from '@utils/element/elementDefaults';

const element = {
  type: 'element',
  id: 'knob-1',
  kind: 'knob',
  frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
  input: { type: 'axis', axisId: 'axis-indicator-test' },
} as ElementNode;

// 편집 화면과 오버레이가 같은 그리기를 쓴다
describe.each([
  ['오버레이', true],
  ['편집 화면', false],
] as const)('노브 인디케이터 색 (%s)', (_, live) => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    resetAllAxisSignals();
  });

  const indicatorColorFor = (border: Record<string, unknown>) => {
    act(() => {
      root.render(
        <KnobElementFace
          element={element}
          values={{ sensitivity: 1, reverse: false }}
          bundles={{ surface: border }}
          live={live}
          inputs={{}}
          placement={live ? { x: 0, y: 0, zIndex: 0 } : undefined}
        />,
      );
    });
    return host
      .querySelector<HTMLElement>('[data-knob-element="true"]')!
      .style.getPropertyValue('--dmn-knob-indicator-default');
  };

  it('미지정이면 텍스트 색 계열', () => {
    expect(indicatorColorFor({})).toBe(DEFAULT_ELEMENT_FONT);
  });

  it('패널이 보여준 기본 립을 그대로 커밋해도 막대가 사라지지 않는다', () => {
    expect(
      indicatorColorFor({
        borderColor: DEFAULT_ELEMENT_BORDER,
        borderGradient: DEFAULT_ELEMENT_BORDER_GRADIENT,
      }),
    ).toBe(DEFAULT_ELEMENT_FONT);
  });

  it('명시 단색 보더는 막대 색을 겸한다', () => {
    expect(indicatorColorFor({ borderColor: '#ff0000' })).toBe('#ff0000');
  });
});
