/**
 * 플러그인 요소 캔버스 클릭 배선 테스트
 * 그룹 멤버 클릭이 native 클릭과 같은 그룹 확장 선택으로 이어지는지 검증
 */
import React, { act } from 'react';
import { useLegacyKeyArrays } from '@src/renderer/__tests__/legacyStores/useLegacyKeyArrays';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { I18nContext } from '@contexts/I18nContextDef';
import { PluginElement } from '@components/shared/plugin/PluginElement';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useStatItemStore } from '@src/renderer/__tests__/legacyStores/useStatItemStore';
import { useGraphItemStore } from '@src/renderer/__tests__/legacyStores/useGraphItemStore';
import { useKnobItemStore } from '@src/renderer/__tests__/legacyStores/useKnobItemStore';
import { useLayerGroupStore } from '@src/renderer/__tests__/legacyStores/useLayerGroupStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useDocumentSelectionStore } from '@components/main/Grid/document/useDocumentSelectionStore';
import { usePropertiesPanelStore } from '@stores/grid/usePropertiesPanelStore';
import { createDefaultKeyPosition } from '@src/renderer/editor/model/keys';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';

// 키를 옛 종류 대표로 쓴다
vi.mock('@src/types/elementKinds', async (importOriginal) =>
  (await import('@src/renderer/__tests__/legacyKeyKinds')).keepKeyLegacy(
    importOriginal,
  ),
);

// 그룹째 고르기는 장면 트리의 가장 바깥 그룹 - 트리 문서를 목으로
const tree = vi.hoisted(() => ({ scene: null as unknown }));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => {
  const find = (nodes: Array<Record<string, unknown>>, id: string): unknown => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (Array.isArray(node.children)) {
        const inner = find(node.children as never, id);
        if (inner) return inner;
      }
    }
    return undefined;
  };
  return {
    getElementDocumentStore: () => ({
      getScene: () => tree.scene,
      getElement: (_scene: string, id: string) =>
        find((tree.scene as { nodes: never }).nodes, id),
    }),
    useElementDocumentScene: () => tree.scene,
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const GROUP_ID = 'group-1';
const KEY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLUGIN_FULL_ID = 'plugin-a::11111111-1111-4111-8111-111111111111';

const makePluginElement = (groupId?: string): PluginDisplayElementInternal =>
  ({
    id: PLUGIN_FULL_ID.split('::')[1],
    fullId: PLUGIN_FULL_ID,
    pluginId: 'plugin-a',
    position: { x: 10, y: 10 },
    tabId: '4key',
    groupId,
  } as unknown as PluginDisplayElementInternal);

const seedStores = (options: {
  pluginGroupId?: string;
  groupDefExists?: boolean;
}) => {
  const keyPosition = {
    ...createDefaultKeyPosition(),
    id: KEY_ID,
    groupId: GROUP_ID,
  };
  useKeyStore.setState({ selectedKeyType: '4key' });
  useLegacyKeyArrays.setState({
    positions: { '4key': [keyPosition] },
    canonicalPositions: { '4key': [keyPosition] },
  });
  useStatItemStore.setState({ positions: {} });
  useGraphItemStore.setState({ positions: {} });
  useKnobItemStore.setState({ positions: {} });
  useLayerGroupStore.setState({
    layerGroups:
      options.groupDefExists === false
        ? {}
        : { '4key': [{ id: GROUP_ID, name: 'Group' }] },
  });
  usePluginDisplayElementStore.setState({
    elements: [makePluginElement(options.pluginGroupId)],
  });
  useGridSelectionStore.setState({
    selectedElements: [],
    selectedGroupIds: [],
    lastSelectedKeyBounds: null,
  });
  usePropertiesPanelStore.setState({ isCanvasPanelOpen: false });
  const frame = { x: 0, y: 0, width: 10, height: 10, rotation: 0 };
  const keyNode = { type: 'element', id: KEY_ID, kind: 'key', frame };
  const pluginNode = {
    type: 'element',
    id: PLUGIN_FULL_ID,
    kind: 'plugin:plugin-a',
    frame,
  };
  tree.scene = {
    nodes:
      options.pluginGroupId && options.groupDefExists !== false
        ? [
            {
              type: 'group',
              id: GROUP_ID,
              name: 'Group',
              legacy: {},
              children: [keyNode, pluginNode],
            },
          ]
        : [keyNode, pluginNode],
  };
};

let container: HTMLDivElement;
let root: Root;

const renderElement = () => {
  const element = usePluginDisplayElementStore.getState().elements[0];
  act(() => {
    root.render(
      <I18nContext.Provider
        value={{ locale: 'ko', setLocale: async () => {}, t: (key) => key }}
      >
        <PluginElement element={element} windowType="main" />
      </I18nContext.Provider>,
    );
  });
  return container.querySelector(
    `[data-plugin-element="${PLUGIN_FULL_ID}"]`,
  ) as HTMLElement;
};

const fireMouse = (
  node: HTMLElement,
  type: string,
  init: MouseEventInit = {},
) => {
  act(() => {
    node.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, ...init }),
    );
  });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('플러그인 요소 그룹 클릭 배선', () => {
  it('그룹 멤버 클릭은 native 멤버까지 전체 선택한다', () => {
    seedStores({ pluginGroupId: GROUP_ID });
    const node = renderElement();

    fireMouse(node, 'click');

    // 플러그인 요소는 옛 선택, 키는 트리 선택
    expect(useGridSelectionStore.getState().selectedElements).toEqual([
      { type: 'plugin', id: PLUGIN_FULL_ID },
    ]);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([KEY_ID]);
  });

  it('비그룹 플러그인 클릭은 단일 선택을 유지한다', () => {
    seedStores({ pluginGroupId: undefined });
    const node = renderElement();

    fireMouse(node, 'click');

    expect(useGridSelectionStore.getState().selectedElements).toEqual([
      { type: 'plugin', id: PLUGIN_FULL_ID },
    ]);
  });

  it('그룹 노드가 없는 dangling groupId는 확장하지 않는다', () => {
    seedStores({ pluginGroupId: GROUP_ID, groupDefExists: false });
    const node = renderElement();

    fireMouse(node, 'click');

    expect(useGridSelectionStore.getState().selectedElements).toEqual([
      { type: 'plugin', id: PLUGIN_FULL_ID },
    ]);
  });

  it('수식키 클릭은 그룹 확장 없이 단일 토글로 남는다', () => {
    seedStores({ pluginGroupId: GROUP_ID });
    const node = renderElement();

    fireMouse(node, 'click', { ctrlKey: true });

    expect(useGridSelectionStore.getState().selectedElements).toEqual([
      { type: 'plugin', id: PLUGIN_FULL_ID },
    ]);
  });

  it('더블클릭 편집 진입도 그룹 전체를 선택한다', () => {
    seedStores({ pluginGroupId: GROUP_ID });
    const node = renderElement();

    fireMouse(node, 'dblclick');

    expect(useGridSelectionStore.getState().selectedElements).toEqual([
      { type: 'plugin', id: PLUGIN_FULL_ID },
    ]);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([KEY_ID]);
    expect(usePropertiesPanelStore.getState().isCanvasPanelOpen).toBe(true);
  });
});
