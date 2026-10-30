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
  stepDocumentElements,
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

  it('한 칸 앞·뒤로는 부모 안에서 바로 위·아래 형제를 넘는다 (함께 고른 것끼리는 넘지 않는다)', async () => {
    const tracker = (id: string) => ({
      type: 'element',
      id,
      kind: 'cursorTracker',
      frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    });
    mocks.scene = {
      nodes: ['a', 'b', 'c', 'd'].map(tracker),
    };
    await stepDocumentElements('4key', ['a', 'c'], 'forward');
    // 위에서부터: c는 d 위로(끝), a는 b 위로(원래 c 자리 앞)
    expect(mocks.edit.mock.calls[0][0]).toEqual([
      { op: 'move', scene: '4key', ids: ['c'], parent: null, index: null },
      { op: 'move', scene: '4key', ids: ['a'], parent: null, index: 2 },
    ]);
    mocks.edit.mockClear();
    await stepDocumentElements('4key', ['b', 'c'], 'backward');
    // 아래에서부터: b는 a 아래로, c는 a 다음(원래 b 자리)으로 - b를 넘지 않는다
    expect(mocks.edit.mock.calls[0][0]).toEqual([
      { op: 'move', scene: '4key', ids: ['b'], parent: null, index: 0 },
      { op: 'move', scene: '4key', ids: ['c'], parent: null, index: 1 },
    ]);
    mocks.edit.mockClear();
    // 이미 맨 위면 아무것도 보내지 않는다
    await stepDocumentElements('4key', ['d'], 'forward');
    expect(mocks.edit).not.toHaveBeenCalled();
  });
});
