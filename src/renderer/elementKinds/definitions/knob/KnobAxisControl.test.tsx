// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  axisListener: null as null | ((event: { axisId: string }) => void),
  patchAxis: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@utils/input/axisEventBus', () => ({
  axisEventBus: {
    initialize: vi.fn(),
    subscribe: (listener: (event: { axisId: string }) => void) => {
      mocks.axisListener = listener;
      return () => {
        if (mocks.axisListener === listener) mocks.axisListener = null;
      };
    },
  },
}));
vi.mock('@src/renderer/editor/runtime/operations/elementOps', () => ({
  patchKnobAxisIdById: mocks.patchAxis,
}));
vi.mock('@contexts/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { default: KnobAxisControl } = await import('./KnobAxisControl');
const { stopKnobAxisCapture } = await import('./knobAxisCapture');

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// 노브 축 감지 - 옛 노브 패널의 "시작한 노브에 묶는" 감지 계약
describe('노브 축 매핑', () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (id = A, axisId = 'HIDA:test') => {
    act(() => {
      root.render(
        <KnobAxisControl value={axisId} onCommit={vi.fn()} elementIds={[id]} />,
      );
    });
  };
  const button = () => container.querySelector('button')!;
  const emitAxis = (axisId: string) => {
    act(() => mocks.axisListener?.({ axisId }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.axisListener = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    act(() => stopKnobAxisCapture());
  });

  it('휠 가상 축은 로케일 이름, HID 축은 접두어를 뗀 ID로 표시한다', () => {
    render(A, 'WHEEL:VERTICAL');
    expect(button().textContent).toBe('propertiesPanel.knobAxisWheelVertical');
    render(A, 'WHEEL:HORIZONTAL');
    expect(button().textContent).toBe(
      'propertiesPanel.knobAxisWheelHorizontal',
    );
    render(A, 'HIDA:1ccf:101c:1:48');
    expect(button().textContent).toBe('1ccf:101c:1:48');
    expect(button().getAttribute('title')).toBe('HIDA:1ccf:101c:1:48');
    render(A, '');
    expect(button().textContent).toBe('propertiesPanel.knobCapture');
  });

  it('감지는 고른 노브가 바뀌어도 시작한 노브에 쓰고, 바뀐 노브 칸에는 감지 중을 보이지 않는다', () => {
    render(A);
    act(() => button().click());
    expect(button().textContent).toBe('propertiesPanel.knobCapturing');

    render(B);
    expect(button().textContent).not.toBe('propertiesPanel.knobCapturing');
    emitAxis('  HIDA:raw  ');
    emitAxis('  HIDA:raw  ');
    emitAxis('  HIDA:raw  ');

    expect(mocks.patchAxis).toHaveBeenCalledExactlyOnceWith(A, '  HIDA:raw  ');
  });

  it('다른 노브의 남은 감지는 첫 클릭이 취소가 아니라 이 노브로 옮긴다', () => {
    render(A);
    act(() => button().click());
    render(B);

    act(() => button().click());

    expect(button().textContent).toBe('propertiesPanel.knobCapturing');
    emitAxis('HIDA:moved');
    emitAxis('HIDA:moved');
    emitAxis('HIDA:moved');
    expect(mocks.patchAxis).toHaveBeenCalledExactlyOnceWith(B, 'HIDA:moved');
  });

  it('같은 노브면 감지를 이어 가고, 다시 누르면 끝낸다', () => {
    render(A);
    act(() => button().click());
    render(A);
    expect(button().textContent).toBe('propertiesPanel.knobCapturing');

    act(() => button().click());
    expect(button().textContent).not.toBe('propertiesPanel.knobCapturing');
    emitAxis('HIDA:late');
    emitAxis('HIDA:late');
    emitAxis('HIDA:late');
    expect(mocks.patchAxis).not.toHaveBeenCalled();
  });

  it('옛 모양 id가 아닌 노브는 감지를 시작하지 않는다', () => {
    render('knob-4');
    act(() => button().click());
    emitAxis('HIDA:legacy');
    emitAxis('HIDA:legacy');
    emitAxis('HIDA:legacy');

    expect(button().textContent).not.toBe('propertiesPanel.knobCapturing');
    expect(mocks.patchAxis).not.toHaveBeenCalled();
  });

  it('노브 축 칸이 하나도 안 보이게 되면 감지를 끝낸다', async () => {
    render(A);
    act(() => button().click());

    act(() => root.unmount());
    await act(async () => {
      await Promise.resolve();
    });
    emitAxis('HIDA:gone');
    emitAxis('HIDA:gone');
    emitAxis('HIDA:gone');

    expect(mocks.patchAxis).not.toHaveBeenCalled();
    root = createRoot(container);
  });

  it('감지가 끝나면 감지 중 표시가 사라진다', () => {
    render(A);
    act(() => button().click());
    emitAxis('HIDA:done');
    emitAxis('HIDA:done');
    emitAxis('HIDA:done');

    expect(mocks.patchAxis).toHaveBeenCalledExactlyOnceWith(A, 'HIDA:done');
    expect(button().textContent).not.toBe('propertiesPanel.knobCapturing');
  });
});
