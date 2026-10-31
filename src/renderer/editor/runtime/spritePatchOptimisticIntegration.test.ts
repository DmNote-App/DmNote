import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FakeElementDocumentBackend } from '@src/renderer/__tests__/fakeElementDocumentBackend';
import type { Document } from '@src/types/generated/elementDocument';

const SPRITE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// IPC 경계만 대역 - 트리 스토어·런타임·스프라이트 쓰기 입구는 실물
const ipc = vi.hoisted(() => ({
  backend: null as FakeElementDocumentBackend | null,
}));
vi.mock('@api/modules/editor/elementDocumentApi', () => ({
  elementDocumentApi: new Proxy(
    {},
    {
      get: (_target, name: string) =>
        (ipc.backend!.api as Record<string, unknown>)[name],
    },
  ),
}));

const makeDocument = (): Document =>
  ({
    formatVersion: 1,
    kindVersions: { sprite: 1 },
    scenes: {
      '4key': {
        nodes: [
          {
            type: 'element',
            id: SPRITE_ID,
            kind: 'sprite',
            frame: { x: 0, y: 0, width: 200, height: 150, rotation: 0 },
            values: {
              activation: 'whileHeld',
              pressDurationMs: 300,
              baseImage: null,
              pivot: { x: 0.5, y: 0.5 },
              idleTransform: { x: 0, y: 0, rotation: 0, scale: 1 },
              poses: [],
              transitionMs: 90,
              transitionEasing: 'cubic-bezier(0.4, 0, 0.2, 1)',
              referenceNaturalSize: null,
            },
          },
        ],
      },
    },
  } as unknown as Document);

const loadHarness = async () => {
  const [backend, runtime, itemsApi, position] = await Promise.all([
    import('@src/renderer/__tests__/fakeElementDocumentBackend'),
    import('@src/renderer/editor/document/elementDocumentRuntime'),
    import('@api/modules/editor/itemsApi'),
    import('@src/renderer/elementKinds/runtime/treeElementPosition'),
  ]);
  ipc.backend = backend.createFakeElementDocumentBackend(makeDocument());
  await runtime.loadElementDocumentStore();
  return {
    spriteItemsApi: itemsApi.spriteItemsApi,
    current: () =>
      position.currentTreePosition('4key', SPRITE_ID) as Record<
        string,
        unknown
      >,
  };
};
type Harness = Awaited<ReturnType<typeof loadHarness>>;

describe('스프라이트 필드 패치 낙관 적용 통합 (트리 스토어)', () => {
  let harness: Harness;
  const backend = () => ipc.backend!;

  beforeEach(async () => {
    vi.resetModules();
    window.__dmn_window_type = 'main';
    harness = await loadHarness();
  });

  it('patchPosition은 응답 착지 전에 지금 값에 반영되고, 바뀐 칸만 보낸다', async () => {
    backend().hold();
    const write = harness.spriteItemsApi.patchPosition('4key', SPRITE_ID, {
      baseImage: 'hand.png',
    });

    await vi.waitFor(() => expect(backend().commit).toHaveBeenCalledOnce(), {
      timeout: 5000,
    });
    expect(harness.current()).toMatchObject({
      id: SPRITE_ID,
      baseImage: 'hand.png',
    });
    const ops = backend().commit.mock.calls[0][0];
    expect(ops).toEqual([
      {
        op: 'setValues',
        scene: '4key',
        id: SPRITE_ID,
        values: { baseImage: 'hand.png' },
      },
    ]);

    backend().release();
    await expect(write).resolves.toBe('committed');
    expect(harness.current().baseImage).toBe('hand.png');
  });

  it('클릭 순서로 고른 자세 트리거도 저장 모양(정렬)으로 낙관 반영되고 후속 편집이 이어진다', async () => {
    const A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const clickOrderPose = {
      poseId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      triggers: [B_ID, A_ID],
      transform: { x: 0, y: 0, rotation: 0, scale: 1 },
      imageOverride: null,
      imageOverrideMetrics: null,
    };

    backend().hold();
    const first = harness.spriteItemsApi.patchPosition('4key', SPRITE_ID, {
      poses: [clickOrderPose],
    });
    await vi.waitFor(() => expect(backend().commit).toHaveBeenCalledOnce(), {
      timeout: 5000,
    });
    const poses = () =>
      harness.current().poses as Array<{ triggers: string[] }>;
    expect(poses()[0].triggers).toEqual([A_ID, B_ID]);

    // 첫 응답 전에 이어서 고친다 - 앞 편집 위에 얹힌다
    const second = harness.spriteItemsApi.patchPosition('4key', SPRITE_ID, {
      baseImage: 'hand.png',
    });
    await vi.waitFor(
      () => expect(harness.current().baseImage).toBe('hand.png'),
      { timeout: 5000 },
    );
    expect(poses()[0].triggers).toEqual([A_ID, B_ID]);

    backend().release();
    await expect(first).resolves.toBe('committed');
    await expect(second).resolves.toBe('committed');
    expect(harness.current().baseImage).toBe('hand.png');
    expect(poses()[0].triggers).toEqual([A_ID, B_ID]);
  });

  it('대상이 없으면 보내지 않고 targetMissing을 돌려준다', async () => {
    const write = harness.spriteItemsApi.patchPosition(
      '4key',
      'missing-sprite-id',
      { baseImage: 'hand.png' },
    );

    await expect(write).resolves.toBe('targetMissing');
    expect(backend().commit).not.toHaveBeenCalled();
    expect(harness.current().baseImage).toBeNull();
  });
});
