import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useKeyStore } from '@stores/data/useKeyStore';

const mocks = vi.hoisted(() => ({
  elements: new Map<string, { kind: string }>(),
  edit: vi.fn(async () => ({ status: 'committed', revision: 2, changes: {} })),
}));

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (scene: string, id: string) =>
      mocks.elements.get(`${scene}/${id}`),
    edit: mocks.edit,
  }),
}));

vi.mock('../../model/elementIdMap', () => ({
  resolveElementById: (_type: string, id: string) =>
    id === 'other-mode' ? { mode: '8key', index: 0 } : null,
}));

const { rebindKeySlotById, treeKeySlot } = await import('./keySlotOps');

describe('키 슬롯 바꾸기', () => {
  beforeEach(() => {
    mocks.edit.mockClear();
    mocks.elements.clear();
    useKeyStore.setState({ selectedKeyType: '4key' });
  });

  it('트리 입력 연산 하나로 보낸다', async () => {
    mocks.elements.set('4key/k1', { kind: 'key' });
    await expect(rebindKeySlotById('k1', 'KeyZ')).resolves.toBe(true);
    expect(mocks.edit).toHaveBeenCalledWith([
      {
        op: 'setInput',
        scene: '4key',
        id: 'k1',
        input: { type: 'key', slot: 'KeyZ' },
      },
    ]);
  });

  it('지금 탭에 없으면 그 키가 있는 탭에 보내고, 키가 아니거나 없으면 보내지 않는다', async () => {
    mocks.elements.set('8key/other-mode', { kind: 'key' });
    mocks.elements.set('4key/s1', { kind: 'stat' });
    await expect(rebindKeySlotById('other-mode', 'KeyX')).resolves.toBe(true);
    expect(mocks.edit).toHaveBeenLastCalledWith([
      expect.objectContaining({ scene: '8key', id: 'other-mode' }),
    ]);
    mocks.edit.mockClear();
    await expect(rebindKeySlotById('s1', 'KeyX')).resolves.toBe(false);
    await expect(rebindKeySlotById('missing', 'KeyX')).resolves.toBe(false);
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it('거부되면 false', async () => {
    mocks.elements.set('4key/k1', { kind: 'key' });
    mocks.edit.mockResolvedValueOnce({ status: 'rejected' } as never);
    await expect(rebindKeySlotById('k1', 'KeyZ')).resolves.toBe(false);
  });

  it('트리 입력 슬롯을 읽는다', () => {
    expect(treeKeySlot({ input: { type: 'key', slot: 'KeyA' } } as never)).toBe(
      'KeyA',
    );
    expect(treeKeySlot({ input: { type: 'axis', axisId: 'x' } } as never)).toBe(
      null,
    );
    expect(treeKeySlot(undefined)).toBe(null);
  });
});
