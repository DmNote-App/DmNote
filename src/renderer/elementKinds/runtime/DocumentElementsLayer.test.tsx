import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import type { Scene } from '@src/types/generated/elementDocument';

const scene: Scene = {
  nodes: [
    {
      type: 'element',
      id: 'k1',
      kind: 'key',
      frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
      legacy: { index: 0, zIndex: 3 },
    },
    {
      type: 'element',
      id: 'n1',
      kind: 'knob',
      frame: { x: 10, y: 20, width: 80, height: 70, rotation: 15 },
      values: { sensitivity: 2, reverse: true },
      bundles: { surface: { borderRadius: 12 } },
      input: { type: 'axis', axisId: 'axis-1' },
      legacy: { index: 0, zIndex: 4 },
    },
  ],
};

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  loadElementDocumentStore: () => Promise.resolve(),
  useElementDocumentScene: () => scene,
}));

const knobProps = vi.fn();
vi.mock('@components/overlay/counters/OverlayKnobItem', () => ({
  default: (props: { position: Record<string, unknown> }) => {
    knobProps(props.position);
    return <div data-knob-element="" />;
  },
}));

const { default: DocumentElementsLayer } = await import(
  './DocumentElementsLayer'
);

describe('오버레이가 트리에서 그리는 옛 종류', () => {
  it('노브는 옛 위치 객체로 한 번 그리고 창 오프셋을 더한다', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <>
          <DocumentElementsLayer
            sceneId="4key"
            placement="bottom"
            live
            inputs={{}}
            offset={{ x: 5, y: 7 }}
          />
          <DocumentElementsLayer
            sceneId="4key"
            placement="stacked"
            live
            inputs={{}}
            offset={{ x: 5, y: 7 }}
          />
        </>,
      );
    });
    expect(container.querySelectorAll('[data-knob-element]')).toHaveLength(1);
    expect(knobProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'n1',
        dx: 15,
        dy: 27,
        width: 80,
        height: 70,
        rotation: 15,
        sensitivity: 2,
        reverse: true,
        borderRadius: 12,
        axisId: 'axis-1',
        zIndex: 4,
      }),
    );
    act(() => root.unmount());
  });
});
