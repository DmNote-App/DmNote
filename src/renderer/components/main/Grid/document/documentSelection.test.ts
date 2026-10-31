import { describe, expect, it } from 'vitest';

import type { Scene } from '@src/types/generated/elementDocument';
import {
  documentIdsInRect,
  documentRangeSelection,
  toggleDocumentId,
} from './documentSelection';

const tracker = (id: string, x: number, y: number, hidden = false) => ({
  type: 'element' as const,
  id,
  kind: 'cursorTracker',
  frame: { x, y, width: 10, height: 10, rotation: 0 },
  hidden,
});

const scene: Scene = {
  nodes: [
    tracker('a', 0, 0),
    tracker('b', 100, 0),
    tracker('c', 200, 200),
    tracker('hidden', 50, 0, true),
    // 플러그인 요소는 트리 선택 계산이 아니라 플러그인 몫(인자)으로 고른다
    {
      type: 'element',
      id: 'demo::k1',
      kind: 'plugin:demo',
      frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
    },
  ],
};

describe('트리 요소 선택 계산', () => {
  it('보조키 클릭은 넣고 빼기를 오간다', () => {
    expect(toggleDocumentId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleDocumentId(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('마퀴는 겹치는 트리 요소만 겹치는 순서대로 고르고 숨긴 요소는 뺀다', () => {
    expect(
      documentIdsInRect(scene, { left: -5, top: -5, width: 120, height: 20 }),
    ).toEqual(['a', 'b']);
    expect(
      documentIdsInRect(scene, { left: 500, top: 500, width: 5, height: 5 }),
    ).toEqual([]);
  });

  it('Shift 클릭은 마지막으로 누른 요소 영역과 누른 요소를 감싸는 영역 안의 트리 요소와 플러그인 요소를 고른다', () => {
    const anchor = { x: 0, y: 0, width: 10, height: 10 };
    const plugin = (
      fullId: string,
      x: number,
      tabId?: string,
      measured = true,
    ) => ({
      fullId,
      tabId,
      position: { x, y: 0 },
      measuredSize: measured ? { width: 10, height: 10 } : undefined,
    });
    const pluginElements = [
      plugin('p:in', 50),
      plugin('p:other-tab', 50, 'other'),
      plugin('p:unmeasured', 50, undefined, false),
      plugin('p:out', 500),
    ];
    const frame = { x: 100, y: 0, width: 10, height: 10, rotation: 0 };
    expect(
      documentRangeSelection(scene, anchor, frame, pluginElements, 'tab'),
    ).toEqual({
      treeIds: ['a', 'b'],
      plugins: [{ type: 'plugin', id: 'p:in' }],
    });
    // 기준이 플러그인 요소여도 같은 영역 규칙
    expect(
      documentRangeSelection(
        scene,
        { x: 500, y: 0, width: 10, height: 10 },
        frame,
        pluginElements,
        'tab',
      ),
    ).toEqual({
      treeIds: ['b'],
      plugins: [{ type: 'plugin', id: 'p:out' }],
    });
  });
});
