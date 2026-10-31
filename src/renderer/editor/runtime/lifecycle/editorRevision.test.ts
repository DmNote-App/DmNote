import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@api/modules/editor/editorApi', () => ({
  editorApi: { get: api.get },
}));

const {
  knownEditorRevision,
  noteEditorRevision,
  noteRevisionConflict,
  resetKnownEditorRevision,
} = await import('./editorRevision');

describe('알고 있는 편집 리비전', () => {
  beforeEach(() => {
    resetKnownEditorRevision();
    api.get.mockReset().mockResolvedValue({ revision: 4 });
  });

  it('처음 한 번만 문서를 받아 오고 이후로는 커밋·신호로 알게 된 값을 쓴다', async () => {
    await expect(knownEditorRevision()).resolves.toBe(4);
    noteEditorRevision(7);
    await expect(knownEditorRevision()).resolves.toBe(7);
    // 늦게 온 낡은 값은 무시
    noteEditorRevision(5);
    await expect(knownEditorRevision()).resolves.toBe(7);
    expect(api.get).toHaveBeenCalledOnce();
  });

  it('리비전 충돌은 오류에 실린 지금 리비전을 그대로 믿는다 (없으면 다음에 다시 받아 온다)', async () => {
    noteEditorRevision(9);
    expect(
      noteRevisionConflict({
        errorCode: 'REVISION_CONFLICT',
        details: { currentRevision: 3 },
      }),
    ).toBe(true);
    await expect(knownEditorRevision()).resolves.toBe(3);
    expect(noteRevisionConflict({ errorCode: 'REVISION_CONFLICT' })).toBe(true);
    await expect(knownEditorRevision()).resolves.toBe(4);
    expect(noteRevisionConflict(new Error('io'))).toBe(false);
  });
});
