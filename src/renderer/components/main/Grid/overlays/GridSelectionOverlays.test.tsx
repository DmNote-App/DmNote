// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CanonicalEditorDocumentV1,
  CanonicalKeyPosition,
} from '@src/types/editor';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import { makeCanonicalSpritePosition } from '@utils/sprite/spriteFixtures';
import GridSelectionOverlays from './GridSelectionOverlays';
import type { Bounds, ElementBounds } from '../handles/groupResizeUtils';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useStatItemStore } from '@stores/data/useStatItemStore';
import { useGraphItemStore } from '@stores/data/useGraphItemStore';
import { useKnobItemStore } from '@stores/data/useKnobItemStore';
import { useSpriteStore } from '@stores/data/useSpriteStore';
import {
  useGridSelectionStore,
  type SelectedElement,
} from '@stores/grid/useGridSelectionStore';
import { useSelectionRotationStore } from '@stores/grid/useSelectionRotationStore';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../handles/ResizeHandles', async () => {
  const { createElement } = await import('react');
  return {
    default: (props: Record<string, unknown>) =>
      createElement('div', {
        'data-resize-handles': props.elementId,
        'data-preview-bounds': JSON.stringify(props.previewBounds),
      }),
  };
});

vi.mock('../handles/GroupResizeHandles', async () => {
  const { createElement } = await import('react');
  return {
    default: (props: Record<string, unknown>) =>
      createElement('div', {
        'data-group-resize-handles': String(
          (props.selectedElements as unknown[]).length,
        ),
      }),
  };
});

vi.mock('../handles/GradientAxisHandle', async () => {
  const { createElement } = await import('react');
  return {
    default: () => createElement('div', { 'data-gradient-axis': '' }),
  };
});

vi.mock('../handles/SpriteCanvasHandles', async () => {
  const { createElement } = await import('react');
  return {
    default: () => createElement('div', { 'data-sprite-handles': '' }),
  };
});

const keyPosition = (
  id: string,
  dx: number,
  dy: number,
  rotation = 0,
): CanonicalKeyPosition =>
  ({ id, dx, dy, width: 30, height: 40, rotation } as CanonicalKeyPosition);

const FIRST_ID = '00000000-0000-4000-8000-000000000201';
const SECOND_ID = '00000000-0000-4000-8000-000000000202';
const PLUGIN_ELEMENT: PluginDisplayElementInternal = {
  id: 'one',
  fullId: 'plugin-1',
  pluginId: 'plugin',
  html: '<div>Plugin</div>',
  position: { x: 100, y: 30 },
  measuredSize: { width: 50, height: 20 },
};

describe('GridSelectionOverlays', () => {
  let host: HTMLDivElement;
  let root: Root;

  const renderOverlays = ({
    selectedElements = [
      { type: 'key', id: FIRST_ID, index: 0 },
    ] as SelectedElement[],
    spritePositions = {} as CanonicalEditorDocumentV1['spritePositions'],
    pluginElements = [] as PluginDisplayElementInternal[],
    hasGradientEditSession = false,
    hasSpritePoseSession = false,
    previewElementBounds = null as readonly ElementBounds[] | null,
    previewGroupBounds = null as Bounds | null,
    statPositions = {} as CanonicalEditorDocumentV1['statPositions'],
    graphPositions = {} as CanonicalEditorDocumentV1['graphPositions'],
    knobPositions = {} as CanonicalEditorDocumentV1['knobPositions'],
    zoom = 2,
    firstKeyRotation = 0,
    keyPositions = null as CanonicalEditorDocumentV1['keyPositions'] | null,
  } = {}) => {
    const positions = keyPositions ?? {
      '4key': [
        keyPosition(FIRST_ID, 10, 20, firstKeyRotation),
        keyPosition(SECOND_ID, 50, 60),
      ],
    };
    act(() => {
      useKeyStore.setState({
        selectedKeyType: '4key',
        canonicalPositions: positions,
      });
      useGridSelectionStore.setState({ selectedElements });
      useSpriteStore.setState({ positions: spritePositions });
      useStatItemStore.setState({ positions: statPositions });
      useGraphItemStore.setState({ positions: graphPositions });
      useKnobItemStore.setState({ positions: knobPositions });
      root.render(
        <GridSelectionOverlays
          selectedElements={selectedElements}
          positions={positions}
          statPositions={statPositions}
          graphPositions={graphPositions}
          knobPositions={knobPositions}
          spritePositions={spritePositions}
          mode="4key"
          pluginElements={pluginElements}
          zoom={zoom}
          panX={3}
          panY={4}
          hasGradientEditSession={hasGradientEditSession}
          hasSpritePoseSession={hasSpritePoseSession}
          previewBounds={{ x: 15, y: 25, width: 35, height: 45 }}
          previewGroupBounds={previewGroupBounds}
          previewElementBounds={previewElementBounds}
          onResizeStart={vi.fn()}
          onResize={vi.fn()}
          onResizeEnd={vi.fn()}
          onGroupResize={vi.fn()}
          onGroupResizeEnd={vi.fn()}
          getOtherElements={() => []}
        />,
      );
    });
  };

  beforeEach(() => {
    usePluginDisplayElementStore.setState({ definitions: new Map() });
    useStatItemStore.setState({ positions: {} });
    useGraphItemStore.setState({ positions: {} });
    useKnobItemStore.setState({ positions: {} });
    useSpriteStore.setState({ positions: {} });
    useSelectionRotationStore.setState({
      selectionKey: null,
      referenceRotation: 0,
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('단일 선택 윤곽과 리사이즈 핸들에 프리뷰 bounds를 적용한다', () => {
    renderOverlays();

    const outline = host.querySelector(
      '[data-grid-selection-outline]',
    ) as HTMLElement;
    expect(outline.style.left).toBe('32px');
    expect(outline.style.top).toBe('53px');
    expect(outline.style.width).toBe('72px');
    expect(outline.style.height).toBe('92px');
    expect(host.querySelector('[data-resize-handles]')).not.toBeNull();
    expect(host.querySelector('[data-group-resize-handles]')).toBeNull();
    expect(host.querySelector('[data-gradient-axis]')).not.toBeNull();
    expect(host.querySelector('[data-sprite-handles]')).not.toBeNull();
  });

  it('스프라이트 자세 편집 중에는 리사이즈 핸들만 숨긴다', () => {
    renderOverlays({ hasSpritePoseSession: true });

    expect(host.querySelector('[data-grid-selection-outline]')).not.toBeNull();
    expect(host.querySelector('[data-resize-handles]')).toBeNull();
    expect(host.querySelector('[data-sprite-handles]')).not.toBeNull();
  });

  it('그라데이션 편집 중에는 윤곽과 리사이즈 핸들만 숨긴다', () => {
    renderOverlays({ hasGradientEditSession: true });

    expect(host.querySelector('[data-grid-selection-outline]')).toBeNull();
    expect(host.querySelector('[data-resize-handles]')).toBeNull();
    expect(host.querySelector('[data-gradient-axis]')).not.toBeNull();
  });

  it('그룹 프리뷰 값은 단일 선택 윤곽에 영향을 주지 않는다', () => {
    renderOverlays({ previewElementBounds: [] });

    expect(host.querySelector('[data-grid-selection-outline]')).not.toBeNull();
  });

  it('그룹 리사이즈 중에도 각 요소의 프리뷰 윤곽을 표시한다', () => {
    renderOverlays({
      selectedElements: [
        { type: 'key', id: FIRST_ID, index: 0 },
        { type: 'key', id: SECOND_ID, index: 1 },
      ],
      previewGroupBounds: { x: 20, y: 30, width: 140, height: 160 },
      previewElementBounds: [
        {
          element: { type: 'key', id: FIRST_ID },
          bounds: { x: 20, y: 30, width: 60, height: 80 },
        },
        {
          element: { type: 'key', id: SECOND_ID },
          bounds: { x: 100, y: 110, width: 60, height: 80 },
        },
      ],
    });

    expect(host.querySelectorAll('[data-grid-selection-outline]')).toHaveLength(
      2,
    );
    expect(
      host
        .querySelector('[data-group-resize-handles]')
        ?.getAttribute('data-group-resize-handles'),
    ).toBe('2');
    const first = host.querySelector<HTMLElement>(
      '[data-grid-selection-outline]',
    )!;
    expect(first.style.left).toBe('42px');
    expect(first.style.top).toBe('63px');
    expect(first.style.width).toBe('122px');
    expect(first.style.borderTopColor).toBe('transparent');
    expect(first.style.borderLeftColor).toBe('transparent');
    expect(first.style.borderRightColor).not.toBe('transparent');
    expect(host.querySelector('[data-resize-handles]')).toBeNull();
    expect(
      host.querySelector('[data-rotation-handles="selection"]'),
    ).toBeNull();
  });

  it.each([0, 30])(
    '기존 각도 %s°의 다중 선택은 공통 틀과 개별 윤곽을 함께 표시한다',
    (rotation) => {
      renderOverlays({
        selectedElements: [
          { type: 'key', id: FIRST_ID, index: 0 },
          { type: 'key', id: SECOND_ID, index: 1 },
        ],
        firstKeyRotation: rotation,
      });
      expect(
        host.querySelectorAll('[data-grid-selection-outline]'),
      ).toHaveLength(2);
      expect(host.querySelectorAll('[data-group-resize-handles]')).toHaveLength(
        1,
      );
      expect(
        host.querySelectorAll('[data-rotation-handles="selection"]'),
      ).toHaveLength(1);
      expect(host.querySelectorAll('[data-rotate-corner]')).toHaveLength(4);
      expect(host.querySelector('[data-rotation-handles="native"]')).toBeNull();
    },
  );

  it('회전 요소가 든 플러그인 혼합 선택은 공통 틀이 없어 그룹 리사이즈도 닫는다', () => {
    const mixed = [
      { type: 'key', id: FIRST_ID, index: 0 },
      { type: 'plugin', id: 'plugin-1' },
    ] as SelectedElement[];
    renderOverlays({
      selectedElements: mixed,
      pluginElements: [PLUGIN_ELEMENT],
      firstKeyRotation: 30,
    });
    expect(host.querySelector('[data-group-resize-handles]')).toBeNull();
    expect(
      host.querySelector('[data-rotation-handles="selection"]'),
    ).toBeNull();
    const outlines = host.querySelectorAll<HTMLElement>(
      '[data-grid-selection-outline]',
    );
    expect(outlines).toHaveLength(2);
    expect(outlines[0].style.transform).toBe('rotate(30deg)');
    expect(outlines[1].style.transform).toBe('');

    // 회전이 없으면 기존 논리 상자 리사이즈 그대로
    renderOverlays({
      selectedElements: mixed,
      pluginElements: [PLUGIN_ELEMENT],
    });
    expect(host.querySelector('[data-group-resize-handles]')).not.toBeNull();
    expect(host.querySelectorAll('[data-grid-selection-outline]')).toHaveLength(
      2,
    );
  });

  it.each([0, 30])(
    '스프라이트 자세 45°와 배치 %s°의 플러그인 혼합 선택을 구분한다',
    (rotation) => {
      renderOverlays({
        selectedElements: [
          { type: 'sprite', id: FIRST_ID },
          { type: 'plugin', id: PLUGIN_ELEMENT.fullId },
        ],
        pluginElements: [PLUGIN_ELEMENT],
        spritePositions: {
          '4key': [
            makeCanonicalSpritePosition({
              id: FIRST_ID,
              rotation,
              idleTransform: { x: 10, y: -5, rotation: 45, scale: 1.2 },
            }),
          ],
        },
      });
      const outlines = host.querySelectorAll<HTMLElement>(
        '[data-grid-selection-outline]',
      );
      expect(outlines).toHaveLength(2);
      if (rotation === 0) {
        expect(
          host.querySelector('[data-group-resize-handles]'),
        ).not.toBeNull();
      } else {
        expect(host.querySelector('[data-group-resize-handles]')).toBeNull();
        expect(outlines[0].style.transform).toBe('rotate(30deg)');
      }
      expect(
        host.querySelector('[data-rotation-handles="selection"]'),
      ).toBeNull();
    },
  );

  it('3×3 배치에서 중앙을 제외하면 나머지 여덟 항목에만 윤곽을 표시한다', () => {
    const keys = Array.from({ length: 9 }, (_, index) =>
      keyPosition(`key-${index}`, (index % 3) * 50, Math.floor(index / 3) * 60),
    );
    renderOverlays({
      keyPositions: { '4key': keys },
      selectedElements: keys
        .filter((_, index) => index !== 4)
        .map(({ id }) => ({ type: 'key', id })),
    });
    expect(host.querySelectorAll('[data-grid-selection-outline]')).toHaveLength(
      8,
    );
    expect(
      host.querySelector('[data-grid-selection-element-id="key-4"]'),
    ).toBeNull();
    // 중앙 빈 선택을 마주 보는 변은 모두 남아 있어야 한다
    for (const [id, side] of [
      ['key-1', 'bottom'],
      ['key-3', 'right'],
      ['key-5', 'left'],
      ['key-7', 'top'],
    ]) {
      const outline = host.querySelector<HTMLElement>(
        `[data-grid-selection-element-id="${id}"]`,
      )!;
      expect(outline.style.getPropertyValue(`border-${side}-color`)).toBe(
        'var(--ui-selection-border-strong)',
      );
    }
  });

  it('모든 요소 종류에서 선택한 항목만 표시하고 바깥 박스와 겹친 변을 생략한다', () => {
    const selectedElements: SelectedElement[] = [
      { type: 'key', id: FIRST_ID },
      { type: 'stat', id: 'stat-1' },
      { type: 'graph', id: 'graph-1' },
      { type: 'knob', id: 'knob-1' },
      { type: 'sprite', id: 'sprite-1' },
      { type: 'plugin', id: PLUGIN_ELEMENT.fullId },
    ];
    renderOverlays({
      selectedElements,
      statPositions: {
        '4key': [{ ...keyPosition('stat-1', 60, 20), statType: 'kps' }],
      },
      graphPositions: {
        '4key': [
          {
            ...keyPosition('graph-1', 110, 20),
            statType: 'kps',
            graphType: 'line',
            graphSpeed: 1,
            graphColor: '#fff',
          },
        ],
      },
      knobPositions: {
        '4key': [
          {
            ...keyPosition('knob-1', 160, 20),
            axisId: 'x',
            sensitivity: 1,
            reverse: false,
          },
        ],
      },
      spritePositions: {
        '4key': [
          makeCanonicalSpritePosition({
            id: 'sprite-1',
            dx: 210,
            dy: 20,
            width: 30,
            height: 40,
          }),
        ],
      },
      pluginElements: [PLUGIN_ELEMENT],
    });
    const outlines = Array.from(
      host.querySelectorAll<HTMLElement>('[data-grid-selection-outline]'),
    );
    expect(
      outlines.map((outline) => outline.dataset.gridSelectionElementType),
    ).toEqual(['key', 'stat', 'graph', 'knob', 'sprite', 'plugin']);
    expect(
      host.querySelector(`[data-grid-selection-element-id="${SECOND_ID}"]`),
    ).toBeNull();
    expect(outlines[0].style.borderTopColor).toBe('transparent');
    expect(outlines[0].style.borderBottomColor).toBe('transparent');
    expect(outlines[0].style.borderLeftColor).toBe('transparent');
    expect(outlines[0].style.borderRightColor).not.toBe('transparent');
    expect(outlines[4].style.borderRightColor).toBe('transparent');
    expect(outlines[4].style.borderLeftColor).not.toBe('transparent');
    // 내부 플러그인은 네 변을 유지하고 크기 조절 불가 표시도 보존
    expect(outlines[5].style.borderStyle).toBe('dashed');
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      expect(
        outlines[5].style.getPropertyValue(
          `border-${side.toLowerCase()}-color`,
        ),
      ).not.toBe('transparent');
    }
    expect(host.querySelector('[data-resize-handles]')).toBeNull();
  });

  it.each([0.25, 1, 4])(
    '배율 %s에서도 개별 윤곽 두께는 바깥 박스와 같은 화면 기준 1px이다',
    (zoom) => {
      renderOverlays({
        selectedElements: [
          { type: 'key', id: FIRST_ID },
          { type: 'key', id: SECOND_ID },
        ],
        zoom,
      });
      const outlines = host.querySelectorAll<HTMLElement>(
        '[data-grid-selection-outline]',
      );
      expect(outlines).toHaveLength(2);
      expect(outlines[0].style.borderWidth).toBe('1px');
      expect(outlines[0].style.borderRightColor).toBe(
        'var(--ui-selection-border-strong)',
      );
      expect(outlines[0].style.width).toBe(`${30 * zoom + 2}px`);
      expect(outlines[0].style.borderTopColor).toBe('transparent');
      expect(outlines[1].style.borderBottomColor).toBe('transparent');
    },
  );

  it('그라데이션 편집은 회전 혼합 선택의 개별 윤곽도 숨긴다', () => {
    renderOverlays({
      selectedElements: [
        { type: 'key', id: FIRST_ID },
        { type: 'plugin', id: PLUGIN_ELEMENT.fullId },
      ],
      pluginElements: [PLUGIN_ELEMENT],
      firstKeyRotation: 30,
      hasGradientEditSession: true,
    });
    expect(host.querySelector('[data-grid-selection-outline]')).toBeNull();
    expect(host.querySelector('[data-group-resize-handles]')).toBeNull();
    expect(
      host.querySelector('[data-rotation-handles="selection"]'),
    ).toBeNull();
  });

  it('그라데이션 편집은 다중 선택의 회전 진입점도 숨긴다', () => {
    renderOverlays({
      selectedElements: [
        { type: 'key', id: FIRST_ID, index: 0 },
        { type: 'key', id: SECOND_ID, index: 1 },
      ],
      hasGradientEditSession: true,
    });
    expect(
      host.querySelector('[data-rotation-handles="selection"]'),
    ).toBeNull();
    expect(host.querySelector('[data-group-resize-handles]')).toBeNull();
    expect(host.querySelector('[data-gradient-axis]')).not.toBeNull();
  });

  it('단독 스프라이트는 배치 회전을 표시하고 자세 편집 중에는 자세 핸들에 자리를 내준다', () => {
    const options = {
      selectedElements: [{ type: 'sprite' as const, id: FIRST_ID }],
      spritePositions: {
        '4key': [makeCanonicalSpritePosition({ id: FIRST_ID, rotation: 90 })],
      },
    };
    renderOverlays(options);
    expect(
      host.querySelectorAll('[data-rotation-handles="native"]'),
    ).toHaveLength(1);
    expect(host.querySelectorAll('[data-rotate-corner]')).toHaveLength(4);
    expect(
      (host.querySelector('[data-grid-selection-outline]') as HTMLElement).style
        .transform,
    ).toBe('rotate(90deg)');
    renderOverlays({ ...options, hasSpritePoseSession: true });
    expect(host.querySelector('[data-rotation-handles="native"]')).toBeNull();
    expect(host.querySelector('[data-sprite-handles]')).not.toBeNull();
    renderOverlays(options);
    expect(host.querySelectorAll('[data-rotate-corner]')).toHaveLength(4);
  });
});
