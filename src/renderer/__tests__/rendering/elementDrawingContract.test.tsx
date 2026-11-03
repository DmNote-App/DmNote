// @vitest-environment jsdom
// 그리기 약속 행렬 - 종류 × 편집 화면/오버레이 × 상태로 그린 DOM의 클래스·data 속성·CSS 변수(변수를 읽는
// 인라인 스타일 포함)를 지금 그리기로 고정한다. 7단계에서 종류마다 그리기를 한 벌로 합칠 때 사용자 CSS가
// 기대는 모양이 그대로인지 이 기준값으로 확인한다 (설계 3.6·3.10)
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
  }),
);

vi.mock('@components/main/Grid/document/treeEditedSelection', () => ({
  useInPanelSelection: () => state.inPanelSelection,
}));

const { default: DocumentElementsLayer } = await import(
  '@src/renderer/elementKinds/runtime/DocumentElementsLayer'
);
const { elementKindDefinition } = await import(
  '@src/renderer/elementKinds/runtime/elementKindRegistry'
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

// 종류마다 하나 - 대기 그림과 눌림 그림이 갈리는 칸을 채운다
const ELEMENTS: Record<string, ElementNode> = {
  key: node('key-1', 'key', {
    input: { type: 'key', slot: 'KeyA' },
    bundles: {
      surface: { ...surface, activeBackgroundColor: '#445566' },
      font: { fontSize: 14, fontColor: '#ffffff' },
    },
  }),
  stat: node('stat-1', 'stat', {
    values: { statType: 'kps', displayText: 'KPS', count: 0 },
    bundles: { surface, font: { fontSize: 12 } },
  }),
  graph: node('graph-1', 'graph', {
    frame: { x: 4, y: 8, width: 200, height: 100, rotation: 0 },
    values: { statType: 'kps', graphType: 'line' },
    bundles: { surface },
  }),
  knob: node('knob-1', 'knob', {
    input: { type: 'axis', axisId: 'axis-1' },
    bundles: { surface: { ...surface, activeBackgroundColor: '#445566' } },
  }),
  sprite: node('sprite-1', 'sprite', {
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
};

// 입력 상태 - 키·스프라이트는 키 누름, 노브는 축 회전 (스탯·그래프는 입력으로 바뀌는 그림이 없다)
const PRESS: Record<string, (() => void) | undefined> = {
  key: () => setKeyActive('KeyA', true),
  knob: () => addAxisDelta('axis-1', 0.25),
  sprite: () => setKeyActive('KeyA', true),
};

// 편집 화면 눌림 미리보기를 그리는 종류
const PREVIEW_PRESSED = new Set(['key', 'knob']);

interface NodeSignature {
  tag: string;
  class?: string[];
  data?: Record<string, string>;
  vars?: Record<string, string>;
  children?: NodeSignature[];
}

const signatureOf = (element: Element): NodeSignature => {
  const classes = [...element.classList].sort();
  const data = Object.fromEntries(
    [...element.attributes]
      .filter((attribute) => attribute.name.startsWith('data-'))
      .map((attribute) => [attribute.name, attribute.value])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const vars: Record<string, string> = {};
  const { style } = element as HTMLElement;
  for (let index = 0; index < (style?.length ?? 0); index += 1) {
    const name = style[index];
    const value = style.getPropertyValue(name);
    if (name.startsWith('--') || value.includes('var(--')) vars[name] = value;
  }
  const children = [...element.children].map(signatureOf);
  return {
    tag: element.tagName.toLowerCase(),
    ...(classes.length > 0 ? { class: classes } : {}),
    ...(Object.keys(data).length > 0 ? { data } : {}),
    ...(Object.keys(vars).length > 0
      ? {
          vars: Object.fromEntries(
            Object.entries(vars).sort(([left], [right]) =>
              left.localeCompare(right),
            ),
          ),
        }
      : {}),
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
    state.inPanelSelection = false;
  });

  describe.each(Object.keys(ELEMENTS))('%s', (kind) => {
    const element = ELEMENTS[kind];

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
      const press = PRESS[kind];
      if (press) {
        act(press);
        expect(signature()).toMatchSnapshot('입력');
      }
    });

    it('편집 화면 - 대기·눌림 미리보기', () => {
      const Render = elementKindDefinition(kind)?.render;
      expect(Render).toBeDefined();
      // 편집 화면 감싸는 쪽처럼 - 눌림 미리보기는 스토어 발행과 함께 입력으로 넘긴다
      const face = (pressed = false) => (
        <Render
          element={element}
          values={(element.values ?? {}) as never}
          bundles={element.bundles as never}
          live={false}
          inputs={pressed ? { pressed: { value: true } } : {}}
        />
      );
      act(() => root.render(face()));
      expect(signature()).toMatchSnapshot('대기');
      if (PREVIEW_PRESSED.has(kind)) {
        state.inPanelSelection = true;
        act(() => {
          useEditStatePreviewStore
            .getState()
            .publish(1, { kind: kind as 'key', id: element.id }, 'active');
          root.render(face(true));
        });
        expect(signature()).toMatchSnapshot('눌림 미리보기');
      }
    });
  });
});
