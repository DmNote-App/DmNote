// @vitest-environment jsdom
// 옛 종류와 트리에만 있는 종류(커서 트래커)를 함께 고른 일괄 - 고른 종류들 선언의 합을 그리고, 둘이 같이 가진
// 겉모습 칸은 두 요소에 트리 커밋 하나로 쓴다
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
vi.mock(
  '@src/renderer/elementKinds/runtime/pointerInput',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@src/renderer/elementKinds/runtime/pointerInput')
    >()),
    loadPointerMonitors: () => Promise.resolve([]),
  }),
);

const { createFakeElementDocumentBackend } = await import(
  '@src/renderer/__tests__/fakeElementDocumentBackend'
);
const { getElementDocumentStore, loadElementDocumentStore } = await import(
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

const KEY = '64000000-0000-4000-8000-000000000001';
const TRACKER = '64000000-0000-4000-8000-000000000002';

const node = (
  id: string,
  kind: string,
  index: number,
  extra: Partial<ElementNode> = {},
): ElementNode =>
  fillKindDefaults({
    type: 'element',
    id,
    kind,
    frame: { x: index * 150, y: 20, width: 120, height: 120, rotation: 0 },
    legacy: { index },
    ...extra,
  } as ElementNode);

const documentOf = (): Document => ({
  formatVersion: 1,
  kindVersions: {},
  scenes: {
    '4key': {
      nodes: [
        node(KEY, 'key', 0, {
          input: { type: 'key', slot: 'KeyA' },
        } as Partial<ElementNode>),
        node(TRACKER, 'cursorTracker', 1),
      ] as Node[],
    },
  },
});

const setInputValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

// 칸 이름으로 행 안의 입력
const rowInput = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll('p, span')]
    .find((node) => node.textContent === label)
    ?.parentElement?.querySelector('input') ?? null;

describe('옛 종류와 트리에만 있는 종류를 함께 고른 일괄', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    // 트리 쓰기는 편집 창에서만 열린다
    window.__dmn_window_type = 'main';
    ipc.backend = createFakeElementDocumentBackend(documentOf());
    await loadElementDocumentStore();
  });

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useKeyStore.setState({ selectedKeyType: '4key' });
    usePropertiesPanelStore.setState({
      isCanvasPanelOpen: true,
      canvasPanelMode: 'property',
      propertyPanelActiveTab: 'style',
    });
    act(() => ipc.backend!.replace(() => documentOf()));
    ipc.backend!.commit.mockClear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      useDocumentSelectionStore.getState().setSelection('4key', [KEY, TRACKER]);
    });
    await act(async () => {
      root.render(<PropertiesPanel />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useDocumentSelectionStore.getState().clear();
  });

  it('두 종류의 칸을 함께 보인다 - 키 매핑·글자(키)와 커서 트래커 칸, 겉모습 칸은 하나', () => {
    const text = host.textContent ?? '';
    expect(text).toContain('propertiesPanel.keyMapping');
    expect(text).toContain('elementKinds.cursorTracker.mode');
    expect(
      [...host.querySelectorAll('p, span')].filter(
        (node) => node.textContent === 'propertiesPanel.borderWidth',
      ),
    ).toHaveLength(1);
  });

  it('둘이 같이 가진 겉모습 칸은 두 요소에 트리 커밋 하나로 쓴다', async () => {
    const width = rowInput(host, 'propertiesPanel.borderWidth');
    expect(width).not.toBeNull();
    await act(async () => {
      width!.focus();
      setInputValue(width!, '5');
      width!.blur();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(ipc.backend!.commit).toHaveBeenCalledTimes(1);
    const ops = ipc.backend!.commit.mock.calls[0][0] as Op[];
    expect(
      ops
        .filter((op) => op.op === 'setBundle')
        .map((op) => ('id' in op ? op.id : null))
        .sort(),
    ).toEqual([KEY, TRACKER].sort());
    const surfaceOf = (id: string) =>
      getElementDocumentStore()!.getElement('4key', id)?.bundles?.surface as
        | Record<string, unknown>
        | undefined;
    expect(surfaceOf(KEY)?.borderWidth).toBe(5);
    expect(surfaceOf(TRACKER)?.borderWidth).toBe(5);
  });
});
