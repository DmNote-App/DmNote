import { beforeEach, describe, expect, it, vi } from 'vitest';

// 트리 문서 - 노브 하나가 있는 장면
const tree = vi.hoisted(() => ({
  store: null as null | {
    getElement: (scene: string, id: string) => unknown;
    getScene?: (scene: string) => unknown;
    getSceneIds?: () => string[];
    edit: ReturnType<typeof vi.fn>;
    getRevision?: () => number;
    subscribe?: (listener: () => void) => () => void;
  },
}));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => tree.store,
}));

import { drainEditorWrites } from '../lifecycle/editorWriteBarrier';
import {
  commitGeneratedSemanticOps,
  commitPropertyIntents,
  commitSemanticOps,
  commitTreeLegacyFields,
} from './editorSemanticOps';

const KNOB = '00000000-0000-4000-8000-0000000000k2';
const element = {
  type: 'element',
  id: KNOB,
  kind: 'knob',
  frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
  values: { sensitivity: 1, reverse: false },
  legacy: {},
};
const patchOp = {
  kind: 'patchElement' as const,
  elementType: 'knob' as const,
  id: KNOB,
  patch: { property: 'sensitivity', value: 2 },
};

describe('옛 편집 연산을 트리로', () => {
  let revision = 0;
  let listeners: (() => void)[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    revision = 0;
    listeners = [];
    tree.store = {
      getElement: (_scene, id) => (id === KNOB ? element : undefined),
      getScene: () => ({ nodes: [element] }),
      getSceneIds: () => ['4key'],
      edit: vi.fn().mockResolvedValue({ status: 'committed', revision: 1 }),
      getRevision: () => revision,
      subscribe: (listener) => {
        listeners.push(listener);
        return () => {
          listeners = listeners.filter((other) => other !== listener);
        };
      },
    };
  });

  it('트리 연산으로 보내고(트리 스토어가 낙관 적용) 트리가 반영한 뒤 끝나며 쓰기 대기에 걸린다', async () => {
    let done = false;
    const commit = commitSemanticOps([patchOp] as never).then((outcome) => {
      done = true;
      return outcome;
    });

    expect(tree.store!.edit.mock.calls[0][0]).toEqual([
      { op: 'setValues', scene: '4key', id: KNOB, values: { sensitivity: 2 } },
    ]);
    await vi.waitFor(() => expect(listeners).toHaveLength(1));
    expect(done).toBe(false);

    // 이 창의 트리 스토어가 그 revision을 받으면 끝난다
    revision = 1;
    listeners.forEach((listener) => listener());
    const outcome = await commit;
    expect(outcome.opResults).toEqual([{ status: 'applied' }]);
    await expect(drainEditorWrites()).resolves.toBe(true);
  });

  it('트리가 받지 않으면 오류로 올린다', async () => {
    tree.store!.edit.mockResolvedValueOnce({
      status: 'rejected',
      revision: 0,
      code: 'HISTORY_IN_PROGRESS',
      violations: [],
    });

    await expect(
      commitSemanticOps([patchOp] as never, { gestureId: 'g1' }),
    ).rejects.toThrow('HISTORY_IN_PROGRESS');
    expect(tree.store!.edit.mock.calls[0][1]).toEqual({ gestureId: 'g1' });
  });

  it('숨김·이름·회전은 공통 정보·틀 연산으로', () => {
    void commitSemanticOps([
      { ...patchOp, patch: { property: 'hidden', value: true } },
    ] as never);
    expect(tree.store!.edit.mock.calls[0][0]).toEqual([
      { op: 'setCommon', scene: '4key', id: KNOB, hidden: true },
    ]);
  });

  it('트리로 못 보내는 몫(자리가 없는 칸·트리에 없는 요소)은 적용하지 않고 targetMissing으로 알린다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const outcome = await commitSemanticOps([
      { ...patchOp, patch: { property: 'fontColor', value: '#fff' } },
      { ...patchOp, id: 'missing' },
    ] as never);
    expect(tree.store!.edit).not.toHaveBeenCalled();
    expect(outcome.opResults).toEqual([
      { status: 'targetMissing' },
      { status: 'targetMissing' },
    ]);
    warn.mockRestore();
  });

  it('미리 막는 검사(preflight)가 던지면 보내지 않는다', async () => {
    await expect(
      commitSemanticOps([patchOp] as never, {
        preflight: () => {
          throw new Error('stale');
        },
      }),
    ).rejects.toThrow('stale');
    expect(tree.store!.edit).not.toHaveBeenCalled();
  });

  it('만드는 커밋은 트리 문서를 바탕으로 만들고, 만들 것이 없으면 null', async () => {
    const generate = vi.fn(
      (base: { knobPositions: Record<string, unknown[]> }) =>
        base.knobPositions['4key'].length > 0 ? [patchOp] : null,
    );
    const pending = commitGeneratedSemanticOps(generate as never);
    expect(generate.mock.calls[0][0].knobPositions['4key']).toEqual([
      expect.objectContaining({ id: KNOB, sensitivity: 1 }),
    ]);
    expect(tree.store!.edit).toHaveBeenCalledOnce();
    revision = 1;
    listeners.forEach((listener) => listener());
    await pending;

    await expect(commitGeneratedSemanticOps(() => null)).resolves.toBeNull();
  });

  it('요소별 옛 칸 값을 한 트리 커밋으로 (트리에 없는 요소는 뺀다)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pending = commitPropertyIntents(
      new Map([
        [
          'knob',
          new Map([
            [KNOB, { sensitivity: 3, dx: 5 }],
            ['missing', { sensitivity: 1 }],
          ]),
        ],
      ]) as never,
      'gesture-1',
    );
    const [ops, options] = tree.store!.edit.mock.calls[0];
    expect(ops).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: 'setFrame', id: KNOB }),
        {
          op: 'setValues',
          scene: '4key',
          id: KNOB,
          values: { sensitivity: 3 },
        },
      ]),
    );
    expect(options).toEqual({ gestureId: 'gesture-1' });
    revision = 1;
    listeners.forEach((listener) => listener());
    await expect(pending).resolves.toBe(true);
    warn.mockRestore();
  });

  it('트리 변경 이벤트를 놓쳐도 시한이 지나면 끝난다', async () => {
    vi.useFakeTimers();
    try {
      const commit = commitSemanticOps([patchOp] as never);
      await vi.advanceTimersByTimeAsync(3000);
      await commit;
      expect(listeners).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('요소 하나의 옛 칸 패치를 트리로', () => {
  const SPRITE = '00000000-0000-4000-8000-0000000000s1';
  beforeEach(() => {
    vi.clearAllMocks();
    tree.store = {
      getElement: (_scene, id) =>
        id === SPRITE
          ? {
              type: 'element',
              id: SPRITE,
              kind: 'sprite',
              frame: { x: 0, y: 0, width: 200, height: 200, rotation: 0 },
              values: {
                idleTransform: { x: 0, y: 40, rotation: 0, scale: 1 },
                poses: [],
              },
            }
          : undefined,
      edit: vi.fn().mockResolvedValue({ status: 'committed', revision: 1 }),
      getRevision: () => 1,
    };
  });

  it('상자를 맞춰도 옛 필드 패치처럼 이동값은 비례하지 않는다', async () => {
    await commitTreeLegacyFields('sprite', '4key', SPRITE, () => ({
      baseImage: 'wide.png',
      width: 200,
      height: 50,
    }));
    const ops = tree.store!.edit.mock.calls[0][0] as Array<{
      op: string;
      values?: Record<string, unknown>;
    }>;
    expect(ops.find((op) => op.op === 'setValues')?.values).toEqual({
      baseImage: 'wide.png',
    });
    expect(JSON.stringify(ops)).not.toContain('idleTransform');
  });
});
