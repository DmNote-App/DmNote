import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  scene: {
    nodes: [
      {
        type: 'element',
        id: 't1',
        kind: 'cursorTracker',
        frame: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
      },
    ],
  },
}));

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({ getScene: () => mocks.scene }),
}));

import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import {
  buildDocumentPaste,
  copyDocumentSelection,
  useDocumentClipboardStore,
} from './documentClipboard';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

const tracker = (id: string, x: number, y = 10) => ({
  type: 'element' as const,
  id,
  kind: 'cursorTracker',
  frame: { x, y, width: 120, height: 120, rotation: 0 },
  values: { mode: 'motion' },
});

describe('트리 요소 붙여넣기', () => {
  it('새 id로 옛 종류와 같은 만큼 비켜 넣고 겹치는 순서를 지킨다', () => {
    let next = 0;
    const { ops, ids } = buildDocumentPaste(
      '5key',
      [tracker('a', 0), tracker('b', 50)],
      () => `new-${(next += 1)}`,
    );
    expect(ids).toEqual(['new-1', 'new-2']);
    expect(ops).toEqual([
      {
        op: 'insert',
        scene: '5key',
        parent: null,
        index: null,
        node: tracker('new-1', 20, 30),
      },
      {
        op: 'insert',
        scene: '5key',
        parent: null,
        index: null,
        node: tracker('new-2', 70, 30),
      },
    ]);
  });

  it('그룹은 안쪽 요소까지 새 id를 붙인다', () => {
    let next = 0;
    const { ops, ids } = buildDocumentPaste(
      's',
      [{ type: 'group', id: 'g', name: 'G', children: [tracker('a', 0)] }],
      () => `n${(next += 1)}`,
    );
    expect(ids).toEqual(['n2']);
    expect(ops[0]).toMatchObject({
      node: {
        type: 'group',
        id: 'n1',
        children: [{ id: 'n2', frame: { x: 20, y: 30 } }],
      },
    });
  });
});

describe('옛 종류 요소 붙여넣기', () => {
  it('원본의 배열 자리·z는 버리고 옛 칸만 남긴다', () => {
    const knob = {
      ...tracker('k', 0),
      kind: 'knob',
      legacy: { index: 3, zIndex: 9, fields: { noteColor: '#fff' } },
    };
    const { ops } = buildDocumentPaste('4key', [knob as never], () => 'n');
    expect(
      (ops[0] as unknown as { node: { legacy: unknown } }).node.legacy,
    ).toEqual({
      fields: { noteColor: '#fff' },
    });
  });
});

describe('트리 요소 복사', () => {
  beforeEach(() => {
    useGridSelectionStore.setState({ clipboard: [{ type: 'key' } as never] });
    useDocumentSelectionStore.setState({
      sceneId: '4key',
      selectedIds: ['t1'],
    });
    useDocumentClipboardStore.getState().clear();
  });

  it('복사하면 옛 클립보드를 비운다 - 우클릭 복제처럼 옛 요소를 함께 복사하지 않은 경우', () => {
    expect(copyDocumentSelection()).toBe(true);
    expect(useGridSelectionStore.getState().clipboard).toEqual([]);
    expect(useDocumentClipboardStore.getState().nodes).toHaveLength(1);
  });

  it('같은 키 입력에서 옛 요소도 복사했으면 옛 클립보드를 지킨다', () => {
    copyDocumentSelection({ keepLegacyClipboard: true });
    expect(useGridSelectionStore.getState().clipboard).toHaveLength(1);
  });
});
