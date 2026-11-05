// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import type { KeyPosition } from '@src/types/key/keys';
import { aggregateMixedValue } from '../mixedValue';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 색 칸이 받은 값만 본다 (칸 순서: 배경색, 테두리 색)
const colorProps = vi.hoisted(() => [] as Array<{ gradientValue?: unknown }>);
vi.mock('../../controls/PropertyInputs', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ColorInput: (props: { gradientValue?: unknown }) => {
    colorProps.push(props);
    return null;
  },
}));

const { BatchSurfaceRows } = await import('./BatchSurfaceRows');

// 이미지가 표면을 대신하고 테두리를 정하지 않은 두 요소
const keyLike = {
  id: 'key-1',
  inactiveImage: 'a.png',
  imageMode: 'replace',
} as unknown as KeyPosition;
const knobLike = { ...keyLike, id: 'knob-1' } as KeyPosition;

// 첫 요소(노브)의 테두리 - 기본 립을 그리면 기본 그라데이션, 가리면 없음
const borderGradientOfFirst = (
  imageSuppressesDefaultBorder: boolean | ((position: KeyPosition) => boolean),
) => {
  colorProps.length = 0;
  const host = document.createElement('div');
  const root = createRoot(host);
  const positions = [knobLike, keyLike];
  const getMixedValue = <T,>(
    getter: (position: KeyPosition) => T | undefined,
    defaultValue: T,
  ) => aggregateMixedValue(positions, getter, defaultValue);
  act(() => {
    root.render(
      <BatchSurfaceRows
        getMixedValue={getMixedValue}
        activeMixedValue={getMixedValue}
        effectiveColorState="idle"
        showStateTabs={false}
        onStateModeChange={() => {}}
        imageSuppressesDefaultBorder={imageSuppressesDefaultBorder}
        batchSelectionKey="test"
        panelElement={null}
        t={(key) => key}
      />,
    );
  });
  act(() => root.unmount());
  return colorProps[1]?.gradientValue ?? null;
};

describe('일괄 겉모습 칸의 기본 테두리', () => {
  it('이미지가 기본 테두리를 가리는지는 요소마다 - 키는 가리고 노브는 그대로 그린다', () => {
    // 일괄 전체를 키처럼 보면 노브의 기본 립도 가린 것으로 읽는다
    expect(borderGradientOfFirst(true)).toBeNull();
    // 요소마다 보면 노브는 그리는 그대로 기본 립
    expect(
      borderGradientOfFirst((position) => position.id === 'key-1'),
    ).not.toBeNull();
  });
});
