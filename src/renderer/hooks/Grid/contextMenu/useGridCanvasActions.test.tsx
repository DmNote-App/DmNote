import React, { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const core = vi.hoisted(() => ({
  addStatAt: vi.fn((_mode: string, _position: unknown) =>
    Promise.resolve(true),
  ),
  addKeyAt: vi.fn((_mode: string, _dx: number, _dy: number) =>
    Promise.resolve(true),
  ),
  addGraphAt: vi.fn((_mode: string, _position: unknown) =>
    Promise.resolve(true),
  ),
  addKnobAt: vi.fn((_mode: string, _position: unknown) =>
    Promise.resolve(true),
  ),
  addSpriteAt: vi.fn((_mode: string, _position: unknown) =>
    Promise.resolve(true),
  ),
}));

vi.mock('@src/renderer/editor/runtime/operations/elementOps', () => core);

import { createDefaultKeyPosition } from '@src/renderer/editor/model/keys';
import {
  addCanvasElementAt,
  useGridCanvasActions,
  type CanvasActions,
} from './useGridCanvasActions';
import { useGraphItemStore } from '@stores/data/useGraphItemStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useKnobItemStore } from '@stores/data/useKnobItemStore';
import { useSpriteStore } from '@stores/data/useSpriteStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { useStatItemStore } from '@stores/data/useStatItemStore';
import {
  CENTER_SPRITE_ANCHOR,
  DEFAULT_SPRITE_TRANSITION_EASING,
  DEFAULT_SPRITE_TRANSITION_MS,
  IDENTITY_SPRITE_TRANSFORM,
  type ReactiveSpritePosition,
} from '@src/types/key/sprites';

describe('useGridCanvasActions create', () => {
  let container: HTMLDivElement;
  let root: Root;
  let actions: CanvasActions;

  const Harness = () => {
    const value = useGridCanvasActions('4key');
    useLayoutEffect(() => {
      actions = value;
    }, [value]);
    return null;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useKeyStore.setState({
      canonicalPositions: {
        '4key': [{ ...createDefaultKeyPosition(), zIndex: 30 }],
      },
      positions: { '4key': [{ ...createDefaultKeyPosition(), zIndex: 30 }] },
    });
    useStatItemStore.setState({ positions: { '4key': [] } });
    useGraphItemStore.setState({ positions: { '4key': [] } });
    useKnobItemStore.setState({ positions: { '4key': [] } });
    useSpriteStore.setState({ positions: { '4key': [] } });
    usePluginDisplayElementStore.setState({
      elements: [
        {
          fullId: 'plugin:element:one',
          pluginId: 'plugin',
          id: 'element',
          type: 'text',
          tabId: '4key',
          zIndex: 40,
          position: { x: 0, y: 0 },
          size: { width: 10, height: 10 },
        } as never,
      ],
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('add 4종은 기존 기본 payload와 zIndex 부재를 frozen helper에 전달한다', () => {
    act(() => {
      actions.addKeyAtPosition(7, 8);
      actions.addItemAtPosition('stat', 1, 2);
      actions.addItemAtPosition('graph', 3, 4);
      actions.addItemAtPosition('knob', 5, 6);
    });

    expect(core.addKeyAt).toHaveBeenCalledWith('4key', 7, 8);
    expect(core.addStatAt).toHaveBeenCalledWith(
      '4key',
      expect.objectContaining({ statType: 'kps', dx: 1, dy: 2 }),
    );
    expect(core.addGraphAt).toHaveBeenCalledWith(
      '4key',
      expect.objectContaining({
        graphType: 'line',
        graphSpeed: 1000,
        dx: 3,
        dy: 4,
      }),
    );
    expect(core.addKnobAt).toHaveBeenCalledWith(
      '4key',
      expect.objectContaining({ sensitivity: 1, dx: 5, dy: 6 }),
    );
    for (const mock of [core.addStatAt, core.addGraphAt, core.addKnobAt]) {
      expect(mock.mock.calls[0][1]).not.toHaveProperty('zIndex');
    }
  });

  it('addSpriteAtPosition은 기본값 계약과 id 선발급을 고정한다', () => {
    act(() => {
      actions.addItemAtPosition('sprite', 11, 22);
    });

    expect(core.addSpriteAt).toHaveBeenCalledTimes(1);
    const [mode, payload] = core.addSpriteAt.mock.calls[0] as [
      string,
      ReactiveSpritePosition & { id: string },
    ];
    expect(mode).toBe('4key');
    expect(typeof payload.id).toBe('string');
    expect(payload.id.length).toBeGreaterThan(0);
    expect(payload).toMatchObject({
      dx: 11,
      dy: 22,
      width: 200,
      height: 200,
      hidden: false,
      zIndex: null,
      className: null,
      useInlineStyles: null,
      baseImage: null,
      pivot: CENTER_SPRITE_ANCHOR,
      idleTransform: IDENTITY_SPRITE_TRANSFORM,
      poses: [],
      transitionMs: DEFAULT_SPRITE_TRANSITION_MS,
      transitionEasing: DEFAULT_SPRITE_TRANSITION_EASING,
      referenceNaturalSize: null,
    });
    // wire 정규화 계약: nullish layerName·groupId는 키 부재
    expect(payload).not.toHaveProperty('layerName');
    expect(payload).not.toHaveProperty('groupId');
  });

  it('Grid 공용 add routing은 다섯 타입을 정확히 한 handler로 보낸다', () => {
    act(() => {
      (['key', 'stat', 'graph', 'knob', 'sprite'] as const).forEach(
        (type, index) => addCanvasElementAt(actions, type, index, index + 10),
      );
    });

    expect(core.addKeyAt).toHaveBeenCalledTimes(1);
    expect(core.addStatAt).toHaveBeenCalledTimes(1);
    expect(core.addGraphAt).toHaveBeenCalledTimes(1);
    expect(core.addKnobAt).toHaveBeenCalledTimes(1);
    expect(core.addSpriteAt).toHaveBeenCalledTimes(1);
  });
});
