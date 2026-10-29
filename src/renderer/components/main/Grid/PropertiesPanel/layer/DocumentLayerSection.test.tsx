import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocumentSelectionStore } from '../../document/useDocumentSelectionStore';
import DocumentLayerSection from './DocumentLayerSection';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  scene: null as unknown,
  edit: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  useElementDocumentScene: () => mocks.scene,
  getElementDocumentStore: () => ({ getScene: () => mocks.scene }),
}));

vi.mock('../../document/documentEditActions', () => ({
  editDocument: mocks.edit,
  setDocumentCommon: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@utils/core/platform', () => ({ isMac: () => true }));
vi.mock('@assets/svgs/close_eye.svg', () => ({ default: () => null }));
vi.mock('@assets/svgs/open_eye.svg', () => ({ default: () => null }));

const tracker = (id: string) => ({
  type: 'element',
  id,
  kind: 'cursorTracker',
  frame: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
});

const t = (key: string) => key;

describe('레이어 패널 트리 요소 구역', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.edit.mockClear();
    mocks.scene = {
      nodes: [
        tracker('a'),
        {
          type: 'group',
          id: 'G',
          name: '그룹',
          children: [tracker('b'), tracker('c')],
        },
      ],
    };
    act(() => root.render(<DocumentLayerSection sceneId="4key" t={t} />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useDocumentSelectionStore.getState().clear();
  });

  const rowIds = () =>
    [
      ...container.querySelectorAll<HTMLElement>('[data-document-layer-index]'),
    ].map(
      (row) => row.dataset.documentLayerGroup ?? row.dataset.documentLayerRow,
    );

  it('그룹 행 아래에 안쪽 요소를 위→아래로 보이고 접으면 숨긴다', async () => {
    expect(rowIds()).toEqual(['G', 'c', 'b', 'a']);
    // 접기는 그린 뒤에 확정한다 (옛 그룹 행과 같은 버튼)
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-expanded]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(rowIds()).toEqual(['G', 'a']);
  });

  it('그룹 행을 누르면 안쪽 요소 전체를, 보조키로는 넣고 뺀다', () => {
    const groupRow = container.querySelector<HTMLElement>(
      '[data-document-layer-group="G"]',
    )!;
    act(() => groupRow.click());
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([
      'b',
      'c',
    ]);
    const a = container.querySelector<HTMLElement>(
      '[data-document-layer-row="a"]',
    )!;
    act(() => {
      a.dispatchEvent(
        new MouseEvent('click', { bubbles: true, metaKey: true }),
      );
    });
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('그룹 숨김과 이름은 트리 쓰기로 바꾼다', () => {
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="toggle group visibility"]',
        )!
        .click(),
    );
    expect(mocks.edit).toHaveBeenCalledWith([
      { op: 'setGroup', scene: '4key', id: 'G', hidden: true },
    ]);
  });
});
