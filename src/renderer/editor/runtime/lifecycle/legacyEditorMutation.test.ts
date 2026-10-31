import { beforeEach, describe, expect, it, vi } from 'vitest';

const order = vi.hoisted(() => ({
  get: vi.fn(),
  commit: vi.fn(),
  calls: [] as string[],
  settleResult: true,
  activeIds: [] as Array<string | null>,
  activeGestureId: vi.fn(() => order.activeIds.shift() ?? null),
  commitPendingAsync: vi.fn(async () => {
    order.calls.push('settle');
    return order.settleResult;
  }),
  cancel: vi.fn(() => {
    order.calls.push('cancel');
  }),
}));

vi.mock('../gesture/editGestureController', () => ({
  editGestureController: {
    activeGestureId: order.activeGestureId,
    commitPendingAsync: order.commitPendingAsync,
    cancel: order.cancel,
  },
}));
vi.mock('@api/modules/editor/editorApi', () => ({
  editorApi: { get: order.get },
  editorCommitRaw: order.commit,
}));

import { enqueueEditorCompatibilityWrite } from './editorCompatibilityQueue';
import { registerHeldEditorWrites } from './editorWriteBarrier';
import {
  commitLegacyEditorPatch,
  runExclusiveLegacyMutation,
} from './legacyEditorMutation';

describe('runExclusiveLegacyMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    order.calls.length = 0;
    order.settleResult = true;
    order.activeIds = [];
  });

  it('활성 게스처를 compat 슬롯 획득 전에 정산한다', async () => {
    // 정산이 mutation 뒤로 밀리면 요소가 유지된 채 참조 필드만 재작성되는
    // mutation(프리셋 삭제 fallback, 사운드 삭제)에서 삭제 참조가 부활한다
    const result = await runExclusiveLegacyMutation(async () => {
      order.calls.push('mutation');
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(order.calls).toEqual(['settle', 'mutation']);
  });

  it('정산 실패로 되살아난 같은 게스처만 폐기 후 진행한다', async () => {
    // 살려두면 mutation이 재작성한 참조 위에 옛 patch가 재적용되어
    // 삭제된 참조가 부활한다
    order.settleResult = false;
    order.activeIds = ['gesture-a', 'gesture-a'];

    await runExclusiveLegacyMutation(async () => {
      order.calls.push('mutation');
      return 'ok';
    });

    expect(order.calls).toEqual(['settle', 'cancel', 'mutation']);
  });

  it('정산 대기 중 시작된 새 게스처는 폐기하지 않는다', async () => {
    // 실패한 A가 아니라 그 뒤의 최신 편집 B가 활성이면 건드리지 않는다
    order.settleResult = false;
    order.activeIds = ['gesture-a', 'gesture-b'];

    await runExclusiveLegacyMutation(async () => 'ok');

    expect(order.cancel).not.toHaveBeenCalled();
  });

  it('게스처 없이 drain만 실패한 경우 폐기하지 않는다', async () => {
    order.settleResult = false;
    order.activeIds = [null, null];

    await runExclusiveLegacyMutation(async () => 'ok');

    expect(order.cancel).not.toHaveBeenCalled();
  });

  it('정산 성공이면 게스처를 폐기하지 않는다', async () => {
    order.activeIds = ['gesture-a', null];

    await runExclusiveLegacyMutation(async () => 'ok');

    expect(order.cancel).not.toHaveBeenCalled();
  });

  it('보류한 트리 편집을 먼저 보내고, 남으면 mutation을 하지 않는다', async () => {
    registerHeldEditorWrites(async () => {
      order.calls.push('held');
      return false;
    });
    const mutation = vi.fn(async () => 'ok');
    await expect(runExclusiveLegacyMutation(mutation)).rejects.toThrow(
      'held editor writes',
    );
    expect(order.calls).toEqual(['settle', 'held']);
    expect(mutation).not.toHaveBeenCalled();
    registerHeldEditorWrites(null);
  });

  it('compat 큐 선행 작업 뒤에 실행된다', async () => {
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = enqueueEditorCompatibilityWrite(
      async () => {
        await blocker;
        order.calls.push('prior-write');
      },
      () => undefined,
    );

    const pending = runExclusiveLegacyMutation(async () => {
      order.calls.push('exclusive');
      return 'done';
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(order.calls).not.toContain('exclusive');

    release();
    await first;
    expect(await pending).toBe('done');
    expect(order.calls.indexOf('prior-write')).toBeLessThan(
      order.calls.indexOf('exclusive'),
    );
  });
});

describe('commitLegacyEditorPatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('지금 revision으로 보내고 revision이 겹치면 다시 받아 보낸다', async () => {
    order.get
      .mockResolvedValueOnce({ revision: 3 })
      .mockResolvedValueOnce({ revision: 4 });
    order.commit
      .mockRejectedValueOnce({ errorCode: 'REVISION_CONFLICT' })
      .mockResolvedValueOnce({ revision: 5, changedFields: ['keys'] });

    const result = await commitLegacyEditorPatch(
      { schemaVersion: 1, keys: { '4key': ['A'] } },
      { multiKey: false, gestureId: 'g1' },
    );

    expect(result.revision).toBe(5);
    expect(order.commit.mock.calls.map(([request]) => request)).toEqual([
      expect.objectContaining({
        baseRevision: 3,
        multiKey: false,
        gestureId: 'g1',
      }),
      expect.objectContaining({ baseRevision: 4 }),
    ]);
  });

  it('다른 오류는 그대로 올린다', async () => {
    order.get.mockResolvedValue({ revision: 1 });
    order.commit.mockRejectedValue({ errorCode: 'VALIDATION_FAILED' });
    await expect(
      commitLegacyEditorPatch({ schemaVersion: 1, keys: {} }),
    ).rejects.toEqual({ errorCode: 'VALIDATION_FAILED' });
    expect(order.commit).toHaveBeenCalledOnce();
  });
});
