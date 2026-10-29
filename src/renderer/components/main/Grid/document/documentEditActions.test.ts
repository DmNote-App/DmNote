import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Op } from '@src/types/generated/elementDocument';

const mocks = vi.hoisted(() => ({
  scene: undefined as unknown,
  edit: vi.fn((_ops: Op[]) =>
    Promise.resolve({
      status: 'committed' as const,
      revision: 2,
      changes: { scenes: {} },
    }),
  ),
}));

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    edit: mocks.edit,
    getScene: () => mocks.scene,
  }),
}));

import {
  groupDocumentElements,
  insertDocumentElement,
  moveDocumentElementTo,
} from './documentEditActions';

describe('트리 문서 편집 동작', () => {
  beforeEach(() => {
    mocks.edit.mockClear();
    mocks.scene = undefined;
  });

  it('새 요소는 정의의 기본값을 채워 보내 응답 전에도 제대로 그린다', async () => {
    const id = await insertDocumentElement('4key', 'cursorTracker', {
      x: 10.4,
      y: 20.6,
    });
    expect(id).toEqual(expect.any(String));
    const [op] = mocks.edit.mock.calls[0][0];
    expect(op).toMatchObject({
      op: 'insert',
      node: {
        id,
        kind: 'cursorTracker',
        frame: { x: 10, y: 21, width: 120, height: 120, rotation: 0 },
        values: {
          mode: 'motion',
          sensitivity: 1,
          returnMs: 150,
          monitor: null,
          dotColor: '#FFFFFF',
        },
      },
    });
  });

  it('하나만 골랐거나 이미 한 그룹 전체면 묶지 않는다', async () => {
    const tracker = (id: string) => ({
      type: 'element',
      id,
      kind: 'cursorTracker',
      frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    });
    mocks.scene = {
      nodes: [
        tracker('a'),
        {
          type: 'group',
          id: 'G',
          name: 'G',
          children: [tracker('b'), tracker('c')],
        },
      ],
    };
    await groupDocumentElements('4key', ['a'], 'Group');
    await groupDocumentElements('4key', ['b', 'c'], 'Group');
    expect(mocks.edit).not.toHaveBeenCalled();
    await groupDocumentElements('4key', ['a', 'b', 'c'], 'Group');
    expect(mocks.edit.mock.calls[0][0][0]).toMatchObject({
      op: 'group',
      ids: ['a', 'G'],
    });
  });

  it('맨 앞·뒤로는 그룹 소속을 지킨 채 부모 안에서 옮긴다', async () => {
    const tracker = (id: string) => ({
      type: 'element',
      id,
      kind: 'cursorTracker',
      frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    });
    mocks.scene = {
      nodes: [
        tracker('a'),
        {
          type: 'group',
          id: 'G',
          name: 'G',
          children: [tracker('b'), tracker('c')],
        },
      ],
    };
    await moveDocumentElementTo('4key', ['b', 'a'], 'front');
    expect(mocks.edit.mock.calls[0][0]).toEqual([
      { op: 'move', scene: '4key', ids: ['a'], parent: null, index: null },
      { op: 'move', scene: '4key', ids: ['b'], parent: 'G', index: null },
    ]);
  });
});
