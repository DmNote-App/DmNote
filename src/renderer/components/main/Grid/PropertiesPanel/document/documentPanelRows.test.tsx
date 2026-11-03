// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const captured = vi.hoisted(() => ({
  props: null as null | {
    value: number;
    onChange: (value: number) => void;
    onPreview?: (value: number) => void;
  },
}));

vi.mock('@components/main/common/numberInput/NumberInput', () => ({
  NumberInput: (props: NonNullable<typeof captured.props>) => {
    captured.props = props;
    return null;
  },
  OptionalNumberInput: () => null,
}));

const { FieldRow } = await import('./documentPanelRows');

// 입력 중 값을 패널에만 두는 숫자 칸(노브 민감도)
const row = {
  field: 'sensitivity',
  label: 'sensitivity',
  control: {
    type: 'number',
    min: 0,
    max: 100,
    decimalScale: 2,
    suffix: '×',
    draft: true,
  },
} as never;

describe('선언 패널 숫자 칸의 입력 중 값', () => {
  let host: HTMLDivElement;
  let root: Root;
  const onCommit = vi.fn();

  const render = (value: number, elementId = 'knob-1') =>
    act(() =>
      root.render(
        <FieldRow
          row={row}
          state={{ value, isMixed: false }}
          onCommit={onCommit}
          elementIds={[elementId]}
          panelElement={null}
          t={(key: string) => key}
        />,
      ),
    );
  const shown = () => captured.props!.value;

  beforeEach(() => {
    onCommit.mockClear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('커밋이 착지하기 전에는 입력한 값을 보인다', () => {
    render(1);
    act(() => captured.props!.onChange(2));

    expect(onCommit).toHaveBeenCalledWith(2);
    expect(shown()).toBe(2);
  });

  it('착지한 뒤 되돌리기로 값이 돌아오면 묵은 입력 값을 다시 보이지 않는다', () => {
    render(1);
    act(() => captured.props!.onChange(2));
    render(2);
    expect(shown()).toBe(2);

    render(1);

    expect(shown()).toBe(1);
  });

  it('다른 요소로 바뀌었다 돌아와도 앞 입력 값이 남지 않는다', () => {
    render(1);
    act(() => captured.props!.onPreview?.(5));
    expect(shown()).toBe(5);

    render(1, 'knob-2');
    expect(shown()).toBe(1);
    render(1);

    expect(shown()).toBe(1);
  });
});
