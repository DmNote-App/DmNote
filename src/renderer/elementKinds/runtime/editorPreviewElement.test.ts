import { afterEach, describe, expect, it } from 'vitest';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { previewOverlay } from '@src/renderer/editor/runtime/gesture/previewOverlay';
import type { GradientEditSession } from '@stores/grid/useGradientEditStore';
import type { GradientSpec } from '@src/types/color';
import {
  editorPreviewElementOf,
  withGradientSession,
} from './editorPreviewElement';

const graph = {
  type: 'element',
  id: 'graph-1',
  kind: 'graph',
  frame: { x: 0, y: 0, width: 200, height: 100, rotation: 0 },
  values: { graphColor: '#86EFAC', graphType: 'line' },
  bundles: { surface: { backgroundColor: '#111111', borderWidth: 2 } },
} as unknown as ElementNode;

const spec = {
  type: 'linear',
  angle: 90,
  stops: [],
} as unknown as GradientSpec;

const session = (
  surface: GradientEditSession['surface'],
  stateMode: GradientEditSession['stateMode'] = 'idle',
) => ({ surface, stateMode, spec } as GradientEditSession);

describe('편집 화면 미리보기 요소', () => {
  afterEach(() => previewOverlay.clearAll());

  it('미리보기가 없으면 같은 요소다', () => {
    expect(editorPreviewElementOf(graph, '4key')).toBe(graph);
  });

  it('옛 칸 미리보기를 고유 값·기능 묶음·공통 정보로 얹고, 미리보기가 그대로면 같은 객체다', () => {
    previewOverlay.applyLocalPatchByIds(
      'session-1',
      '4key',
      [graph.id],
      { graphColor: '#FF0000', backgroundColor: '#222222', className: 'glow' },
      'graphPosition',
    );
    const shown = editorPreviewElementOf(graph, '4key');
    expect(shown.values).toEqual({ graphColor: '#FF0000', graphType: 'line' });
    expect(shown.bundles?.surface).toMatchObject({
      backgroundColor: '#222222',
      borderWidth: 2,
    });
    expect(shown.className).toBe('glow');
    expect(editorPreviewElementOf(graph, '4key')).toBe(shown);
    // 다른 장면의 미리보기는 얹지 않는다
    expect(editorPreviewElementOf(graph, '5key')).toBe(graph);
  });

  it('트리에만 있는 종류는 옛 미리보기가 없다', () => {
    const tracker = { ...graph, kind: 'cursorTracker' } as ElementNode;
    expect(editorPreviewElementOf(tracker, '4key')).toBe(tracker);
  });
});

describe('그라데이션 편집 세션', () => {
  const bundles = { surface: { backgroundColor: '#111111' } };

  it('편집 중인 표면의 대기·입력 칸을 세션 spec으로 덮는다', () => {
    expect(withGradientSession(bundles, session('background'))).toEqual({
      surface: { backgroundColor: '#111111', backgroundGradient: spec },
    });
    expect(withGradientSession(bundles, session('border', 'active'))).toEqual({
      surface: { backgroundColor: '#111111', activeBorderGradient: spec },
    });
    expect(withGradientSession(bundles, session('font'))).toEqual({
      ...bundles,
      font: { fontGradient: spec },
    });
  });

  it('세션이 없거나 화면에 칠하지 않는 표면이면 그대로다', () => {
    expect(withGradientSession(bundles, null)).toBe(bundles);
    expect(withGradientSession(bundles, session('noteBody'))).toBe(bundles);
  });
});
