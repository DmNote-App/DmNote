import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { previewOverlay } from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { useDocumentFramePreviewStore } from '@stores/grid/useDocumentFramePreviewStore';
import { useTreeFramedPositions } from './useTreeFramedPositions';

const tree = vi.hoisted(() => ({ scene: null as unknown }));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  useElementDocumentScene: () => tree.scene,
  getElementDocumentStore: () => undefined,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const element = (id: string, kind: string, x: number, hidden?: boolean) => ({
  type: 'element',
  id,
  kind,
  frame: { x, y: 1, width: 60, height: 50, rotation: 0 },
  bundles: { counter: { counter: { enabled: true } } },
  ...(hidden ? { hidden: true } : {}),
});

describe('트리 틀을 얹은 그 종류 요소 목록', () => {
  let root: Root;
  const results: Array<readonly Record<string, unknown>[]> = [];
  const Probe = ({ kind }: { kind: string }) => {
    results.push(useTreeFramedPositions(kind, '4key'));
    return null;
  };
  const render = (kind = 'key') => {
    act(() => root.render(<Probe kind={kind} />));
    return results[results.length - 1];
  };

  beforeEach(() => {
    tree.scene = {
      nodes: [
        element('k1', 'key', 0),
        element('s1', 'stat', 10),
        {
          type: 'group',
          id: 'g1',
          hidden: true,
          children: [element('k2', 'key', 20)],
        },
        element('k3', 'key', 30, true),
      ],
    };
    root = createRoot(document.createElement('div'));
  });

  afterEach(() => {
    act(() => root.unmount());
    previewOverlay.clearAll();
    useDocumentFramePreviewStore.setState({ frames: {} });
  });

  it('트리 순서로 그 종류만, 숨긴 그룹 안과 숨긴 요소는 숨김', () => {
    const latest = render();
    expect(latest.map(({ id, dx, hidden }) => [id, dx, hidden])).toEqual([
      ['k1', 0, false],
      ['k2', 20, true],
      ['k3', 30, true],
    ]);
    expect(latest[0]).toMatchObject({
      width: 60,
      height: 50,
      counter: { enabled: true },
    });
  });

  it('끌기·크기 조절 틀 미리보기와 패널 편집 미리보기를 얹는다', () => {
    useDocumentFramePreviewStore.setState({
      frames: { k1: { x: 5, y: 6, width: 70, height: 80, rotation: 15 } },
    });
    previewOverlay.applyLocalPatchByIds(
      '33333333-3333-4333-8333-333333333333',
      '4key',
      ['k3'],
      { dx: 99 },
      'keyPosition',
    );
    const latest = render();
    expect(latest[0]).toMatchObject({
      dx: 5,
      dy: 6,
      width: 70,
      height: 80,
      rotation: 15,
    });
    expect(latest[2]).toMatchObject({ dx: 99 });
  });

  it('바뀐 것이 없으면 같은 객체 - 카운터 잎의 메모가 다시 그리지 않는다', () => {
    const first = render();
    expect(render()[0]).toBe(first[0]);
    expect(render('stat').map(({ id }) => id)).toEqual(['s1']);
  });
});
