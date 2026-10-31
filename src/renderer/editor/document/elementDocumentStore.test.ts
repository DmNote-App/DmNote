import { describe, expect, it, vi } from 'vitest';

import type { Document, Node, Op } from '@src/types/generated/elementDocument';
import type {
  ElementDocumentChangedEvent,
  ElementDocumentCommitResult,
} from '@api/modules/editor/elementDocumentApi';
import {
  createEditorDocumentStore,
  createMirrorDocumentStore,
  ElementEditHeldError,
  type ElementDocumentTransport,
} from './elementDocumentStore';

const document = (): Document => ({
  formatVersion: 1,
  kindVersions: { key: 1, stat: 1, graph: 1, knob: 1, sprite: 1 },
  scenes: {
    '4key': {
      nodes: [
        {
          type: 'element',
          id: 'k1',
          kind: 'key',
          frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
          values: { displayText: null, count: 0 },
        },
        {
          type: 'element',
          id: 'k2',
          kind: 'key',
          frame: { x: 70, y: 0, width: 60, height: 60, rotation: 0 },
          values: { displayText: null, count: 0 },
        },
      ],
    },
  },
});

const nudge = (id: string, x: number): Op[] => [
  { op: 'setFrame', scene: '4key', id, frame: { x } },
];

const harness = (
  commit: (ops: Op[]) => Promise<ElementDocumentCommitResult>,
) => {
  let emit: (event: ElementDocumentChangedEvent) => void = () => undefined;
  const transport: ElementDocumentTransport = {
    get: async () => ({ revision: 1, document: document() }),
    commit,
    onChanged: (listener) => {
      emit = listener;
      return () => undefined;
    },
  };
  const store = createEditorDocumentStore(
    { revision: 1, document: document() },
    transport,
  );
  return { store, emit: (event: ElementDocumentChangedEvent) => emit(event) };
};

const nudgedPatch = (revision: number, x: number) => {
  const after = document();
  const k1 = after.scenes['4key']!.nodes[0];
  if (k1.type === 'element') k1.frame.x = x;
  return {
    revision,
    patch: {
      kindVersions: after.kindVersions,
      scenes: { '4key': { type: 'nodes' as const, nodes: [k1] } },
      changes: {
        scenes: {
          '4key': { changed: ['k1'], removed: [], structure: false },
        },
      },
    },
  };
};

describe('편집 창 요소 문서 스토어', () => {
  it('편집은 응답 전에 화면에 먼저 반영하고 바뀌지 않은 요소는 같은 객체로 둔다', async () => {
    let resolve: (result: ElementDocumentCommitResult) => void = () =>
      undefined;
    const { store, emit } = harness(
      () =>
        new Promise((next) => {
          resolve = next;
        }),
    );
    const untouched = store.getElement('4key', 'k2');
    const listener = vi.fn();
    store.subscribe(listener);
    const pending = store.edit!(nudge('k1', 40));
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(40);
    expect(store.getElement('4key', 'k2')).toBe(untouched);
    expect(listener).toHaveBeenCalledTimes(1);
    // 커밋은 차례를 기다렸다 보낸다
    await Promise.resolve();
    resolve({ status: 'committed', revision: 2, changes: { scenes: {} } });
    await pending;
    // 패치가 오기 전까지 화면을 지킨다
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(40);
    emit(nudgedPatch(2, 40));
    expect(store.getRevision()).toBe(2);
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(40);
    expect(store.getElement('4key', 'k2')).toBe(untouched);
  });

  it('거부된 편집은 화면에서 뺀다', async () => {
    const { store } = harness(async () => ({
      status: 'rejected',
      revision: 1,
      code: 'VIOLATION',
      violations: [{ code: 'INVALID_FRAME', path: 'ops[0].frame' }],
    }));
    const listener = vi.fn();
    store.subscribe(listener);
    const result = await store.edit!(nudge('k1', -5));
    expect(result.status).toBe('rejected');
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('보내지 못한 편집도 화면에서 빼고 오류를 넘긴다', async () => {
    const { store } = harness(async () => {
      throw new Error('ipc');
    });
    await expect(store.edit!(nudge('k1', 9))).rejects.toThrow('ipc');
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(0);
  });

  it('패치가 응답보다 먼저 와도 넣은 요소가 두 번 생기지 않는다', async () => {
    let emitFirst: () => void = () => undefined;
    const { store, emit } = harness(async () => {
      emitFirst();
      return { status: 'committed', revision: 2, changes: { scenes: {} } };
    });
    const inserted: Op = {
      op: 'insert',
      scene: '4key',
      parent: null,
      index: null,
      node: {
        type: 'element',
        id: 'n1',
        kind: 'cursorTracker',
        frame: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
      },
    };
    const after = document();
    after.scenes['4key']!.nodes.push(
      (inserted as Extract<Op, { op: 'insert' }>).node,
    );
    emitFirst = () =>
      emit({
        revision: 2,
        patch: {
          kindVersions: after.kindVersions,
          scenes: { '4key': { type: 'replace', scene: after.scenes['4key']! } },
          changes: {
            scenes: {
              '4key': { changed: ['n1'], removed: [], structure: true },
            },
          },
        },
      });
    await store.edit!([inserted]);
    const ids = store.getScene('4key')!.nodes.map((node) => node.id);
    expect(ids).toEqual(['k1', 'k2', 'n1']);
  });

  it('다른 창의 패치 위에 미확정 편집을 다시 얹는다', async () => {
    let resolve: (result: ElementDocumentCommitResult) => void = () =>
      undefined;
    const { store, emit } = harness(
      () =>
        new Promise((next) => {
          resolve = next;
        }),
    );
    const pending = store.edit!([
      { op: 'setFrame', scene: '4key', id: 'k1', frame: { y: 30 } },
    ]);
    // 다른 창이 먼저 x를 바꿨다
    emit(nudgedPatch(2, 15));
    expect(store.getElement('4key', 'k1')?.frame).toMatchObject({
      x: 15,
      y: 30,
    });
    await Promise.resolve();
    resolve({
      status: 'rejected',
      revision: 2,
      code: 'VIOLATION',
      violations: [],
    });
    await pending;
    expect(store.getElement('4key', 'k1')?.frame).toMatchObject({
      x: 15,
      y: 0,
    });
  });

  it('앞 커밋의 응답이 오기 전에는 다음 커밋을 보내지 않는다', async () => {
    const sent: number[] = [];
    const resolvers: Array<(result: ElementDocumentCommitResult) => void> = [];
    const { store } = harness(
      (ops) =>
        new Promise((resolve) => {
          const op = ops[0];
          if (op.op === 'setFrame') sent.push(op.frame.x as number);
          resolvers.push(resolve);
        }),
    );
    const first = store.edit!(nudge('k1', 1));
    const second = store.edit!(nudge('k1', 2));
    await Promise.resolve();
    expect(sent).toEqual([1]);
    // 화면에는 둘 다 먼저 반영된다
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(2);
    resolvers[0]({ status: 'committed', revision: 2, changes: { scenes: {} } });
    await first;
    await Promise.resolve();
    expect(sent).toEqual([1, 2]);
    resolvers[1]({ status: 'committed', revision: 3, changes: { scenes: {} } });
    await second;
  });

  it('after가 있으면 화면에는 바로 얹고 보내기는 그것이 끝난 뒤다', async () => {
    const commit = vi.fn(async () => ({
      status: 'committed' as const,
      revision: 2,
      changes: { scenes: {} },
    }));
    const { store } = harness(commit);
    let release!: () => void;
    const after = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sent = store.edit!(nudge('k1', 7), { after });
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(7);
    await Promise.resolve();
    await Promise.resolve();
    expect(commit).not.toHaveBeenCalled();
    release();
    await sent;
    expect(commit).toHaveBeenCalledOnce();
  });

  it('앞 커밋이 실패해도 다음 커밋은 보낸다', async () => {
    let calls = 0;
    const { store } = harness(async () => {
      calls += 1;
      if (calls === 1) throw new Error('ipc');
      return { status: 'committed', revision: 2, changes: { scenes: {} } };
    });
    const first = store.edit!(nudge('k1', 1));
    const second = store.edit!(nudge('k1', 2));
    await expect(first).rejects.toThrow('ipc');
    expect((await second).status).toBe('committed');
  });

  it('장면을 통째로 바꾼 패치도 바뀌지 않은 요소는 같은 객체로 둔다', () => {
    const { store, emit } = harness(async () => ({
      status: 'committed',
      revision: 2,
      changes: { scenes: {} },
    }));
    const untouched = store.getElement('4key', 'k2');
    const after = document();
    const k1 = after.scenes['4key']!.nodes[0];
    if (k1.type === 'element') k1.frame.x = 90;
    emit({
      revision: 2,
      patch: {
        kindVersions: after.kindVersions,
        scenes: { '4key': { type: 'replace', scene: after.scenes['4key']! } },
        changes: {
          scenes: { '4key': { changed: ['k1'], removed: [], structure: true } },
        },
      },
    });
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(90);
    expect(store.getElement('4key', 'k2')).toBe(untouched);
  });
});

describe('편집 창 요소 문서 스토어 - 저장 실패', () => {
  const transientHarness = (
    commit: (ops: Op[]) => Promise<ElementDocumentCommitResult>,
  ) => {
    const transport: ElementDocumentTransport = {
      get: async () => ({ revision: 1, document: document() }),
      commit,
      onChanged: () => () => undefined,
    };
    return createEditorDocumentStore(
      { revision: 1, document: document() },
      transport,
      {
        isTransient: (failure) =>
          'error' in failure || failure.result.code === 'HISTORY_IN_PROGRESS',
        retryDelaysMs: [0, 0],
      },
    );
  };
  const inProgress: ElementDocumentCommitResult = {
    status: 'rejected',
    revision: 1,
    code: 'HISTORY_IN_PROGRESS',
    violations: [],
  };
  const committed = (revision: number): ElementDocumentCommitResult => ({
    status: 'committed',
    revision,
    changes: { scenes: {} },
  });

  it('일시 실패는 쉬었다 다시 보내 저장한다', async () => {
    const commit = vi
      .fn<(ops: Op[]) => Promise<ElementDocumentCommitResult>>()
      .mockRejectedValueOnce(new Error('io'))
      .mockResolvedValueOnce(inProgress)
      .mockResolvedValueOnce(committed(2));
    const store = transientHarness(commit);
    await expect(store.edit!(nudge('k1', 40))).resolves.toMatchObject({
      status: 'committed',
    });
    expect(commit).toHaveBeenCalledTimes(3);
    expect(store.getHeldCount!()).toBe(0);
  });

  it('다시 보내도 안 되면 화면에 남긴 채 보류하고, 뒤 편집도 차례대로 보류했다가 다시 보낸다', async () => {
    let failing = true;
    const sent: number[] = [];
    const commit = vi.fn(async (ops: Op[]) => {
      if (failing) throw new Error('io');
      const op = ops[0] as { frame: { x: number } };
      sent.push(op.frame.x);
      return committed(sent.length + 1);
    });
    const store = transientHarness(commit);
    const held = vi.fn();
    store.subscribeHeld!(held);

    await expect(store.edit!(nudge('k1', 40))).rejects.toBeInstanceOf(
      ElementEditHeldError,
    );
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(40);
    expect(store.getHeldCount!()).toBe(1);
    // 뒤 편집은 보내지 않고 보류 뒤에 선다 (기다리는 쪽이 멈추지 않게 바로 실패로 알린다)
    const calls = commit.mock.calls.length;
    await expect(store.edit!(nudge('k1', 50))).rejects.toBeInstanceOf(
      ElementEditHeldError,
    );
    expect(commit).toHaveBeenCalledTimes(calls);
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(50);
    expect(store.getHeldCount!()).toBe(2);
    expect(held).toHaveBeenCalled();

    failing = false;
    await expect(store.retryHeld!()).resolves.toBe(true);
    expect(sent).toEqual([40, 50]);
    expect(store.getHeldCount!()).toBe(0);
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(50);
  });

  it('영구 실패는 되돌리고 알린다', async () => {
    const rejected: ElementDocumentCommitResult = {
      status: 'rejected',
      revision: 1,
      code: 'VIOLATION',
      violations: [],
    };
    const store = transientHarness(async () => rejected);
    const onRejected = vi.fn();
    store.onRejected!(onRejected);
    await expect(store.edit!(nudge('k1', 40))).resolves.toBe(rejected);
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(0);
    expect(onRejected).toHaveBeenCalledWith({ result: rejected });
    expect(store.getHeldCount!()).toBe(0);
  });

  it('onCommitted는 받아들여졌을 때 한 번 - 보류했다 다시 보낸 뒤에도', async () => {
    let failing = true;
    const store = transientHarness(async () => {
      if (failing) throw new Error('io');
      return committed(2);
    });
    const onCommitted = vi.fn();
    const onDropped = vi.fn();
    await expect(
      store.edit!(nudge('k1', 40), { onCommitted, onDropped }),
    ).rejects.toBeInstanceOf(ElementEditHeldError);
    expect(onCommitted).not.toHaveBeenCalled();
    failing = false;
    await expect(store.retryHeld!()).resolves.toBe(true);
    expect(onCommitted).toHaveBeenCalledOnce();
    expect(onDropped).not.toHaveBeenCalled();
  });

  it('편집을 버릴 때만 onDropped를 부른다 - 보류했다 다시 보낸 편집이 영구 거절돼도', async () => {
    const rejected: ElementDocumentCommitResult = {
      status: 'rejected',
      revision: 1,
      code: 'VIOLATION',
      violations: [],
    };
    let outcome: 'io' | 'rejected' = 'io';
    const store = transientHarness(async () => {
      if (outcome === 'io') throw new Error('io');
      return rejected;
    });
    const onDropped = vi.fn();
    await expect(
      store.edit!(nudge('k1', 40), { onDropped }),
    ).rejects.toBeInstanceOf(ElementEditHeldError);
    expect(onDropped).not.toHaveBeenCalled();

    outcome = 'rejected';
    await expect(store.retryHeld!()).resolves.toBe(true);
    expect(onDropped).toHaveBeenCalledOnce();
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(0);
  });
});

describe('오버레이 요소 문서 스토어', () => {
  it('이미 본 리비전의 패치는 무시한다', () => {
    let emit: (event: ElementDocumentChangedEvent) => void = () => undefined;
    const store = createMirrorDocumentStore(
      { revision: 3, document: document() },
      {
        get: async () => ({ revision: 3, document: document() }),
        onChanged: (listener) => {
          emit = listener;
          return () => undefined;
        },
      },
    );
    const patch = {
      kindVersions: {},
      scenes: { '4key': { type: 'delete' as const } },
      changes: {
        scenes: {
          '4key': { changed: [], removed: [], structure: false, deleted: true },
        },
      },
    };
    emit({ revision: 3, patch });
    expect(store.getScene('4key')).toBeDefined();
    emit({ revision: 4, patch });
    expect(store.getScene('4key')).toBeUndefined();
  });

  it('다시 맞추면 문서를 통째로 받아 온다 - 앱을 다시 켜 리비전이 처음부터 시작해도 따라간다', async () => {
    let emit: (event: ElementDocumentChangedEvent) => void = () => undefined;
    const restarted = document();
    restarted.scenes['5key'] = { nodes: [] };
    const store = createMirrorDocumentStore(
      { revision: 40, document: document() },
      {
        get: async () => ({ revision: 2, document: restarted }),
        onChanged: (listener) => {
          emit = listener;
          return () => undefined;
        },
      },
    );
    const notified = vi.fn();
    store.subscribe(notified);
    await store.resync?.();
    expect(store.getRevision()).toBe(2);
    expect(store.getScene('5key')).toEqual({ nodes: [] });
    expect(notified).toHaveBeenCalledWith({
      scenes: {
        '4key': { changed: [], removed: [], structure: true },
        '5key': { changed: [], removed: [], structure: true },
      },
    });
    // 다시 켠 앱의 다음 패치를 받는다
    emit({
      revision: 3,
      patch: {
        kindVersions: {},
        scenes: { '5key': { type: 'delete' } },
        changes: {
          scenes: {
            '5key': {
              changed: [],
              removed: [],
              structure: false,
              deleted: true,
            },
          },
        },
      },
    });
    expect(store.getScene('5key')).toBeUndefined();
  });

  it('다시 맞추는 동안 온 패치는 받아 온 문서보다 새 것만 뒤에 적용한다', async () => {
    let emit: (event: ElementDocumentChangedEvent) => void = () => undefined;
    let respond: (value: {
      revision: number;
      document: Document;
    }) => void = () => undefined;
    const store = createMirrorDocumentStore(
      { revision: 1, document: document() },
      {
        get: () => new Promise((resolve) => (respond = resolve)),
        onChanged: (listener) => {
          emit = listener;
          return () => undefined;
        },
      },
    );
    expect(store.resync).toBeDefined();
    const resynced = store.resync?.();
    const moved = (revision: number, x: number) => ({
      revision,
      patch: {
        kindVersions: {},
        scenes: {
          '4key': {
            type: 'nodes' as const,
            nodes: [
              {
                ...document().scenes['4key'].nodes[0],
                frame: { x, y: 0, width: 60, height: 60, rotation: 0 },
              } as Node,
            ],
          },
        },
        changes: {
          scenes: {
            '4key': { changed: ['k1'], removed: [], structure: false },
          },
        },
      },
    });
    emit(moved(5, 10));
    emit(moved(7, 30));
    respond({ revision: 6, document: document() });
    await resynced;
    expect(store.getRevision()).toBe(7);
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(30);
  });
});
