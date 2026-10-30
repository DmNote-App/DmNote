import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  move: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) =>
      id === 't1'
        ? { frame: { x: 10, y: 20, width: 30, height: 30, rotation: 0 } }
        : undefined,
  }),
}));
vi.mock('./documentEditActions', () => ({
  moveDocumentElements: mocks.move,
}));

import { createDocumentDragReceipt } from './documentDragReceipt';
import { useDocumentFramePreviewStore } from './useDocumentFramePreviewStore';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

describe('섞인 선택 끌기의 트리 요소 영수증', () => {
  beforeEach(() => {
    mocks.move.mockClear();
    useDocumentSelectionStore.setState({
      sceneId: '4key',
      selectedIds: ['t1'],
    });
    useDocumentFramePreviewStore.setState({ frames: {} });
  });

  it('증분 이동을 누적해 미리 보이고 끝낼 때 한 번 커밋한다', async () => {
    const receipt = createDocumentDragReceipt('4key');
    receipt.move(5, 0);
    receipt.move(2, -3);
    expect(useDocumentFramePreviewStore.getState().frames.t1).toMatchObject({
      x: 17,
      y: 17,
    });
    await receipt.commit('drag-gesture');
    expect(mocks.move).toHaveBeenCalledWith(
      '4key',
      [{ id: 't1', x: 17, y: 17 }],
      { gestureId: 'drag-gesture' },
    );
    expect(useDocumentFramePreviewStore.getState().frames.t1).toBeUndefined();
  });

  it('되돌리면 미리보기만 지우고 커밋하지 않는다', () => {
    const receipt = createDocumentDragReceipt('4key');
    receipt.move(5, 5);
    receipt.rollback();
    expect(useDocumentFramePreviewStore.getState().frames.t1).toBeUndefined();
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it('다른 장면의 트리 선택은 옮기지 않는다', async () => {
    useDocumentSelectionStore.setState({
      sceneId: '5key',
      selectedIds: ['t1'],
    });
    const receipt = createDocumentDragReceipt('4key');
    receipt.move(5, 5);
    await receipt.commit();
    expect(mocks.move).not.toHaveBeenCalled();
  });
});
