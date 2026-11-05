/**
 * 키에 붙은 플러그인 요소의 표시 위치
 * 트리의 그 키 위치(정규형 슬롯으로 찾는다) + 앵커 오프셋 + 창 오프셋
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { I18nContext } from '@contexts/I18nContextDef';
import { PluginElement } from '@components/shared/plugin/PluginElement';
import { useKeyStore } from '@stores/data/useKeyStore';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';

const tree = vi.hoisted(() => ({ scene: null as unknown }));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getScene: () => tree.scene,
    getElement: () => undefined,
  }),
  useElementDocumentScene: () => tree.scene,
  useDocumentElement: () => undefined,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const keyNode = (id: string, slot: unknown, x: number, y: number) => ({
  type: 'element',
  id,
  kind: 'key',
  frame: { x, y, width: 60, height: 60, rotation: 0 },
  input: { type: 'key', slot },
});

const anchored = (keyCode: string): PluginDisplayElementInternal =>
  ({
    id: 'instance',
    fullId: 'plugin-a::instance',
    pluginId: 'plugin-a',
    html: '<span>x</span>',
    position: { x: 5, y: 6 },
    anchor: { keyCode, offset: { x: 4, y: -2 } },
  } as unknown as PluginDisplayElementInternal);

describe('키에 붙은 플러그인 요소', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useKeyStore.setState({ selectedKeyType: '4key' });
    tree.scene = {
      nodes: [
        keyNode('k1', 'KeyA', 100, 200),
        {
          type: 'group',
          id: 'g1',
          children: [
            keyNode('k2', { keys: ['KeyB', 'KeyC'], match: 'any' }, 300, 50),
          ],
        },
      ],
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderAnchored = (element: PluginDisplayElementInternal) =>
    act(() =>
      root.render(
        <I18nContext.Provider
          value={{ locale: 'ko', setLocale: async () => {}, t: (key) => key }}
        >
          <PluginElement
            element={element}
            windowType="overlay"
            positionOffset={{ x: 10, y: 20 }}
          />
        </I18nContext.Provider>,
      ),
    );
  const transformOf = () =>
    (
      container.querySelector(
        '[data-plugin-element="plugin-a::instance"]',
      ) as HTMLElement
    ).style.transform;

  it('그 키 위치 + 앵커 오프셋 + 창 오프셋 - 그룹 안 여러 키 슬롯도 정규형으로 찾는다', () => {
    renderAnchored(anchored('KeyA'));
    expect(transformOf()).toBe('translate3d(114px, 218px, 0)');
    renderAnchored(anchored('KeyB|KeyC'));
    expect(transformOf()).toBe('translate3d(314px, 68px, 0)');
  });

  it('앵커 키가 탭에 없으면 자기 위치', () => {
    renderAnchored(anchored('KeyZ'));
    expect(transformOf()).toBe('translate3d(15px, 26px, 0)');
  });
});
