// @vitest-environment jsdom
// 속성 패널 DOM 약속 - 실제 속성 패널을 트리 문서로 꾸며 종류·선택 조합마다 그린 DOM을 고정한다.
// 태그·클래스·모든 속성·인라인 스타일·글자를 담는다. 기준값은 7단계에서 종류 패널을 선언 패널로 옮기기 전
// 옛 패널로 만들었다 - 생김새가 그대로인지 확인한다 (설계 3.7)
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
const { useSettingsStore } = await import('@stores/useSettingsStore');

const ID = (n: number) => `60000000-0000-4000-8000-00000000000${n}`;

const element = (
  id: string,
  kind: string,
  index: number,
  extra: Partial<ElementNode> = {},
): ElementNode =>
  fillKindDefaults({
    type: 'element',
    id,
    kind,
    frame: { x: 10 + index * 80, y: 20, width: 200, height: 100, rotation: 0 },
    legacy: { index },
    ...extra,
  } as ElementNode);

const lineGraph = element(ID(1), 'graph', 0);
const barGraph = element(ID(2), 'graph', 1, {
  name: 'My Graph',
  className: 'kps-graph',
  useInlineStyles: true,
  values: {
    statType: 'total',
    graphType: 'bar',
    graphSpeed: 2500,
    graphColor: '#12345680',
    showAvgLine: false,
    graphAnimationEnabled: false,
  },
  bundles: {
    surface: {
      backgroundColor: '#223344',
      borderColor: '#AABBCC',
      borderWidth: 3,
      borderRadius: 12,
    },
    image: { inactiveImage: '', idleTransparent: true },
  },
} as Partial<ElementNode>);
const key = element(ID(3), 'key', 2, {
  frame: { x: 300, y: 20, width: 60, height: 60, rotation: 0 },
  input: { type: 'key', slot: 'KeyA' },
} as Partial<ElementNode>);

const tracker = element(ID(4), 'cursorTracker', 3, {
  frame: { x: 400, y: 20, width: 120, height: 120, rotation: 0 },
});
const positionTracker = element(ID(5), 'cursorTracker', 4, {
  frame: { x: 540, y: 20, width: 120, height: 120, rotation: 0 },
  values: { mode: 'position', dotColor: '#FF0000' },
  bundles: { surface: { backgroundColor: '#101010', borderWidth: 2 } },
} as Partial<ElementNode>);

interface Case {
  nodes: Node[];
  selected: string[];
  useCustomCSS?: boolean;
}

const CASES: Record<string, Case> = {
  '그래프 하나 - 기본값': { nodes: [lineGraph], selected: [ID(1)] },
  '그래프 하나 - 이름·고른 값·사용자 CSS': {
    nodes: [barGraph],
    selected: [ID(2)],
    useCustomCSS: true,
  },
  '그래프 여럿 - 섞인 값': {
    nodes: [lineGraph, barGraph],
    selected: [ID(1), ID(2)],
    useCustomCSS: true,
  },
  '그래프 여럿 - 그룹 하나': {
    nodes: [
      {
        type: 'group',
        id: 'group-1',
        name: 'Graphs',
        children: [lineGraph, barGraph],
      } as Node,
    ],
    selected: [ID(1), ID(2)],
  },
  '키와 그래프': { nodes: [lineGraph, key], selected: [ID(1), ID(3)] },
  // 트리에만 있는 종류
  '커서 트래커 하나': { nodes: [tracker], selected: [ID(4)] },
  '커서 트래커 여럿 - 섞인 모드': {
    nodes: [tracker, positionTracker],
    selected: [ID(4), ID(5)],
  },
};

interface NodeSignature {
  tag: string;
  class?: string[];
  attrs?: Record<string, string>;
  style?: Record<string, string>;
  text?: string;
  children?: NodeSignature[];
}

const sorted = (entries: [string, string][]) =>
  Object.fromEntries(
    entries.sort(([left], [right]) => left.localeCompare(right)),
  );

// React가 그릴 때마다 새로 만드는 id는 고정 문자로
const stable = (value: string) => value.replace(/[«:]r[0-9a-z]+[»:]/g, 'R');

const signatureOf = (node: Element): NodeSignature => {
  const classes = [...node.classList].sort();
  const attrs = sorted(
    [...node.attributes]
      .filter(({ name }) => name !== 'class' && name !== 'style')
      .map(({ name, value }) => [name, stable(value)]),
  );
  const { style } = node as HTMLElement;
  const styles: [string, string][] = [];
  for (let index = 0; index < (style?.length ?? 0); index += 1) {
    const name = style[index];
    styles.push([name, style.getPropertyValue(name)]);
  }
  const text = [...node.childNodes]
    .filter((child) => child.nodeType === globalThis.Node.TEXT_NODE)
    .map((child) => child.textContent ?? '')
    .join('')
    .trim();
  const children = [...node.children].map(signatureOf);
  return {
    tag: node.tagName.toLowerCase(),
    ...(classes.length > 0 ? { class: classes } : {}),
    ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
    ...(styles.length > 0 ? { style: sorted(styles) } : {}),
    ...(text ? { text } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
};

const documentOf = (nodes: Node[]): Document => ({
  formatVersion: 1,
  kindVersions: {},
  scenes: { '4key': { nodes } },
});

describe('속성 패널 DOM 약속', () => {
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
    useSettingsStore.setState({ useCustomCSS: false });
  });

  it.each(Object.keys(CASES))('%s', async (name) => {
    const { nodes, selected, useCustomCSS = false } = CASES[name];
    act(() => ipc.backend!.replace(() => documentOf(nodes)));
    useSettingsStore.setState({ useCustomCSS });
    act(() => {
      useDocumentSelectionStore.getState().setSelection('4key', selected);
    });
    await act(async () => {
      root.render(<PropertiesPanel />);
    });
    const frame = host.querySelector('[data-dmn-panel-frame]');
    expect(frame).not.toBeNull();
    expect(signatureOf(frame!)).toMatchSnapshot();
  });
});
