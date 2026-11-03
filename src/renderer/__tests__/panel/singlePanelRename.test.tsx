// @vitest-environment jsdom
// 단일 패널 머리 이름 바꾸기 - Escape는 저장 없이 끝내고, 다음 이름은 고른 요소에 저장한다
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
import type { Document } from '@src/types/generated/elementDocument';

// IPC 경계만 대역 - 트리 스토어·런타임·패널은 실물
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

const OTHER = '64000000-0000-4000-8000-000000000001';
const TARGET = '64000000-0000-4000-8000-000000000002';

const keyNode = (id: string, slot: string, index: number): ElementNode =>
  fillKindDefaults({
    type: 'element',
    id,
    kind: 'key',
    frame: { x: index * 70, y: 0, width: 60, height: 60, rotation: 0 },
    input: { type: 'key', slot },
    legacy: { index },
  } as unknown as ElementNode);

const documentOf = (): Document => ({
  formatVersion: 1,
  kindVersions: {},
  scenes: {
    '4key': { nodes: [keyNode(OTHER, 'B', 0), keyNode(TARGET, 'A', 1)] },
  },
});

// 머리 이름 입력 (패널의 다른 글자·숫자 입력과 가린다)
const RENAME_INPUT = 'input.caret-accent';

const nameOf = (id: string) =>
  ipc.backend!.document().scenes['4key']!.nodes.find((node) => node.id === id)
    ?.name;

describe('단일 패널 이름 바꾸기', () => {
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
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    useKeyStore.setState({ selectedKeyType: '4key' });
    usePropertiesPanelStore.setState({
      isCanvasPanelOpen: true,
      canvasPanelMode: 'property',
    });
    act(() => ipc.backend!.replace(documentOf));
    ipc.backend!.commit.mockClear();
    act(() => {
      useDocumentSelectionStore.getState().setSelection('4key', [TARGET]);
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<PropertiesPanel />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useDocumentSelectionStore.getState().clear();
    vi.unstubAllGlobals();
  });

  const startRename = async () => {
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[title="contextMenu.rename"]')!
        .click(),
    );
    const input = host.querySelector<HTMLInputElement>(RENAME_INPUT)!;
    await act(async () => input.focus());
    return input;
  };
  const typeName = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('Escape로 취소한 뒤 다음 이름을 고른 키에 저장한다', async () => {
    const cancelled = await startRename();
    expect(cancelled.value).toBe('A');
    await typeName(cancelled, 'Cancelled');
    await act(async () =>
      cancelled.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    );
    expect(host.querySelector(RENAME_INPUT)).toBeNull();
    expect(ipc.backend!.commit).not.toHaveBeenCalled();

    const input = await startRename();
    await typeName(input, 'Saved');
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      ),
    );

    expect(nameOf(TARGET)).toBe('Saved');
    expect(nameOf(OTHER)).toBeUndefined();
  });
});
