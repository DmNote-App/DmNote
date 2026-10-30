import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  commitSemanticOpsInternal: vi.fn(),
  commitGeneratedSemanticOpsInternal: vi.fn(),
  discardSemanticGesture: vi.fn(),
  whenEventsApplied: vi.fn(() => Promise.resolve()),
}));

vi.mock('../coordinator/editorStateCoordinator', () => ({
  editorCoordinator: {
    commitSemanticOpsInternal: api.commitSemanticOpsInternal,
    commitGeneratedSemanticOpsInternal: api.commitGeneratedSemanticOpsInternal,
    discardSemanticGesture: api.discardSemanticGesture,
    whenEventsApplied: api.whenEventsApplied,
  },
  captureEditorDocument: () => ({}),
}));

// 트리 문서 - 노브 하나가 있는 장면
const tree = vi.hoisted(() => ({
  store: null as null | {
    getElement: (scene: string, id: string) => unknown;
    edit: ReturnType<typeof vi.fn>;
    getRevision?: () => number;
    subscribe?: (listener: () => void) => () => void;
  },
}));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => tree.store,
}));

import { enqueueEditorCompatibilityWrite } from '../lifecycle/editorCompatibilityQueue';
import { useKnobItemStore } from '@stores/data/useKnobItemStore';
import { composePreviewPositions } from '../gesture/previewOverlay';
import { clearPendingTreeEdits } from '../gesture/pendingTreeEdits';
import {
  commitGeneratedSemanticOps,
  commitSemanticOps,
  commitTreeLegacyFields,
  withoutTreeRoutedIntents,
} from './editorSemanticOps';

describe('commitSemanticOps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tree.store = null;
  });

  const op = {
    kind: 'setBounds' as const,
    elementType: 'key' as const,
    id: '00000000-0000-4000-8000-000000000001',
    bounds: { dx: 0, dy: 0, width: 10, height: 10 },
  };

  it('coordinator 편입 전 실패는 preview gesture를 폐기한다', async () => {
    api.commitSemanticOpsInternal.mockRejectedValueOnce(
      new Error('conflict pending'),
    );

    await expect(
      commitSemanticOps(
        [
          {
            kind: 'setBounds',
            elementType: 'key',
            id: '00000000-0000-4000-8000-000000000002',
            bounds: { dx: 0, dy: 0, width: 10, height: 10 },
          },
        ],
        { gestureId: 'pre-enrollment' },
      ),
    ).rejects.toThrow('conflict pending');

    expect(api.discardSemanticGesture).toHaveBeenCalledWith('pre-enrollment');
  });

  it('generated semantic targetLost는 편입 전 preview gesture를 폐기한다', async () => {
    api.commitGeneratedSemanticOpsInternal.mockResolvedValueOnce(null);

    await expect(
      commitGeneratedSemanticOps(() => null, {
        gestureId: 'target-lost-preview',
      }),
    ).resolves.toBeNull();

    expect(api.discardSemanticGesture).toHaveBeenCalledWith(
      'target-lost-preview',
    );
  });

  it('compatibility writer 뒤에서 coordinator 직렬 슬롯에 합류한다', async () => {
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = enqueueEditorCompatibilityWrite(
      () => blocker,
      () => undefined,
    );
    const outcome = {
      document: {
        schemaVersion: 1 as const,
        keys: {},
        keyPositions: {},
        statPositions: {},
        graphPositions: {},
        knobPositions: {},
        layerGroups: {},
      },
      opResults: [{ status: 'targetMissing' as const }],
    };
    api.commitSemanticOpsInternal.mockResolvedValueOnce(outcome);

    const pending = commitSemanticOps([op]);
    await Promise.resolve();
    expect(api.commitSemanticOpsInternal).not.toHaveBeenCalled();

    release();
    await first;
    await expect(pending).resolves.toEqual(outcome);
    expect(api.commitSemanticOpsInternal).toHaveBeenCalledOnce();
  });

  it('semantic op 뒤의 legacy writer는 op 완료를 기다린다', async () => {
    let release!: () => void;
    api.commitSemanticOpsInternal.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ document: {}, opResults: [] });
        }),
    );
    const semantic = commitSemanticOps([op]);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const legacyWrite = vi.fn(async () => undefined);
    const legacy = enqueueEditorCompatibilityWrite(
      legacyWrite,
      () => undefined,
    );

    await Promise.resolve();
    expect(legacyWrite).not.toHaveBeenCalled();
    release();
    await semantic;
    await legacy;
    expect(legacyWrite).toHaveBeenCalledOnce();
  });
});

describe('트리로 옮긴 옛 종류 몫', () => {
  const KNOB = '00000000-0000-4000-8000-0000000000k1';
  const KEY = '00000000-0000-4000-8000-000000000001';
  const knobOp = {
    kind: 'deleteElement' as const,
    elementType: 'knob' as const,
    id: KNOB,
  };
  const keyOp = {
    kind: 'deleteElement' as const,
    elementType: 'key' as const,
    id: KEY,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tree.store = {
      getElement: (_scene, id) => (id === KNOB ? { id } : undefined),
      edit: vi.fn().mockResolvedValue({ status: 'committed', revision: 1 }),
      getRevision: () => 1,
    };
  });

  it('섞인 연산은 트리 몫과 옛 몫이 같은 동작 id로 커밋된다', async () => {
    api.commitSemanticOpsInternal.mockResolvedValueOnce({
      document: {},
      opResults: [{ status: 'applied' }],
    });

    const outcome = await commitSemanticOps([keyOp, knobOp] as never);

    const [treeOps, options] = tree.store!.edit.mock.calls[0];
    expect(treeOps).toEqual([{ op: 'remove', scene: '4key', ids: [KNOB] }]);
    const [legacyOps, meta] = api.commitSemanticOpsInternal.mock.calls[0];
    expect(legacyOps).toEqual([keyOp]);
    expect(meta.gestureId).toBeTruthy();
    expect(options).toEqual({ gestureId: meta.gestureId });
    expect(outcome.opResults).toHaveLength(2);
  });

  it('만든 연산은 슬롯 안에서 한 번만 만들고 트리 몫을 한 번만 보낸다', async () => {
    const generate = vi.fn(() => [keyOp, knobOp] as never);
    api.commitGeneratedSemanticOpsInternal.mockImplementationOnce(
      async (slotGenerate, meta) => {
        // 다시 시도 - 다시 만들어도 트리 쓰기는 한 번
        expect(slotGenerate({})).toEqual([keyOp]);
        expect(slotGenerate({})).toEqual([keyOp]);
        expect(meta.gestureId).toBeTruthy();
        return { document: {}, opResults: [{ status: 'applied' }] };
      },
    );

    const outcome = await commitGeneratedSemanticOps(generate);

    expect(generate).toHaveBeenCalledTimes(2);
    expect(tree.store!.edit).toHaveBeenCalledTimes(1);
    const meta = api.commitGeneratedSemanticOpsInternal.mock.calls[0][1];
    expect(tree.store!.edit.mock.calls[0][1]).toEqual({
      gestureId: meta.gestureId,
    });
    expect(outcome?.opResults).toEqual([
      { status: 'applied' },
      { status: 'applied' },
    ]);
  });

  it('트리 몫만 있으면 옛 커밋 없이 결과를 낸다', async () => {
    api.commitGeneratedSemanticOpsInternal.mockImplementationOnce(
      async (slotGenerate) => slotGenerate({}),
    );

    const outcome = await commitGeneratedSemanticOps(() => [knobOp] as never);

    expect(tree.store!.edit).toHaveBeenCalledTimes(1);
    expect(outcome?.opResults).toEqual([{ status: 'applied' }]);
  });

  it('옛 종류만 있으면 동작 id를 붙이지 않는다', async () => {
    api.commitGeneratedSemanticOpsInternal.mockImplementationOnce(
      async (slotGenerate, meta) => {
        slotGenerate({});
        expect(meta.gestureId).toBeUndefined();
        return { document: {}, opResults: [{ status: 'applied' }] };
      },
    );

    await commitGeneratedSemanticOps(() => [keyOp] as never);

    expect(tree.store!.edit).not.toHaveBeenCalled();
  });
});

describe('트리로 옮긴 종류의 겉모습 칸', () => {
  const KNOB = '00000000-0000-4000-8000-0000000000k2';
  const legacyKnob = {
    id: KNOB,
    dx: 0,
    dy: 0,
    width: 60,
    height: 60,
    sensitivity: 1,
    reverse: false,
  };
  const element = {
    type: 'element',
    id: KNOB,
    kind: 'knob',
    frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
    values: { sensitivity: 1, reverse: false },
  };
  const patchOp = {
    kind: 'patchElement' as const,
    elementType: 'knob' as const,
    id: KNOB,
    patch: { property: 'sensitivity', value: 2 },
  };
  const shown = () =>
    composePreviewPositions(
      'knobPosition',
      useKnobItemStore.getState().positions as never,
    )['4key'][0] as typeof legacyKnob;

  let revision = 0;
  let listeners: (() => void)[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    clearPendingTreeEdits();
    revision = 0;
    listeners = [];
    useKnobItemStore.setState({ positions: { '4key': [legacyKnob] } as never });
    tree.store = {
      getElement: (_scene, id) => (id === KNOB ? element : undefined),
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

  it('트리 연산으로 보내고, 옛 스토어 대신 대기 편집이 확인 전까지 보여 주고, 반영된 뒤 끝난다', async () => {
    let done = false;
    const commit = commitSemanticOps([patchOp] as never).then(() => {
      done = true;
    });

    expect(tree.store!.edit.mock.calls[0][0]).toEqual([
      { op: 'setValues', scene: '4key', id: KNOB, values: { sensitivity: 2 } },
    ]);
    expect(api.commitSemanticOpsInternal).not.toHaveBeenCalled();
    expect(useKnobItemStore.getState().positions['4key'][0]).toBe(legacyKnob);
    expect(shown().sensitivity).toBe(2);
    await vi.waitFor(() => expect(listeners).toHaveLength(1));
    expect(done).toBe(false);

    // 트리 스토어가 그 revision을 받고 코디네이터가 이벤트를 반영하면 내리고 끝난다
    revision = 1;
    listeners.forEach((listener) => listener());
    await commit;
    expect(api.whenEventsApplied).toHaveBeenCalled();
    expect(shown().sensitivity).toBe(1);
  });

  it('트리가 받지 않으면 대기 편집을 내리고 오류로 올린다 (옛 경로로 다시 보내지 않는다)', async () => {
    tree.store!.edit.mockResolvedValueOnce({
      status: 'rejected',
      revision: 0,
      code: 'HISTORY_IN_PROGRESS',
      violations: [],
    });

    await expect(
      commitSemanticOps([patchOp] as never, { gestureId: 'g1' }),
    ).rejects.toThrow('HISTORY_IN_PROGRESS');

    expect(api.commitSemanticOpsInternal).not.toHaveBeenCalled();
    expect(shown().sensitivity).toBe(1);
  });

  it('숨김·이름·회전도 트리로 가면 먼저 쓰기에서 빼고 대기 편집으로 보여 준다', () => {
    const hideOp = {
      ...patchOp,
      patch: { property: 'hidden', value: true },
    };
    const intents = new Map([['knob', new Map([[KNOB, { hidden: true }]])]]);
    expect(
      withoutTreeRoutedIntents(intents as never, [hideOp] as never).get(
        'knob' as never,
      )?.size,
    ).toBe(0);
    void commitSemanticOps([hideOp] as never);
    expect(tree.store!.edit.mock.calls[0][0]).toEqual([
      { op: 'setCommon', scene: '4key', id: KNOB, hidden: true },
    ]);
    expect((shown() as typeof legacyKnob & { hidden?: boolean }).hidden).toBe(
      true,
    );
  });

  it('트리에 자리가 없는 옛 칸이 섞이면 옛 경로로, 먼저 쓰기도 걸러내지 않는다', async () => {
    const fontOp = {
      ...patchOp,
      patch: { property: 'fontColor', value: '#fff' },
    };
    api.commitSemanticOpsInternal.mockResolvedValueOnce({
      document: {},
      opResults: [{ status: 'applied' }],
    });
    const intents = new Map([
      ['knob', new Map([[KNOB, { fontColor: '#fff' }]])],
    ]);

    expect(withoutTreeRoutedIntents(intents as never, [fontOp] as never)).toBe(
      intents,
    );
    await commitSemanticOps([fontOp] as never);
    expect(tree.store!.edit).not.toHaveBeenCalled();
    expect(api.commitSemanticOpsInternal).toHaveBeenCalled();
  });

  it('트리로 갈 겉모습 패치의 요소는 먼저 쓰기에서 뺀다', () => {
    const intents = new Map([['knob', new Map([[KNOB, { sensitivity: 2 }]])]]);
    expect(
      withoutTreeRoutedIntents(intents as never, [patchOp] as never).get(
        'knob' as never,
      )?.size,
    ).toBe(0);
  });

  it('트리 변경 이벤트를 놓쳐도 시한이 지나면 내리고 끝난다', async () => {
    vi.useFakeTimers();
    try {
      const commit = commitSemanticOps([patchOp] as never);
      await vi.advanceTimersByTimeAsync(0);
      expect(shown().sensitivity).toBe(2);
      await vi.advanceTimersByTimeAsync(3000);
      await commit;
      expect(shown().sensitivity).toBe(1);
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
    clearPendingTreeEdits();
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
