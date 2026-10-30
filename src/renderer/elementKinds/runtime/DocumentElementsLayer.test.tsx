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
      input: { type: 'key', slot: 'KeyA' },
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
    {
      type: 'element',
      id: 'g1',
      kind: 'graph',
      frame: { x: 0, y: 100, width: 200, height: 100, rotation: 0 },
      values: { statType: 'kpsAvg', graphType: 'bar', graphSpeed: 2000 },
      legacy: { index: 0, zIndex: 2 },
    },
    {
      type: 'element',
      id: 's1',
      kind: 'stat',
      frame: { x: 0, y: 220, width: 60, height: 60, rotation: 0 },
      values: { statType: 'total', displayText: '합계', count: 0 },
      bundles: { font: { fontSize: 18 } },
      legacy: { index: 0, zIndex: 1 },
    },
    {
      type: 'element',
      id: 'p1',
      kind: 'sprite',
      frame: { x: 30, y: 300, width: 200, height: 150, rotation: 0 },
      values: { baseImage: 'base.png', poses: [], transitionMs: 120 },
      legacy: { index: 0, zIndex: 6 },
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

const graphProps = vi.fn();
vi.mock('@components/overlay/counters/OverlayGraphItem', () => ({
  default: (props: { position: Record<string, unknown> }) => {
    graphProps(props.position);
    return <div data-graph-element="" />;
  },
}));

const statProps = vi.fn();
vi.mock('@components/overlay/counters/OverlayStatItem', () => ({
  default: (props: { position: Record<string, unknown> }) => {
    statProps(props.position);
    return <div data-stat-element="" />;
  },
}));

const spriteProps = vi.fn();
vi.mock('@components/overlay/counters/OverlaySpriteItem', () => ({
  default: (props: {
    position: Record<string, unknown>;
    keyCanonicalMap: ReadonlyMap<string, string>;
  }) => {
    spriteProps(props);
    return <div data-sprite-element="" />;
  },
}));

const keyProps = vi.fn();
vi.mock('@components/shared/key/LiveKey', () => ({
  Key: (props: Record<string, unknown>) => {
    keyProps(props);
    return <div data-key-element="" />;
  },
}));

const { default: DocumentElementsLayer } = await import(
  './DocumentElementsLayer'
);

describe('오버레이가 트리에서 그리는 옛 종류', () => {
  it('키·노브·그래프·스탯·스프라이트는 옛 위치 객체로 한 번 그리고 창 오프셋을 더한다', () => {
    const overlayContext = {
      spriteKeyCanonicalMap: new Map([['k1', 'KeyA']]),
      mode: '4key',
      keyCounterEnabled: true,
    };
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
            overlayContext={overlayContext}
          />
          <DocumentElementsLayer
            sceneId="4key"
            placement="stacked"
            live
            inputs={{}}
            offset={{ x: 5, y: 7 }}
            overlayContext={overlayContext}
          />
        </>,
      );
    });
    // 키 이름·입력은 트리 입력 슬롯에서
    expect(container.querySelectorAll('[data-key-element]')).toHaveLength(1);
    expect(keyProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        globalKey: 'KeyA',
        mode: '4key',
        counterEnabled: true,
        position: expect.objectContaining({
          id: 'k1',
          dx: 5,
          dy: 7,
          zIndex: 3,
        }),
      }),
    );
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
    expect(container.querySelectorAll('[data-graph-element]')).toHaveLength(1);
    expect(graphProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'g1',
        dx: 5,
        dy: 107,
        statType: 'kpsAvg',
        graphType: 'bar',
        graphSpeed: 2000,
        zIndex: 2,
      }),
    );
    expect(container.querySelectorAll('[data-stat-element]')).toHaveLength(1);
    expect(statProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 's1',
        dy: 227,
        statType: 'total',
        displayText: '합계',
        fontSize: 18,
        zIndex: 1,
      }),
    );
    expect(container.querySelectorAll('[data-sprite-element]')).toHaveLength(1);
    expect(spriteProps).toHaveBeenLastCalledWith({
      position: expect.objectContaining({
        id: 'p1',
        dx: 35,
        dy: 307,
        width: 200,
        height: 150,
        baseImage: 'base.png',
        transitionMs: 120,
        zIndex: 6,
      }),
      keyCanonicalMap: overlayContext.spriteKeyCanonicalMap,
    });
    act(() => root.unmount());
  });

  it('창 오프셋이 새 객체여도 값이 같으면 요소를 다시 그리지 않는다', () => {
    const overlayContext = {
      spriteKeyCanonicalMap: new Map<string, string>(),
      mode: '4key',
      keyCounterEnabled: false,
    };
    const INPUTS = {};
    const container = document.createElement('div');
    const root = createRoot(container);
    const render = () =>
      act(() => {
        root.render(
          <DocumentElementsLayer
            sceneId="4key"
            placement="stacked"
            live
            inputs={INPUTS}
            offset={{ x: 5, y: 7 }}
            overlayContext={overlayContext}
          />,
        );
      });
    render();
    const calls = keyProps.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    render();
    expect(keyProps.mock.calls.length).toBe(calls);
    act(() => root.unmount());
  });
});
