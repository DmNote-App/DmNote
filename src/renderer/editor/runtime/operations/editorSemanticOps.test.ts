import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  commitSemanticOpsInternal: vi.fn(),
  commitGeneratedSemanticOpsInternal: vi.fn(),
  discardSemanticGesture: vi.fn(),
}));

vi.mock('../coordinator/editorStateCoordinator', () => ({
  editorCoordinator: {
    commitSemanticOpsInternal: api.commitSemanticOpsInternal,
    commitGeneratedSemanticOpsInternal: api.commitGeneratedSemanticOpsInternal,
    discardSemanticGesture: api.discardSemanticGesture,
  },
  captureEditorDocument: () => ({}),
}));

// 트리 문서 - 노브 하나가 있는 장면
const tree = vi.hoisted(() => ({
  store: null as null | {
    getElement: (scene: string, id: string) => unknown;
    edit: ReturnType<typeof vi.fn>;
  },
}));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => tree.store,
}));

import { enqueueEditorCompatibilityWrite } from '../lifecycle/editorCompatibilityQueue';
import {
  commitGeneratedSemanticOps,
  commitSemanticOps,
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
