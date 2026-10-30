import React, { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 새 요소는 트리에 넣는다 - 넣기 입구에 생성 기본값(옛 위치 모양)을 넘기는지 본다
const core = vi.hoisted(() => ({
  insert: vi.fn(
    (_scene: string, _kind: string, _position: unknown, _slot?: unknown) =>
      Promise.resolve('new-id'),
  ),
}));

vi.mock('@components/main/Grid/document/documentEditActions', () => ({
  insertLegacyShapedElement: core.insert,
}));

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

  it('키와 키 외 종류는 생성 기본값을 트리 넣기 입구로 보낸다 (키는 빈 슬롯, zIndex 없음)', () => {
    act(() => {
      actions.addKeyAtPosition(7, 8);
      actions.addItemAtPosition('stat', 1, 2);
      actions.addItemAtPosition('graph', 3, 4);
      actions.addItemAtPosition('knob', 5, 6);
    });

    expect(core.insert).toHaveBeenNthCalledWith(
      1,
      '4key',
      'key',
      expect.objectContaining({ dx: 7, dy: 8 }),
      '',
    );
    expect(core.insert).toHaveBeenNthCalledWith(
      2,
      '4key',
      'stat',
      expect.objectContaining({ statType: 'kps', dx: 1, dy: 2 }),
    );
    expect(core.insert).toHaveBeenNthCalledWith(
      3,
      '4key',
      'graph',
      expect.objectContaining({
        graphType: 'line',
        graphSpeed: 1000,
        dx: 3,
        dy: 4,
      }),
    );
    expect(core.insert).toHaveBeenNthCalledWith(
      4,
      '4key',
      'knob',
      expect.objectContaining({ sensitivity: 1, dx: 5, dy: 6 }),
    );
    for (const call of core.insert.mock.calls.slice(1)) {
      expect(call[2]).not.toHaveProperty('zIndex');
    }
  });

  it('addSpriteAtPosition은 기본값 계약과 id 선발급을 고정한다', () => {
    act(() => {
      actions.addItemAtPosition('sprite', 11, 22);
    });

    expect(core.insert).toHaveBeenCalledTimes(1);
    const [mode, kind, payload] = core.insert.mock.calls[0] as unknown as [
      string,
      string,
      ReactiveSpritePosition & { id: string },
    ];
    expect(mode).toBe('4key');
    expect(kind).toBe('sprite');
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

    expect(core.insert.mock.calls.map((call) => call[1])).toEqual([
      'key',
      'stat',
      'graph',
      'knob',
      'sprite',
    ]);
  });
});
