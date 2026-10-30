import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class TestIntentAbort extends Error {
    constructor(reason: string) {
      super(reason);
      this.name = 'ElementIntentAbort';
    }
  }
  return {
    commitMixed: vi.fn(),
    commitMixedIntent: vi.fn(),
    commitSemantic: vi.fn(),
    reportSkipped: vi.fn(),
    authorityGeneration: 7,
    TestIntentAbort,
  };
});

vi.mock('@plugins/runtime/displayElement/gestureTransaction', () => ({
  commitMixedGestureTransaction: mocks.commitMixed,
  commitMixedGestureIntent: mocks.commitMixedIntent,
}));

vi.mock('../operations/editorSemanticOps', () => ({
  commitSemanticOps: mocks.commitSemantic,
}));

const TestIntentAbort = mocks.TestIntentAbort;

vi.mock('./elementIntent', () => ({
  ElementIntentAbort: mocks.TestIntentAbort,
  reportElementOpSkipped: mocks.reportSkipped,
  isElementIntentAbort: (error: unknown) =>
    error instanceof Error && error.name === 'ElementIntentAbort',
}));

vi.mock('@plugins/runtime/pluginAuthorityGeneration', () => ({
  getPluginAuthorityGeneration: () => mocks.authorityGeneration,
}));

import {
  runMixedElementOpsIntent,
  runMixedGestureElementIntent,
} from './mixedElementIntent';

import { EDITOR_OPS_VERSION } from '@src/types/editor';
import type { MixedIntentGeneration } from '@plugins/runtime/displayElement/gestureTransaction';

type Meta = { onEnrolled?: () => void; preflight?: () => void };

describe('혼합 의도 러너 receipt 소유권', () => {
  beforeEach(() => {
    mocks.commitMixed.mockReset();
    mocks.commitMixedIntent.mockReset();
    mocks.commitSemantic.mockReset();
    mocks.reportSkipped.mockClear();
    mocks.authorityGeneration = 7;
  });

  it('안정 bounds 혼합 의도는 ordered ops를 같은 transaction에 전달한다', async () => {
    const rollback = vi.fn();
    mocks.commitMixed.mockImplementation(
      async (_gestureId, mutation, _ids, meta: Meta) => {
        expect(mutation).toEqual({
          opsVersion: EDITOR_OPS_VERSION,
          ops: [
            {
              kind: 'setBounds',
              elementType: 'key',
              id: 'id-a',
              bounds: { dx: 1, dy: 2, width: 3, height: 4 },
            },
          ],
        });
        meta.onEnrolled?.();
      },
    );

    await runMixedElementOpsIntent({
      gestureId: 'gesture-1',
      pluginIds: ['plugin-a'],
      ops: [
        {
          kind: 'setBounds',
          elementType: 'key',
          id: 'id-a',
          bounds: { dx: 1, dy: 2, width: 3, height: 4 },
        },
      ],
      receipt: { rollback },
    });

    expect(rollback).not.toHaveBeenCalled();
  });

  it('plugin-only 의도는 editor payload 없이 같은 transaction에 전달한다', async () => {
    mocks.commitMixed.mockImplementation(
      async (_gestureId, mutation, pluginIds, meta: Meta) => {
        expect(typeof mutation).toBe('function');
        expect((mutation as () => unknown)()).toBeNull();
        expect(pluginIds).toEqual(['plugin-a', 'plugin-b']);
        meta.onEnrolled?.();
      },
    );

    await runMixedElementOpsIntent({
      gestureId: 'gesture-plugin-only',
      pluginIds: ['plugin-a', 'plugin-b'],
      ops: [],
      receipt: null,
    });

    expect(mocks.commitSemantic).not.toHaveBeenCalled();
  });

  it('안정 bounds 혼합 의도의 편입 전 실패만 receipt를 복원한다', async () => {
    const rollback = vi.fn();
    mocks.commitMixed.mockRejectedValueOnce(new Error('setup failed'));

    await expect(
      runMixedElementOpsIntent({
        gestureId: 'gesture-1',
        pluginIds: ['plugin-a'],
        ops: [],
        receipt: { rollback },
      }),
    ).rejects.toThrow('setup failed');

    expect(rollback).toHaveBeenCalledOnce();
  });

  it('안정 bounds 혼합 의도의 편입 후 실패는 receipt를 복원하지 않는다', async () => {
    const rollback = vi.fn();
    mocks.commitMixed.mockImplementationOnce(
      async (_mutation, _ids, _scope, meta) => {
        meta.onEnrolled?.();
        throw new Error('backend failed');
      },
    );

    await expect(
      runMixedElementOpsIntent({
        gestureId: 'gesture-1',
        pluginIds: ['plugin-a'],
        ops: [],
        receipt: { rollback },
      }),
    ).rejects.toThrow('backend failed');

    expect(rollback).not.toHaveBeenCalled();
  });

  it('plugin scope가 비면 안정 bounds를 editor-only semantic commit으로 보낸다', async () => {
    const rollback = vi.fn();
    mocks.commitSemantic.mockImplementation(async (_ops, meta) => {
      meta.onEnrolled?.();
      return { document: {}, opResults: [{ status: 'targetMissing' }] };
    });
    const ops = [
      {
        kind: 'setBounds' as const,
        elementType: 'key' as const,
        id: 'id-a',
        bounds: { dx: 1, dy: 2, width: 3, height: 4 },
      },
    ];

    await runMixedElementOpsIntent({
      gestureId: 'gesture-editor-only',
      pluginIds: [],
      ops,
      receipt: { rollback },
    });

    expect(mocks.commitSemantic).toHaveBeenCalledWith(
      ops,
      expect.objectContaining({
        gestureId: 'gesture-editor-only',
        onEnrolled: expect.any(Function),
      }),
    );
    expect(mocks.commitMixed).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
  });

  it('plugin scope가 빈 editor-only 편입 전 실패도 receipt를 복원한다', async () => {
    const rollback = vi.fn();
    mocks.commitSemantic.mockRejectedValueOnce(new Error('setup failed'));

    await expect(
      runMixedElementOpsIntent({
        gestureId: 'gesture-editor-only',
        pluginIds: [],
        ops: [],
        receipt: { rollback },
      }),
    ).rejects.toThrow('setup failed');

    expect(mocks.commitMixed).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledOnce();
  });
});

describe('runMixedGestureElementIntent receipt 소유권', () => {
  beforeEach(() => {
    mocks.commitMixed.mockReset();
    mocks.commitMixedIntent.mockReset();
    mocks.commitSemantic.mockReset();
    mocks.reportSkipped.mockClear();
    mocks.authorityGeneration = 7;
  });

  const gestureOptions = (
    rollback: () => void,
    generate: () => MixedIntentGeneration,
  ) => ({
    gestureId: 'gesture-1',
    initialPluginIds: ['plugin-a'],
    pluginScope: () => ['plugin-a'],
    receipt: { rollback },
    generate,
    skipContext: 'test settlement',
  });

  it('ops generation은 receipt를 복원하지 않고 커밋한다', async () => {
    const rollback = vi.fn();
    mocks.commitMixedIntent.mockImplementation(
      async (options: { generate: (context: unknown) => unknown }) => {
        expect(
          options.generate({ base: {}, pluginProjection: [] }),
        ).toMatchObject({ kind: 'ops' });
      },
    );

    const result = await runMixedGestureElementIntent(
      gestureOptions(rollback, () => ({ kind: 'ops' as const, ops: [] })),
    );

    expect(result).toEqual({ committed: true, satisfied: true });
    expect(rollback).not.toHaveBeenCalled();
  });

  it('generate가 중단하면 receipt를 복원하고 skip을 관측한다', async () => {
    const rollback = vi.fn();
    const abort = new TestIntentAbort('nothing to settle');
    mocks.commitMixedIntent.mockImplementation(
      async (options: {
        generate: (context: unknown) => unknown;
        onFailureBeforeSettle?: (error: unknown) => void;
      }) => {
        try {
          options.generate({ base: {}, pluginProjection: [] });
        } catch (error) {
          options.onFailureBeforeSettle?.(error);
          throw error;
        }
      },
    );

    const result = await runMixedGestureElementIntent(
      gestureOptions(rollback, () => {
        throw abort;
      }),
    );

    expect(result).toEqual({ committed: false, satisfied: false });
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(mocks.reportSkipped).toHaveBeenCalledWith('test settlement');
  });

  it('편입 전 실패는 receipt를 복원하고 원 오류를 전파한다', async () => {
    const rollback = vi.fn();
    const failure = new Error('setup failed');
    mocks.commitMixedIntent.mockImplementation(
      async (options: { onFailureBeforeSettle?: (e: unknown) => void }) => {
        options.onFailureBeforeSettle?.(failure);
        throw failure;
      },
    );

    await expect(
      runMixedGestureElementIntent(
        gestureOptions(rollback, () => ({ kind: 'ops' as const, ops: [] })),
      ),
    ).rejects.toThrow('setup failed');
    expect(rollback).toHaveBeenCalledTimes(1);
  });

  it('편입 후 실패는 gesture 실패 경로가 소유한다 - 복원 금지', async () => {
    const rollback = vi.fn();
    mocks.commitMixedIntent.mockImplementation(
      async (options: { onEnrolled?: () => void }) => {
        options.onEnrolled?.();
        throw new Error('commit failed');
      },
    );

    await expect(
      runMixedGestureElementIntent(
        gestureOptions(rollback, () => ({ kind: 'ops' as const, ops: [] })),
      ),
    ).rejects.toThrow('commit failed');
    expect(rollback).not.toHaveBeenCalled();
  });

  it('satisfied generation은 커밋 없이 종료한다', async () => {
    const rollback = vi.fn();
    mocks.commitMixedIntent.mockImplementation(
      async (options: { generate: (context: unknown) => unknown }) => {
        options.generate({ base: {}, pluginProjection: [] });
      },
    );

    const result = await runMixedGestureElementIntent(
      gestureOptions(rollback, () => ({ kind: 'satisfied' as const })),
    );

    expect(result).toEqual({ committed: false, satisfied: true });
    expect(rollback).not.toHaveBeenCalled();
  });
});
