// @vitest-environment jsdom
// 일괄 패널 크기 칸 - 크기 조절이 실제로 고치는 대상 전부(스프라이트 포함)의 값을 보인다.
// 노브·그래프 칸만 모으면 다른 크기의 스프라이트가 섞여도 Mixed가 안 보이고, 확정하면 스프라이트가 커진다
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
import type { Document, Node } from '@src/types/generated/elementDocument';

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

const ID = (n: number) => `61000000-0000-4000-8000-00000000000${n}`;

const element = (
  id: string,
  kind: string,
  index: number,
  size: { width: number; height: number },
): ElementNode =>
  fillKindDefaults({
    type: 'element',
    id,
    kind,
    frame: { x: 10 + index * 220, y: 20, ...size, rotation: 0 },
    legacy: { index },
  } as ElementNode);

const graph = element(ID(1), 'graph', 0, { width: 200, height: 100 });
const otherGraph = element(ID(2), 'graph', 1, { width: 200, height: 100 });
const knob = element(ID(3), 'knob', 2, { width: 60, height: 60 });
const sprite = element(ID(4), 'sprite', 3, { width: 80, height: 80 });

const documentOf = (nodes: Node[]): Document => ({
  formatVersion: 1,
  kindVersions: {},
  scenes: { '4key': { nodes } },
});

describe('일괄 패널 크기 칸', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    ipc.backend = createFakeElementDocumentBackend(documentOf([]));
    await loadElementDocumentStore();
  });

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useKeyStore.setState({ selectedKeyType: '4key' });
    usePropertiesPanelStore.setState({
      isCanvasPanelOpen: true,
      canvasPanelMode: 'property',
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useDocumentSelectionStore.getState().clear();
  });

  // 크기 줄의 W·H 입력
  const sizeInputs = async (nodes: Node[], selected: string[]) => {
    act(() => ipc.backend!.replace(() => documentOf(nodes)));
    act(() => {
      useDocumentSelectionStore.getState().setSelection('4key', selected);
    });
    await act(async () => {
      root.render(<PropertiesPanel />);
    });
    const label = [...host.querySelectorAll('p')].find(
      (node) => node.textContent === 'propertiesPanel.size',
    );
    const row = label!.parentElement!;
    return [...row.querySelectorAll('input')] as HTMLInputElement[];
  };

  it.each([
    ['그래프와 스프라이트', [graph, sprite], [ID(1), ID(4)]],
    ['노브와 스프라이트', [knob, sprite], [ID(3), ID(4)]],
  ] as const)(
    '%s - 크기가 다르면 Mixed를 보인다',
    async (_name, nodes, ids) => {
      const inputs = await sizeInputs([...nodes], [...ids]);

      expect(inputs).toHaveLength(2);
      for (const input of inputs) {
        expect(input.value).toBe('');
        expect(input.placeholder).toBe('Mixed');
      }
    },
  );

  it('크기가 같으면 그 값을 보인다', async () => {
    const inputs = await sizeInputs([graph, otherGraph], [ID(1), ID(2)]);

    expect(inputs.map((input) => input.value)).toEqual(['200', '100']);
  });
});
