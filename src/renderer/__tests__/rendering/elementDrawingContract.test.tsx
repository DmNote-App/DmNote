// @vitest-environment jsdom
// 그리기 약속 행렬 - 종류 × 편집 화면/오버레이 × 상태로 그린 DOM을 고정한다. 태그·클래스·모든 속성·인라인
// 스타일(CSS 변수 포함)·글자를 담고, 편집 화면은 감싸는 상자(편집 화면 트리 층)까지 그린다. 기준값은 7단계에서
// 종류마다 그리기를 한 벌로 합치기 전 그리기로 만들었다 - 사용자 CSS가 기대는 모양과 자리, 편집 미리보기
// (옛 패널 미리보기·그라데이션 세션·눌림)가 그대로인지 확인한다 (설계 3.6·3.10)
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { Scene } from '@src/types/generated/elementDocument';

const state = vi.hoisted(() => ({
  scene: { nodes: [] } as { nodes: unknown[] },
  inPanelSelection: false,
}));

vi.mock(
  '@src/renderer/editor/document/elementDocumentRuntime',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@src/renderer/editor/document/elementDocumentRuntime')
    >()),
    loadElementDocumentStore: () => Promise.resolve(),
    useElementDocumentScene: () => state.scene,
    useDocumentElement: (_sceneId: string, id: string) =>
      (state.scene.nodes as ElementNode[]).find((node) => node.id === id),
  }),
);

vi.mock('@components/main/Grid/document/treeEditedSelection', () => ({
  useInPanelSelection: () => state.inPanelSelection,
}));

vi.mock('@contexts/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { default: DocumentElementsLayer } = await import(
  '@src/renderer/elementKinds/runtime/DocumentElementsLayer'
);
const { default: DocumentGridLayer } = await import(
  '@components/main/Grid/document/DocumentGridLayer'
);
const { fillKindDefaults } = await import(
  '@src/renderer/elementKinds/runtime/elementKindDefaults'
);
const { pointerInputSource } = await import(
  '@src/renderer/elementKinds/runtime/pointerInput'
);
const { resetAllKeySignals, setKeyActive } = await import(
  '@stores/signals/keySignals'
);
const { addAxisDelta, resetAllAxisSignals } = await import(
  '@stores/signals/axisSignals'
);
const { useEditStatePreviewStore } = await import(
  '@stores/grid/useEditStatePreviewStore'
);
const { useGradientEditStore } = await import(
  '@stores/grid/useGradientEditStore'
);
const { previewOverlay } = await import(
  '@src/renderer/editor/runtime/gesture/previewOverlay'
);
const { useKeyStore } = await import('@stores/data/useKeyStore');

const IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const node = (
  id: string,
  kind: string,
  extra: Record<string, unknown>,
): ElementNode =>
  fillKindDefaults({
    type: 'element',
    id,
    kind,
    frame: { x: 4, y: 8, width: 60, height: 60, rotation: 0 },
    className: `my-${kind}`,
    ...extra,
  } as ElementNode);

const surface = {
  backgroundColor: '#112233',
  borderWidth: 2,
  borderRadius: 6,
  shadow: {
    enabled: true,
    color: '#000000',
    offsetX: 1,
    offsetY: 2,
    blur: 3,
  },
};

const GRADIENT = {
  type: 'linear',
  angle: 90,
  stops: [
    { color: '#FF0000', position: 0 },
    { color: '#0000FF', position: 100 },
  ],
};

interface ContractCase {
  element: ElementNode;
  // 입력 상태 - 키·스프라이트는 키 누름, 노브는 축 회전
  press?: () => void;
  // 편집 화면 눌림 미리보기를 그리는 종류
  previewPressed?: boolean;
  // 편집 미리보기(옛 패널 미리보기·그라데이션 세션) 도메인 - 표면을 그리는 종류
  previewDomain?: string;
}

// 종류마다 대기 그림과 눌림 그림이 갈리는 칸을 채운다
const CASES: Record<string, ContractCase> = {
  key: {
    element: node('key-1', 'key', {
      input: { type: 'key', slot: 'KeyA' },
      bundles: {
        surface: { ...surface, activeBackgroundColor: '#445566' },
        font: { fontSize: 14, fontColor: '#ffffff' },
      },
    }),
    press: () => setKeyActive('KeyA', true),
    previewPressed: true,
    previewDomain: 'keyPosition',
  },
  stat: {
    element: node('stat-1', 'stat', {
      values: { statType: 'kps', displayText: 'KPS', count: 0 },
      bundles: { surface, font: { fontSize: 12 } },
    }),
    previewDomain: 'statPosition',
  },
  // 표시 글자가 비면 수치 종류 이름
  statLabel: {
    element: node('stat-2', 'stat', {
      values: { statType: 'total', displayText: null, count: 0 },
      bundles: { surface },
    }),
  },
  graph: {
    element: node('graph-1', 'graph', {
      frame: { x: 4, y: 8, width: 200, height: 100, rotation: 0 },
      values: { statType: 'kps', graphType: 'line' },
      bundles: { surface },
    }),
    previewDomain: 'graphPosition',
  },
  knob: {
    element: node('knob-1', 'knob', {
      input: { type: 'axis', axisId: 'axis-1' },
      bundles: { surface: { ...surface, activeBackgroundColor: '#445566' } },
    }),
    press: () => addAxisDelta('axis-1', 0.25),
    previewPressed: true,
    previewDomain: 'knobPosition',
  },
  sprite: {
    element: node('sprite-1', 'sprite', {
      frame: { x: 4, y: 8, width: 80, height: 80, rotation: 0 },
      values: {
        baseImage: IMAGE,
        poses: [
          {
            poseId: 'pose-1',
            triggers: ['key-1'],
            transform: { x: 0, y: 0, rotation: 15, scale: 1 },
          },
        ],
      },
    }),
    press: () => setKeyActive('KeyA', true),
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

// 그리기마다 새로 만드는 무작위 식별자(그래프 그라데이션 id 등)는 고정 문자로
const stable = (value: string) =>
  value.replace(/graph-(overlay|preview)-[a-z0-9]+/g, 'graph-$1-UID');

const signatureOf = (element: Element): NodeSignature => {
  const classes = [...element.classList].sort();
  const attrs = sorted(
    [...element.attributes]
      .filter(({ name }) => name !== 'class' && name !== 'style')
      .map(({ name, value }) => [name, stable(value)]),
  );
  const { style } = element as HTMLElement;
  const styles: [string, string][] = [];
  for (let index = 0; index < (style?.length ?? 0); index += 1) {
    const name = style[index];
    styles.push([name, stable(style.getPropertyValue(name))]);
  }
  const text = [...element.childNodes]
    .filter((child) => child.nodeType === Node.TEXT_NODE)
    .map((child) => child.textContent ?? '')
    .join('')
    .trim();
  const children = [...element.children].map(signatureOf);
  return {
    tag: element.tagName.toLowerCase(),
    ...(classes.length > 0 ? { class: classes } : {}),
    ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
    ...(styles.length > 0 ? { style: sorted(styles) } : {}),
    ...(text ? { text } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
};

describe('그리기 약속 행렬', () => {
  let host: HTMLDivElement;
  let root: Root;

  const signature = () => [...host.children].map(signatureOf);

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useKeyStore.setState({ selectedKeyType: '4key' });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    resetAllKeySignals();
    resetAllAxisSignals();
    useEditStatePreviewStore.setState({ entries: [] });
    useGradientEditStore.setState({ session: null });
    previewOverlay.clearAll();
    state.inPanelSelection = false;
  });

  describe.each(Object.keys(CASES))('%s', (name) => {
    const { element, press, previewPressed, previewDomain } = CASES[name];

    it('오버레이 - 대기·입력', () => {
      state.scene = { nodes: [element] } as Scene;
      act(() => {
        root.render(
          <DocumentElementsLayer
            sceneId="4key"
            // 오버레이는 옛 종류 자신도 쌓인 칸에 그린다
            placement="stacked"
            live
            inputs={{ pointer: pointerInputSource }}
            overlayContext={{
              // 스프라이트 트리거(키 요소 id) → 키
              spriteKeyCanonicalMap: new Map([['key-1', 'KeyA']]),
              mode: '4key',
              keyCounterEnabled: true,
            }}
          />,
        );
      });
      const idle = signature();
      expect(idle.length).toBeGreaterThan(0);
      expect(idle).toMatchSnapshot('대기');
      if (press) {
        act(press);
        expect(signature()).toMatchSnapshot('입력');
      }
    });

    it('편집 화면 - 대기·눌림·편집 미리보기', () => {
      state.scene = { nodes: [element] } as Scene;
      const grid = () => (
        <>
          <DocumentGridLayer
            sceneId="4key"
            activeTool="move"
            placement="bottom"
            zoom={1}
            onElementContextMenu={() => undefined}
          />
          <DocumentGridLayer
            sceneId="4key"
            activeTool="move"
            placement="stacked"
            zoom={1}
            onElementContextMenu={() => undefined}
          />
        </>
      );
      act(() => root.render(grid()));
      const idle = signature();
      expect(idle.length).toBeGreaterThan(0);
      expect(idle).toMatchSnapshot('대기');
      if (previewPressed) {
        state.inPanelSelection = true;
        act(() => {
          useEditStatePreviewStore
            .getState()
            .publish(
              1,
              { kind: element.kind as 'key', id: element.id },
              'active',
            );
          root.render(grid());
        });
        expect(signature()).toMatchSnapshot('눌림 미리보기');
        act(() => useEditStatePreviewStore.setState({ entries: [] }));
      }
      if (previewDomain) {
        state.inPanelSelection = true;
        act(() => {
          // 옛 패널 미리보기(배경색)와 테두리 그라데이션 편집 세션
          previewOverlay.applyLocalPatchByIds(
            'contract-preview',
            '4key',
            [element.id],
            { backgroundColor: '#ABCDEF' },
            previewDomain as never,
          );
          useGradientEditStore.setState({
            session: {
              anchor: { kind: element.kind, id: element.id },
              surface: 'border',
              stateMode: 'idle',
              spec: GRADIENT,
            } as never,
          });
          root.render(grid());
        });
        expect(signature()).toMatchSnapshot('편집 미리보기');
      }
    });
  });
});
