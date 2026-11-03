import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Scene } from '@src/types/generated/elementDocument';
import type { GradientSpec } from '@src/types/color';

// 그리기를 한 벌로 옮긴 종류 - 편집 화면 감싸는 쪽이 편집 미리보기를 그리기 입력으로 넘긴다
const scene: Scene = {
  nodes: [
    {
      type: 'element',
      id: 'knob-1',
      kind: 'knob',
      frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
      values: { sensitivity: 1, reverse: false },
      bundles: { surface: { backgroundColor: '#111111' } },
    },
  ],
};

const faceProps = vi.fn();

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  loadElementDocumentStore: () => Promise.resolve(),
  useElementDocumentScene: () => scene,
  subscribeElementDocument: () => () => {},
  getElementDocumentStore: () => ({
    getScene: () => scene,
    getElement: () => scene.nodes[0],
  }),
}));
vi.mock('@contexts/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@src/renderer/elementKinds/definitions/knob/KnobElementFace', () => ({
  default: (props: Record<string, unknown>) => {
    faceProps(props);
    return null;
  },
}));

const { default: DocumentGridLayer } = await import('./DocumentGridLayer');
const { useEditStatePreviewStore } = await import(
  '@stores/grid/useEditStatePreviewStore'
);
const { useGradientEditStore } = await import(
  '@stores/grid/useGradientEditStore'
);
const { previewOverlay } = await import(
  '@src/renderer/editor/runtime/gesture/previewOverlay'
);

const spec = {
  type: 'linear',
  angle: 45,
  stops: [],
} as unknown as GradientSpec;

const render = () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(
      <DocumentGridLayer
        sceneId="4key"
        activeTool="move"
        placement="bottom"
        zoom={1}
        onElementContextMenu={() => undefined}
      />,
    );
  });
  return () => act(() => root.unmount());
};

const lastProps = () =>
  faceProps.mock.calls[faceProps.mock.calls.length - 1][0] as {
    values: Record<string, unknown>;
    bundles: { surface?: Record<string, unknown> };
    inputs: { pressed?: { value: boolean } };
  };

describe('편집 화면 감싸는 쪽의 미리보기 입력', () => {
  afterEach(() => {
    faceProps.mockClear();
    useEditStatePreviewStore.setState({ entries: [] });
    useGradientEditStore.setState({ session: null });
    previewOverlay.clearAll();
  });

  it('눌림 미리보기를 입력으로 넘긴다', () => {
    const unmount = render();
    expect(lastProps().inputs.pressed).toBeUndefined();
    act(() =>
      useEditStatePreviewStore
        .getState()
        .publish(1, { kind: 'knob', id: 'knob-1' }, 'active'),
    );
    expect(lastProps().inputs.pressed).toEqual({ value: true });
    unmount();
  });

  it('그라데이션 편집 세션을 묶음에 얹는다', () => {
    const unmount = render();
    act(() =>
      useGradientEditStore.setState({
        session: {
          anchor: { kind: 'knob', id: 'knob-1' },
          surface: 'background',
          stateMode: 'idle',
          spec,
        } as never,
      }),
    );
    expect(lastProps().bundles.surface).toEqual({
      backgroundColor: '#111111',
      backgroundGradient: spec,
      activeBackgroundGradient: spec,
    });
    unmount();
  });

  it('옛 패널 미리보기를 트리 값·묶음으로 얹는다', () => {
    const unmount = render();
    act(() => {
      previewOverlay.applyLocalPatchByIds(
        'session-1',
        '4key',
        ['knob-1'],
        { sensitivity: 3, backgroundColor: '#222222' },
        'knobPosition',
      );
    });
    expect(lastProps().values).toEqual({ sensitivity: 3, reverse: false });
    expect(lastProps().bundles.surface).toEqual({
      backgroundColor: '#222222',
    });
    unmount();
  });
});
