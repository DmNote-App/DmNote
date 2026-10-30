import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useKeyStore } from '@stores/data/useKeyStore';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useDocumentSelectionStore } from '../../document/useDocumentSelectionStore';
import LayerTabContent from './LayerTabContent';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  scene: null as unknown,
  edit: vi.fn(() => Promise.resolve(null)),
  setCommon: vi.fn(() => Promise.resolve(null)),
  group: vi.fn(() => Promise.resolve(null)),
  pluginHidden: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  useElementDocumentScene: () => mocks.scene,
  getElementDocumentStore: () => ({
    getScene: () => mocks.scene,
    getElement: (_scene: string, id: string) => {
      let found: unknown;
      const visit = (nodes: Array<Record<string, unknown>>) => {
        for (const node of nodes) {
          if (node.id === id) found = node;
          if (Array.isArray(node.children)) visit(node.children as never);
        }
      };
      visit((mocks.scene as { nodes: never }).nodes);
      return found;
    },
  }),
}));

vi.mock('../../document/documentEditActions', () => ({
  editDocument: mocks.edit,
  setDocumentCommon: mocks.setCommon,
  groupDocumentElements: mocks.group,
  removeDocumentElements: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@plugins/runtime/displayElement/pluginElementActions', () => ({
  setPluginElementsHidden: mocks.pluginHidden,
}));

vi.mock('@utils/core/platform', () => ({ isMac: () => true }));
vi.mock('@components/main/Modal/listPopup/ListPopup', () => ({
  default: ({
    open,
    items,
    onSelect,
  }: {
    open: boolean;
    items: { id: string; label: string }[];
    onSelect: (id: string) => void;
  }) =>
    open ? (
      <div data-testid="layer-menu">
        {items.map((item) => (
          <button
            key={item.id}
            data-menu-item={item.id}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    ) : null,
}));
vi.mock('@hooks/useLenis', () => ({
  useLenis: () => ({
    scrollContainerRef: () => {},
    lenisInstance: { current: null },
  }),
}));
vi.mock('@contexts/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@assets/svgs/close_eye.svg', () => ({ default: () => null }));
vi.mock('@assets/svgs/open_eye.svg', () => ({ default: () => null }));

const element = (id: string, kind: string, extra = {}) => ({
  type: 'element',
  id,
  kind,
  frame: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
  ...extra,
});

describe('레이어 탭 - 장면 트리 하나', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.edit.mockClear();
    mocks.setCommon.mockClear();
    mocks.pluginHidden.mockClear();
    useKeyStore.setState({ selectedKeyType: '4key' });
    // 아래→위: k1, G{t1, p1}, t2
    mocks.scene = {
      nodes: [
        element('k1', 'key', { name: '왼손' }),
        {
          type: 'group',
          id: 'G',
          name: '그룹',
          legacy: {},
          children: [
            element('t1', 'cursorTracker'),
            element('demo::p1', 'plugin:demo'),
          ],
        },
        element('t2', 'cursorTracker'),
      ],
    };
    act(() => root.render(<LayerTabContent />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useDocumentSelectionStore.getState().clear();
    useGridSelectionStore.getState().clearSelection();
  });

  const rows = () => [
    ...container.querySelectorAll<HTMLElement>('[data-document-layer-index]'),
  ];
  const row = (id: string) =>
    rows().find(
      (node) =>
        node.dataset.documentLayerRow === id ||
        node.dataset.documentLayerGroup === id,
    )!;

  it('옛 종류·플러그인·트리 전용 요소와 그룹을 위→아래 겹침 순서로 보인다', () => {
    expect(
      rows().map(
        (node) =>
          node.dataset.documentLayerGroup ?? node.dataset.documentLayerRow,
      ),
    ).toEqual(['t2', 'G', 'demo::p1', 't1', 'k1']);
    expect(row('k1').textContent).toContain('왼손');
  });

  it('플러그인 행은 옛 선택, 나머지는 트리 선택으로 고른다', () => {
    act(() => row('demo::p1').click());
    expect(useGridSelectionStore.getState().selectedElements).toEqual([
      { type: 'plugin', id: 'demo::p1' },
    ]);
    act(() => row('t1').click());
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual(['t1']);
    expect(useGridSelectionStore.getState().selectedElements).toEqual([]);
    // 그룹 행 - 플러그인 멤버는 옛 선택으로 함께
    act(() => row('G').click());
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual(['t1']);
    expect(useGridSelectionStore.getState().selectedElements).toEqual([
      { type: 'plugin', id: 'demo::p1' },
    ]);
  });

  it('숨김 - 그룹은 트리 그룹 숨김, 플러그인은 플러그인 스토어, 나머지는 트리 공통 정보', () => {
    const eye = (id: string) =>
      row(id).querySelector<HTMLButtonElement>('button:last-of-type')!;
    act(() => eye('G').click());
    expect(mocks.edit).toHaveBeenCalledWith([
      { op: 'setGroup', scene: '4key', id: 'G', hidden: true },
    ]);
    act(() => eye('demo::p1').click());
    expect(mocks.pluginHidden).toHaveBeenCalledWith([
      { fullId: 'demo::p1', hidden: true },
    ]);
    act(() => eye('t2').click());
    expect(mocks.setCommon).toHaveBeenCalledWith('4key', 't2', {
      hidden: true,
    });
  });

  it('그룹에서 빼면 그 그룹 바로 위(그룹의 부모 안)로 옮긴다', async () => {
    act(() => {
      row('t1').dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      );
    });
    const item = document.body.querySelector<HTMLElement>(
      '[data-menu-item="removeFromGroup"]',
    );
    expect(item).not.toBeNull();
    await act(async () => {
      item!.click();
    });
    expect(mocks.edit).toHaveBeenCalledWith([
      {
        op: 'move',
        scene: '4key',
        ids: ['t1'],
        parent: null,
        index: 2,
      },
    ]);
  });
});
