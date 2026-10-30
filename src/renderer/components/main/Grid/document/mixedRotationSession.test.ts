import { describe, expect, it, vi } from 'vitest';

vi.mock('@src/renderer/editor/runtime/gesture/editGestureController', () => ({
  editGestureController: { activeGestureId: () => 'gesture-1' },
}));

import { combineRotationSessions } from './mixedRotationSession';

describe('섞인 선택 묶음 회전', () => {
  it('옛 종류가 받아들인 미리보기만 함께 그리고 같은 동작 id로 커밋한다', () => {
    const legacy = {
      preview: vi.fn((rotation: number) => rotation < 90),
      commit: vi.fn(),
      cancel: vi.fn(),
    };
    const document = { preview: vi.fn(), commit: vi.fn(), cancel: vi.fn() };
    const session = combineRotationSessions(legacy, document);
    expect(session.preview(30)).toBe(true);
    expect(document.preview).toHaveBeenCalledWith(30);
    expect(session.preview(120)).toBe(false);
    expect(document.preview).toHaveBeenCalledTimes(1);
    session.commit(30);
    expect(document.commit).toHaveBeenCalledWith(30, 'gesture-1');
    expect(legacy.commit).toHaveBeenCalledWith(30);
    session.cancel();
    expect(legacy.cancel).toHaveBeenCalled();
    expect(document.cancel).toHaveBeenCalled();
  });
});
