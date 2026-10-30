import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setFrame: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('./documentEditActions', () => ({ setDocumentFrame: mocks.setFrame }));

import { startDocumentRotation } from './documentRotation';
import { useDocumentFramePreviewStore } from './useDocumentFramePreviewStore';

const frame = { x: 10, y: 20, width: 30, height: 40, rotation: 0 };

describe('트리 요소 회전', () => {
  beforeEach(() => {
    mocks.setFrame.mockClear();
    useDocumentFramePreviewStore.setState({ frames: {} });
  });

  it('돌리는 동안 미리 보이고 끝낼 때 회전만 커밋한다', async () => {
    const session = startDocumentRotation('4key', 't1', frame);
    expect(session.preview(15)).toBe(true);
    expect(useDocumentFramePreviewStore.getState().frames.t1).toEqual({
      ...frame,
      rotation: 15,
    });
    await session.commit(30);
    expect(mocks.setFrame).toHaveBeenCalledWith('4key', 't1', {
      rotation: 30,
    });
    expect(useDocumentFramePreviewStore.getState().frames.t1).toBeUndefined();
  });

  it('취소하면 미리보기만 지운다', () => {
    const session = startDocumentRotation('4key', 't1', frame);
    session.preview(15);
    session.cancel();
    expect(useDocumentFramePreviewStore.getState().frames.t1).toBeUndefined();
    expect(mocks.setFrame).not.toHaveBeenCalled();
  });
});
