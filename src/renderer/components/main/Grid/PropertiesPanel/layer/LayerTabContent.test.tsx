import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useKeyStore } from '@stores/data/useKeyStore';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import LayerTabContent from './LayerTabContent';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  scene: null as unknown,
  edit: vi.fn(() => Promise.resolve(null)),
  setCommon: vi.fn(() => Promise.resolve(null)),
  group: vi.fn(() => Promise.resolve(null)),
  pluginHidden: vi.fn(() => Promise.resolve()),
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

vi.mock('@plugins/runtime/displayElement/pluginTreeGeometry', () => ({
  setPluginElementHiddenInTree: mocks.pluginHidden,
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
    useDocumentSelectionStore.getState().clearSelection();
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

  it('플러그인 행도 트리 선택으로 고른다 (트리에 노드가 있는 인스턴스)', () => {
    act(() => row('demo::p1').click());
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([
      'demo::p1',
    ]);
    act(() => row('t1').click());
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual(['t1']);
    // 그룹 행 - 플러그인 멤버도 함께
    act(() => row('G').click());
    expect(useDocumentSelectionStore.getState().selectedIds.sort()).toEqual([
      'demo::p1',
      't1',
    ]);
    expect(useDocumentSelectionStore.getState().selectedElements).toEqual([]);
  });

  it('숨김 - 그룹은 트리 그룹 숨김, 플러그인은 플러그인 스토어, 나머지는 트리 공통 정보', () => {
    const eye = (id: string) =>
      row(id).querySelector<HTMLButtonElement>('button:last-of-type')!;
    act(() => eye('G').click());
    expect(mocks.edit).toHaveBeenCalledWith([
      { op: 'setGroup', scene: '4key', id: 'G', hidden: true },
    ]);
    act(() => eye('demo::p1').click());
    expect(mocks.pluginHidden).toHaveBeenCalledWith('4key', 'demo::p1', true);
    act(() => eye('t2').click());
    expect(mocks.setCommon).toHaveBeenCalledWith('4key', 't2', {
      hidden: true,
    });
  });

  it('그룹 안 행 우클릭에는 그룹 항목을 내지 않는다 (예전과 같다)', () => {
    act(() => {
      useDocumentSelectionStore.getState().setSelection('4key', ['k1', 't2']);
    });
    const menuItems = (id: string) => {
      act(() => {
        row(id).dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
        );
      });
      return [
        ...document.body.querySelectorAll<HTMLElement>('[data-menu-item]'),
      ].map((item) => item.dataset.menuItem);
    };
    expect(menuItems('t2')).toContain('groupSelected');
    act(() => {
      useDocumentSelectionStore.getState().setSelection('4key', ['t1', 't2']);
    });
    expect(menuItems('t1')).not.toContain('groupSelected');
  });

  it('그룹에서 빼면 맨 위 멤버는 그룹 바로 위, 나머지는 그룹 바로 아래(그룹의 부모 안)로 옮긴다', async () => {
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
    // 맨 위 멤버가 아니면 그룹 바로 아래로 (예전 패널과 같은 자리)
    expect(mocks.edit).toHaveBeenCalledWith([
      {
        op: 'move',
        scene: '4key',
        ids: ['t1'],
        parent: null,
        index: 1,
      },
    ]);
  });

  it('Shift 범위는 마지막으로 누른 행을 기준으로 하고, Cmd로 플러그인 행을 빼면 그 행만 빠진다', () => {
    act(() => row('k1').click());
    act(() =>
      row('t1').dispatchEvent(
        new MouseEvent('click', { bubbles: true, shiftKey: true }),
      ),
    );
    act(() =>
      row('demo::p1').dispatchEvent(
        new MouseEvent('click', { bubbles: true, shiftKey: true }),
      ),
    );
    // 기준은 처음 누른 k1 그대로
    expect(useDocumentSelectionStore.getState().selectedIds.sort()).toEqual([
      'demo::p1',
      'k1',
      't1',
    ]);
    expect(useDocumentSelectionStore.getState().selectedElements).toEqual([]);

    // 고른 행을 처음 누르면 기준만 옮긴다 (예전과 같다)
    act(() => row('demo::p1').click());
    expect(useDocumentSelectionStore.getState().selectedIds.sort()).toEqual([
      'demo::p1',
      'k1',
      't1',
    ]);
    act(() =>
      row('demo::p1').dispatchEvent(
        new MouseEvent('click', { bubbles: true, metaKey: true }),
      ),
    );
    expect(useDocumentSelectionStore.getState().selectedElements).toEqual([]);
    expect(useDocumentSelectionStore.getState().selectedIds.sort()).toEqual([
      'k1',
      't1',
    ]);
  });

  it('기준 행을 다시 누르면 잠시 뒤 그 행만 남기고(하나면 해제), 기준이 없으면 Shift는 보통 클릭이다', async () => {
    vi.useFakeTimers();
    try {
      act(() => row('k1').click());
      act(() =>
        row('t2').dispatchEvent(
          new MouseEvent('click', { bubbles: true, metaKey: true }),
        ),
      );
      // t2가 기준 - 다시 누르면 50ms 뒤 t2만
      act(() => row('t2').click());
      expect(useDocumentSelectionStore.getState().selectedIds.sort()).toEqual([
        'k1',
        't2',
      ]);
      act(() => vi.advanceTimersByTime(60));
      expect(useDocumentSelectionStore.getState().selectedIds).toEqual(['t2']);
      // 하나만 고른 기준 행을 다시 누르면 해제
      act(() => row('t2').click());
      act(() => vi.advanceTimersByTime(60));
      expect(useDocumentSelectionStore.getState().selectedIds).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  const openMenu = (id: string) =>
    act(() => {
      row(id).dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      );
    });
  const pick = async (item: string) => {
    const button = document.body.querySelector<HTMLElement>(
      `[data-menu-item="${item}"]`,
    );
    expect(button).not.toBeNull();
    await act(async () => button!.click());
  };

  it('숨긴 그룹을 풀면 숨김을 멤버에게 남기고 선택을 푼다 (예전과 같다)', async () => {
    (mocks.scene as { nodes: Array<Record<string, unknown>> }).nodes[1].hidden =
      true;
    act(() => root.render(<LayerTabContent />));
    act(() => {
      useDocumentSelectionStore.getState().setSelection('4key', ['t1']);
    });
    openMenu('G');
    await pick('ungroup');
    expect(mocks.edit).toHaveBeenCalledWith([
      { op: 'ungroup', scene: '4key', id: 'G' },
      { op: 'setCommon', scene: '4key', id: 't1', hidden: true },
      { op: 'setCommon', scene: '4key', id: 'demo::p1', hidden: true },
    ]);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([]);
  });

  it('숨긴 그룹 안 행은 숨김으로 보이고, 그룹 행 더블클릭은 이름 바꾸기가 아니다', () => {
    (mocks.scene as { nodes: Array<Record<string, unknown>> }).nodes[1].hidden =
      true;
    act(() => root.render(<LayerTabContent />));
    expect(row('t1').className).toContain('opacity-60');
    act(() => {
      row('G').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(container.querySelector('input')).toBeNull();
  });

  it('기본 이름과 같게 입력해도 그 이름으로 둔다 (예전과 같다)', async () => {
    openMenu('t2');
    await pick('rename');
    const input = container.querySelector<HTMLInputElement>('input')!;
    const fallback = input.value;
    act(() => {
      input.focus();
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    expect(mocks.setCommon).toHaveBeenCalledWith('4key', 't2', {
      name: fallback,
    });
  });

  it('숨긴 그룹 안 요소의 눈을 누르면 예전처럼 그 요소만 보인다', () => {
    (mocks.scene as { nodes: Array<Record<string, unknown>> }).nodes[1].hidden =
      true;
    act(() => root.render(<LayerTabContent />));
    act(() => {
      row('t1').querySelector<HTMLButtonElement>('button')!.click();
    });
    expect(mocks.edit).toHaveBeenCalledWith([
      { op: 'setGroup', scene: '4key', id: 'G', hidden: false },
      { op: 'setCommon', scene: '4key', id: 'demo::p1', hidden: true },
    ]);
  });
});
