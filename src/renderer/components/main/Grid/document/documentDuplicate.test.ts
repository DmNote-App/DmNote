import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  elements: new Map<string, unknown>(),
  edit: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) => mocks.elements.get(id),
  }),
}));

vi.mock('./documentEditActions', () => ({ editDocument: mocks.edit }));

const { beginDocumentDuplicate, placeDocumentDuplicate } = await import(
  './documentDuplicate'
);

const frame = { x: 10, y: 20, width: 60, height: 40, rotation: 0 };

describe('우클릭 복제', () => {
  beforeEach(() => {
    mocks.edit.mockClear();
    mocks.elements.clear();
    mocks.elements.set('k1', {
      type: 'element',
      id: 'k1',
      kind: 'key',
      frame,
      input: { type: 'key', slot: 'KeyA' },
    });
  });

  it('고스트는 지금 트리 값과 키 이름으로 그린다', () => {
    const state = beginDocumentDuplicate('4key', 'k1');
    expect(state).toMatchObject({
      elementType: 'key',
      sourceId: 'k1',
      position: { id: 'k1', dx: 10, dy: 20, width: 60, height: 40 },
    });
    expect(state?.keyName).toBeTruthy();
    expect(beginDocumentDuplicate('4key', 'missing')).toBeNull();
  });

  it('고른 자리에 새 id 사본을 장면 맨 위로 넣는다', async () => {
    const state = beginDocumentDuplicate('4key', 'k1')!;
    await placeDocumentDuplicate('4key', state, 100, 200);
    const ops = (mocks.edit.mock.calls[0] as unknown[])[0] as Array<{
      op: string;
      parent: string | null;
      index: number | null;
      node: { id: string; frame: typeof frame; input: unknown };
    }>;
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: 'insert', parent: null, index: null });
    expect(ops[0].node.id).not.toBe('k1');
    expect(ops[0].node.frame).toMatchObject({ x: 100, y: 200, width: 60 });
    expect(ops[0].node.input).toEqual({ type: 'key', slot: 'KeyA' });
  });
});
