// @vitest-environment jsdom
// 키·스탯이 든 일괄 선택 - 선언 일괄 패널이 옛 일괄 부품으로 그리고, 고친 값은 고른 요소 모두에 트리 커밋 하나로 간다
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { FakeElementDocumentBackend } from '@src/renderer/__tests__/fakeElementDocumentBackend';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { Document, Node, Op } from '@src/types/generated/elementDocument';

// IPC 경계만 대역 - 트리 스토어·런타임·패널은 실물 (편집 창)
const ipc = vi.hoisted(() => ({
  backend: null as FakeElementDocumentBackend | null,
}));
vi.mock('@api/modules/editor/elementDocumentApi', () => ({
  elementDocumentApi: new Proxy(
    {},
    {
      get: (_target, name: string) =>
        name === 'registerKind' || name === 'unregisterKind'
          ? async () => undefined
          : (ipc.backend!.api as Record<string, unknown>)[name],
    },
  ),
}));
vi.mock('@api/modules/editor/previewApi', () => ({
  previewApi: {
    subscribe: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@contexts/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'ko', changeLanguage: () => {} },
  }),
}));
vi.mock('@hooks/useLenis', () => ({
  useLenis: () => ({ scrollContainerRef: () => undefined }),
}));

const { createFakeElementDocumentBackend } = await import(
  '@src/renderer/__tests__/fakeElementDocumentBackend'
);
const { loadElementDocumentStore } = await import(
  '@src/renderer/editor/document/elementDocumentRuntime'
);
const { fillKindDefaults } = await import(
  '@src/renderer/elementKinds/runtime/elementKindDefaults'
);
const { default: PropertiesPanel } = await import(
  '@components/main/Grid/PropertiesPanel'
);
const { useKeyStore } = await import('@stores/data/useKeyStore');
const { useDocumentSelectionStore } = await import(
  '@stores/grid/useDocumentSelectionStore'
);
const { usePropertiesPanelStore } = await import(
  '@stores/grid/usePropertiesPanelStore'
);

const ID = (n: number) => `62000000-0000-4000-8000-00000000000${n}`;

const node = (id: string, kind: string, index: number): ElementNode =>
  fillKindDefaults({
    type: 'element',
    id,
    kind,
    frame: { x: index * 80, y: 0, width: 60, height: 60, rotation: 0 },
    values: { displayText: `T${index}` },
    ...(kind === 'key' ? { input: { type: 'key', slot: `Key${index}` } } : {}),
    legacy: { index },
  } as ElementNode);

const documentOf = (nodes: Node[]): Document => ({
  formatVersion: 1,
  kindVersions: {},
  scenes: { '4key': { nodes } },
});

const setInputValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('키·스탯 일괄 패널', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    // 트리 쓰기는 편집 창에서만 열린다
    window.__dmn_window_type = 'main';
    ipc.backend = createFakeElementDocumentBackend(documentOf([]));
    await loadElementDocumentStore();
  });

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    useKeyStore.setState({ selectedKeyType: '4key' });
    usePropertiesPanelStore.setState({
      isCanvasPanelOpen: true,
      canvasPanelMode: 'property',
      propertyPanelActiveTab: 'style',
    });
    ipc.backend!.commit.mockClear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useDocumentSelectionStore.getState().clear();
    vi.unstubAllGlobals();
  });

  const render = async (nodes: Node[], selected: string[]) => {
    act(() => ipc.backend!.replace(() => documentOf(nodes)));
    act(() => {
      useDocumentSelectionStore.getState().setSelection('4key', selected);
    });
    await act(async () => {
      root.render(<PropertiesPanel />);
    });
  };

  // 라벨로 찾은 줄의 입력
  const inputOf = (label: string) => {
    const text = [...host.querySelectorAll('p')].find(
      (element) => element.textContent === label,
    );
    return text!.parentElement!.querySelector('input') as HTMLInputElement;
  };

  it('표시 텍스트를 바꾸면 고른 키·스탯 모두에 트리 커밋 하나로 쓴다', async () => {
    const nodes = [
      node(ID(1), 'key', 0),
      node(ID(2), 'key', 1),
      node(ID(3), 'stat', 2),
    ];
    await render(nodes, [ID(1), ID(2), ID(3)]);

    const input = inputOf('propertiesPanel.displayText');
    expect(input.placeholder).toBe('Mixed');
    act(() => {
      input.focus();
      setInputValue(input, 'Z');
    });
    await act(async () => {
      input.blur();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(ipc.backend!.commit).toHaveBeenCalledTimes(1);
    expect(ipc.backend!.commit.mock.calls[0][0] as Op[]).toEqual(
      [ID(1), ID(2), ID(3)].map((id) => ({
        op: 'setValues',
        scene: '4key',
        id,
        values: { displayText: 'Z' },
      })),
    );
    const scene = ipc.backend!.document().scenes['4key']!;
    expect(
      scene.nodes.map(
        (child) => (child as ElementNode).values?.displayText ?? null,
      ),
    ).toEqual(['Z', 'Z', 'Z']);
  });

  it('노트 탭은 키가 있을 때만, 스탯만 고르면 겉모습·카운터 탭', async () => {
    const tabNames = () =>
      [...host.querySelectorAll('button')]
        .map((button) => button.textContent)
        .filter((text) => text?.startsWith('propertiesPanel.tab'));

    await render(
      [node(ID(1), 'key', 0), node(ID(3), 'stat', 1)],
      [ID(1), ID(3)],
    );
    const withKey = tabNames();
    await render(
      [node(ID(3), 'stat', 0), node(ID(4), 'stat', 1)],
      [ID(3), ID(4)],
    );
    const statsOnly = tabNames();

    expect(withKey).toHaveLength(3);
    expect(statsOnly).toHaveLength(2);
  });
});
