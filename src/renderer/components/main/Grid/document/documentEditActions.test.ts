import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Op } from '@src/types/generated/elementDocument';

const mocks = vi.hoisted(() => ({
  edit: vi.fn((_ops: Op[]) =>
    Promise.resolve({
      status: 'committed' as const,
      revision: 2,
      changes: { scenes: {} },
    }),
  ),
}));

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({ edit: mocks.edit }),
}));

import { insertDocumentElement } from './documentEditActions';

describe('트리 문서 편집 동작', () => {
  beforeEach(() => mocks.edit.mockClear());

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
});
