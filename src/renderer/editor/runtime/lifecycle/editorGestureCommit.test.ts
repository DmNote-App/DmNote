import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EDITOR_OPS_VERSION, type EditorOpV1 } from '@src/types/editor';

const mocks = vi.hoisted(() => ({
  staged: { settle: vi.fn(), drop: vi.fn() },
  stageSemanticOps: vi.fn(),
}));

vi.mock('@api/modules/editor/editorApi', () => ({
  editorApi: { get: vi.fn(async () => ({ revision: 7 })) },
}));
vi.mock('../operations/editorSemanticOps', () => ({
  captureEditorDocument: () => ({}),
  stageSemanticOps: mocks.stageSemanticOps,
}));
vi.mock('./editorCompatibilityQueue', () => ({
  enqueueEditorCompatibilityOperation: <T>(run: () => Promise<T>) => run(),
}));

const { commitEditorGesture } = await import('./editorGestureCommit');

const op = {
  kind: 'setBounds',
  elementType: 'key',
  id: 'k1',
  bounds: { dx: 1, dy: 2, width: 3, height: 4 },
} as EditorOpV1;

describe('플러그인 동작 거래의 편집 몫', () => {
  beforeEach(() => {
    mocks.staged.settle.mockClear();
    mocks.staged.drop.mockClear();
    mocks.stageSemanticOps.mockReset().mockReturnValue(mocks.staged);
  });

  it('정해진 연산의 트리 몫을 보내기 전에 얹고 커밋의 트리 리비전에서 확정한다', async () => {
    const commit = vi.fn(async () => ({
      revision: 8,
      changedFields: [],
      treeRevision: 12,
    }));
    const committed = commitEditorGesture(
      { opsVersion: EDITOR_OPS_VERSION, ops: [op] },
      commit,
    );
    expect(mocks.stageSemanticOps).toHaveBeenCalledWith([op]);
    await committed;
    expect(mocks.staged.settle).toHaveBeenCalledWith(12);
    expect(mocks.staged.drop).not.toHaveBeenCalled();
  });

  it('만드는 함수는 시작 시점 계획(optimisticOps)을 얹고, 실패하면 뺀다', async () => {
    const failure = new Error('io');
    const committed = commitEditorGesture(
      () => ({ opsVersion: EDITOR_OPS_VERSION, ops: [op] }),
      async () => {
        throw failure;
      },
      { optimisticOps: [op] },
    );
    expect(mocks.stageSemanticOps).toHaveBeenCalledWith([op]);
    await expect(committed).rejects.toBe(failure);
    expect(mocks.staged.drop).toHaveBeenCalled();
    expect(mocks.staged.settle).not.toHaveBeenCalled();
  });

  it('트리 리비전을 모르는 커밋 결과면 얹은 편집을 뺀다 (트리 패치가 화면을 맞춘다)', async () => {
    await commitEditorGesture(
      { opsVersion: EDITOR_OPS_VERSION, ops: [op] },
      async () => ({ revision: 8, changedFields: [] }),
    );
    expect(mocks.staged.drop).toHaveBeenCalled();
  });
});
