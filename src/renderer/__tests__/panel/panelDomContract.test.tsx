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
// 커서 트래커 모니터 목록 - 앱 API 대신 고정 목록
vi.mock(
  '@src/renderer/elementKinds/runtime/pointerInput',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@src/renderer/elementKinds/runtime/pointerInput')
    >()),
    loadPointerMonitors: () =>
      Promise.resolve([
        {
          id: 'main',
          name: 'Main',
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          primary: true,
        },
      ]),
  }),
);

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
const { getDefaultCounterSettings } = await import('@src/renderer/defaults');
const { BUILTIN_BUNDLE_DEFAULTS } = await import(
  '@src/types/generated/elementDocument'
);

const ID = (n: number) =>
  `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

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

const knob = element(ID(6), 'knob', 5, {
  frame: { x: 700, y: 20, width: 60, height: 60, rotation: 0 },
});
const boundKnob = element(ID(7), 'knob', 6, {
  frame: { x: 780, y: 20, width: 80, height: 40, rotation: 0 },
  name: 'My Knob',
  className: 'my-knob',
  useInlineStyles: true,
  input: { type: 'axis', axisId: 'HIDA:1234' },
  values: { sensitivity: 2.5, reverse: true },
  bundles: {
    surface: {
      backgroundColor: '#223344',
      activeBackgroundColor: '#445566',
      borderWidth: 3,
      borderRadius: 12,
      shadow: {
        enabled: true,
        color: '#000000',
        offsetX: 1,
        offsetY: 2,
        blur: 3,
      },
    },
    image: { idleTransparent: true },
  },
} as Partial<ElementNode>);
const IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const sprite = element(ID(8), 'sprite', 7, {
  frame: { x: 900, y: 20, width: 80, height: 80, rotation: 0 },
});
const posedSprite = element(ID(9), 'sprite', 8, {
  frame: { x: 1000, y: 20, width: 120, height: 90, rotation: 0 },
  name: 'My Sprite',
  values: {
    baseImage: IMAGE,
    referenceNaturalSize: { source: IMAGE, width: 1, height: 1 },
    activation: 'onPress',
    pressDurationMs: 450,
    poses: [
      {
        poseId: '70000000-0000-4000-8000-000000000001',
        name: 'Hit',
        triggers: [ID(3)],
        transform: { x: 4, y: -2, rotation: 15, scale: 1.2 },
      },
    ],
  },
} as Partial<ElementNode>);
const tracker = element(ID(4), 'cursorTracker', 3, {
  frame: { x: 400, y: 20, width: 120, height: 120, rotation: 0 },
});
const positionTracker = element(ID(5), 'cursorTracker', 4, {
  frame: { x: 540, y: 20, width: 120, height: 120, rotation: 0 },
  values: { mode: 'position', dotColor: '#FF0000' },
  bundles: { surface: { backgroundColor: '#101010', borderWidth: 2 } },
} as Partial<ElementNode>);

const customKey = element(ID(10), 'key', 9, {
  frame: { x: 1200, y: 20, width: 80, height: 70, rotation: 15 },
  name: 'My Key',
  className: 'my-key',
  useInlineStyles: true,
  input: { type: 'key', slot: 'KeyB' },
  values: { displayText: 'B!', count: 3 },
  bundles: {
    surface: {
      backgroundColor: '#223344',
      activeBackgroundColor: '#445566',
      borderColor: '#AABBCC',
      borderWidth: 3,
      borderRadius: 12,
      shadow: {
        enabled: true,
        color: '#000000',
        offsetX: 1,
        offsetY: 2,
        blur: 3,
      },
    },
    font: { fontSize: 18, fontColor: '#FF0000', fontWeight: 700 },
    image: { idleTransparent: true },
    note: {
      ...BUILTIN_BUNDLE_DEFAULTS.note,
      noteColor: '#00FF00',
      noteEffectEnabled: false,
      noteGlowEnabled: true,
    },
    counter: {
      counter: {
        ...getDefaultCounterSettings(),
        placement: 'outside',
        align: 'top',
        gap: 8,
      },
    },
    sound: { soundEnabled: true, soundPath: null, soundVolume: 40 },
  },
} as unknown as Partial<ElementNode>);
const stat = element(ID(11), 'stat', 10, {
  frame: { x: 1300, y: 20, width: 60, height: 60, rotation: 0 },
});
const totalStat = element(ID(12), 'stat', 11, {
  frame: { x: 1380, y: 20, width: 90, height: 50, rotation: 0 },
  name: 'Total',
  values: { statType: 'total', displayText: null, count: 0 },
  bundles: { font: { fontSize: 20 } },
} as Partial<ElementNode>);

interface Case {
  nodes: Node[];
  selected: string[];
  useCustomCSS?: boolean;
  // 속성 패널 탭 - 기본은 스타일
  tab?: 'style' | 'note' | 'counter';
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
  '노브 하나 - 기본값': { nodes: [knob], selected: [ID(6)] },
  '노브 하나 - 축·고른 값·사용자 CSS': {
    nodes: [boundKnob],
    selected: [ID(7)],
    useCustomCSS: true,
  },
  '노브 여럿 - 섞인 값': {
    nodes: [knob, boundKnob],
    selected: [ID(6), ID(7)],
    useCustomCSS: true,
  },
  '노브와 그래프': {
    nodes: [lineGraph, knob],
    selected: [ID(1), ID(6)],
  },
  '스프라이트 하나 - 기본값': { nodes: [sprite], selected: [ID(8)] },
  '스프라이트 하나 - 이미지·자세·단발 재생': {
    nodes: [key, posedSprite],
    selected: [ID(9)],
  },
  '스프라이트 여럿': {
    nodes: [sprite, posedSprite, key],
    selected: [ID(8), ID(9)],
  },
  '스프라이트와 그래프': {
    nodes: [lineGraph, sprite],
    selected: [ID(1), ID(8)],
  },
  '키 하나 - 기본값': { nodes: [key], selected: [ID(3)] },
  '키 하나 - 노트 탭': { nodes: [key], selected: [ID(3)], tab: 'note' },
  '키 하나 - 카운터 탭': { nodes: [key], selected: [ID(3)], tab: 'counter' },
  '키 하나 - 이름·고른 값·사용자 CSS': {
    nodes: [customKey],
    selected: [ID(10)],
    useCustomCSS: true,
  },
  '키 여럿 - 섞인 값': {
    nodes: [key, customKey],
    selected: [ID(3), ID(10)],
    useCustomCSS: true,
  },
  '키 여럿 - 노트 탭': {
    nodes: [key, customKey],
    selected: [ID(3), ID(10)],
    tab: 'note',
  },
  '키 여럿 - 카운터 탭': {
    nodes: [key, customKey],
    selected: [ID(3), ID(10)],
    tab: 'counter',
  },
  '키 여럿 - 그룹 하나': {
    nodes: [
      {
        type: 'group',
        id: 'group-2',
        name: 'Keys',
        children: [key, customKey],
      } as Node,
    ],
    selected: [ID(3), ID(10)],
  },
  '스탯 하나 - 기본값': { nodes: [stat], selected: [ID(11)] },
  '스탯 하나 - 이름·누적·카운터 탭': {
    nodes: [totalStat],
    selected: [ID(12)],
    tab: 'counter',
  },
  '스탯 여럿': { nodes: [stat, totalStat], selected: [ID(11), ID(12)] },
  '키와 스탯': { nodes: [key, stat], selected: [ID(3), ID(11)] },
  '키와 스탯 - 노트 탭': {
    nodes: [key, stat],
    selected: [ID(3), ID(11)],
    tab: 'note',
  },
  '키와 노브': { nodes: [key, knob], selected: [ID(3), ID(6)] },
  '키와 스프라이트': { nodes: [key, sprite], selected: [ID(3), ID(8)] },
  '키와 그래프 - 카운터 탭': {
    nodes: [lineGraph, key],
    selected: [ID(1), ID(3)],
    tab: 'counter',
  },
  '노브와 그래프 - 카운터 탭': {
    nodes: [lineGraph, knob],
    selected: [ID(1), ID(6)],
    tab: 'counter',
  },
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
    usePropertiesPanelStore.setState({ propertyPanelActiveTab: 'style' });
  });

  it.each(Object.keys(CASES))('%s', async (name) => {
    const {
      nodes,
      selected,
      useCustomCSS = false,
      tab = 'style',
    } = CASES[name];
    act(() => ipc.backend!.replace(() => documentOf(nodes)));
    useSettingsStore.setState({ useCustomCSS });
    usePropertiesPanelStore.setState({ propertyPanelActiveTab: tab });
    act(() => {
      useDocumentSelectionStore.getState().setSelection('4key', selected);
    });
    await act(async () => {
      root.render(<PropertiesPanel />);
    });
    // 편집 화면 전용 입력(지연 로딩)이 올라올 때까지
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const frame = host.querySelector('[data-dmn-panel-frame]');
    expect(frame).not.toBeNull();
    expect(signatureOf(frame!)).toMatchSnapshot();
  });
});
