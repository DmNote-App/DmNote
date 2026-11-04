// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';

const mocks = vi.hoisted(() => ({
  // 트리 문서 - 지금 탭의 옛 종류 요소 틀
  nodes: [] as Array<{
    id: string;
    kind: string;
    frame: { x: number; y: number; width: number; height: number };
  }>,
  commitTreeFrames: vi.fn(
    (_targets: unknown[], _options?: { gestureId?: string }) =>
      Promise.resolve([] as string[]),
  ),
  commitFrames: vi.fn(
    (_scene: string, _ids: Iterable<string>, _gestureId?: string) =>
      Promise.resolve(),
  ),
  commitBatchGeometryByIds: vi.fn(() => Promise.resolve(true)),
  // 마지막 플러그인 틀 커밋의 틀
  pluginFrames: new Map<string, Record<string, number>>(),
}));

vi.mock(
  '@src/renderer/editor/document/elementDocumentRuntime',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getElementDocumentStore: () => ({
      getElement: (scene: string, id: string) =>
        scene === '4key'
          ? mocks.nodes.find((node) => node.id === id)
          : undefined,
    }),
  }),
);
vi.mock(
  '@src/renderer/editor/runtime/operations/treeEditCommit',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    commitFrames: mocks.commitTreeFrames,
  }),
);
vi.mock(
  '@src/renderer/editor/runtime/operations/elementOps',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@src/renderer/editor/runtime/operations/elementOps')
    >()),
    commitBatchGeometryByIds: mocks.commitBatchGeometryByIds,
  }),
);
// 플러그인 틀 - 트리 틀 연산을 기록하고, 런타임이 트리를 따라오는 것처럼 위치를 바로 얹는다
vi.mock('@plugins/runtime/displayElement/pluginTreeGeometry', async () => {
  const { usePluginDisplayElementStore: store } = await import(
    '@stores/plugin/usePluginDisplayElementStore'
  );
  return {
    setPluginElementFrames: (
      scene: string,
      frames: ReadonlyMap<string, { x?: number; y?: number }>,
      gestureId?: string,
    ) => {
      mocks.pluginFrames = new Map(frames) as never;
      const state = store.getState();
      state.setElements(
        state.elements.map((element) => {
          const frame = frames.get(element.fullId);
          return frame
            ? {
                ...element,
                position: {
                  x: frame.x ?? element.position.x,
                  y: frame.y ?? element.position.y,
                },
              }
            : element;
        }),
      );
      return mocks.commitFrames(scene, [...frames.keys()], gestureId);
    },
  };
});

import { commitMixedBatchGeometry } from './mixedBatchGeometry';
import type { BatchGeometryDescriptor } from '../operations/elementOps';

const KEY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SPRITE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const FULL_ID = 'plugin-a::10000000-0000-4000-8000-000000000001';
const SECOND_FULL_ID = 'plugin-a::10000000-0000-4000-8000-000000000002';

const pluginElement = (
  overrides: Partial<PluginDisplayElementInternal> = {},
): PluginDisplayElementInternal =>
  ({
    id: FULL_ID.split('::')[1],
    fullId: FULL_ID,
    pluginId: 'plugin-a',
    definitionId: 'plugin-a',
    position: { x: 100, y: 0 },
    estimatedSize: { width: 50, height: 50 },
    settings: { label: 'kept' },
    tabId: '4key',
    zIndex: 0,
    ...overrides,
  } as never);

const seed = (
  options: {
    plugins?: PluginDisplayElementInternal[];
    sprite?: { x: number; y: number; width: number; height: number };
    // 크기를 정하는 플러그인 (정의의 resizable)
    resizable?: boolean;
  } = {},
) => {
  mocks.nodes = [
    { id: KEY_ID, kind: 'key', frame: { x: 0, y: 0, width: 60, height: 60 } },
    ...(options.sprite
      ? [{ id: SPRITE_ID, kind: 'sprite', frame: options.sprite }]
      : []),
  ];
  usePluginDisplayElementStore.setState({
    elements: options.plugins ?? [pluginElement()],
    definitions: new Map([
      ['plugin-a', { resizable: options.resizable ?? false } as never],
    ]),
  });
};

const resizeWidth = (
  value: number,
  targets: BatchGeometryDescriptor['targets'] = [{ type: 'key', id: KEY_ID }],
): BatchGeometryDescriptor => ({
  mode: '4key',
  targets,
  operation: { kind: 'resize', dimension: 'width', value },
});

const align = (
  targets: BatchGeometryDescriptor['targets'] = [{ type: 'key', id: KEY_ID }],
): BatchGeometryDescriptor => ({
  mode: '4key',
  targets,
  operation: { kind: 'align', direction: 'left' },
});

const pluginPosition = (fullId = FULL_ID) =>
  usePluginDisplayElementStore
    .getState()
    .elements.find((element) => element.fullId === fullId)?.position;

describe('commitMixedBatchGeometry', () => {
  beforeEach(() => {
    mocks.commitTreeFrames.mockClear();
    mocks.commitFrames.mockClear();
    mocks.commitBatchGeometryByIds.mockClear();
    seed();
  });

  it('혼합 정렬은 옛 종류 틀 커밋과 플러그인 틀 커밋을 같은 동작 id로 보낸다', async () => {
    // key 0..60, plugin 100..150 - align left로 plugin만 이동
    await expect(commitMixedBatchGeometry(align(), [FULL_ID])).resolves.toBe(
      true,
    );
    expect(pluginPosition()).toEqual({ x: 0, y: 0 });
    expect(mocks.commitFrames).toHaveBeenCalledOnce();
    const [scene, ids, gestureId] = mocks.commitFrames.mock.calls[0];
    expect(scene).toBe('4key');
    expect(ids).toEqual([FULL_ID]);
    expect(typeof gestureId).toBe('string');
    // 옛 종류는 그대로라 연산이 있어도 같은 동작 id
    for (const [, options] of mocks.commitTreeFrames.mock.calls) {
      expect(options?.gestureId).toBe(gestureId);
    }
  });

  it('혼합 배치의 스프라이트도 틀 전체(위치·크기)를 싣는다', async () => {
    seed({ sprite: { x: 300, y: 0, width: 40, height: 40 } });
    await commitMixedBatchGeometry(align([{ type: 'sprite', id: SPRITE_ID }]), [
      FULL_ID,
    ]);
    const [frames] = mocks.commitTreeFrames.mock.calls[0];
    expect(frames).toEqual([
      {
        elementType: 'sprite',
        id: SPRITE_ID,
        frame: { x: 100, y: 0, width: 40, height: 40 },
      },
    ]);
  });

  it('플러그인은 위치만 바꾸고 다른 영속 필드는 지킨다', async () => {
    await commitMixedBatchGeometry(align(), [FULL_ID]);
    const element = usePluginDisplayElementStore.getState().elements[0];
    expect(element.settings).toEqual({ label: 'kept' });
    expect(element.zIndex).toBe(0);
  });

  it('옵션 gestureId(간격 세션)는 그대로 커밋 동작 id로 쓴다', async () => {
    await commitMixedBatchGeometry(align(), [FULL_ID], { gestureId: 'g-1' });
    expect(mocks.commitFrames.mock.calls[0][2]).toBe('g-1');
  });

  it('plugin 대상이 없으면 기존 native 전용 경로에 위임한다', async () => {
    await commitMixedBatchGeometry(align(), []);
    expect(mocks.commitBatchGeometryByIds).toHaveBeenCalledOnce();
    expect(mocks.commitFrames).not.toHaveBeenCalled();
  });

  it('크기 일괄은 크기를 정하는 플러그인(resizable)의 틀 크기도 같은 동작 id로 바꾼다', async () => {
    seed({
      resizable: true,
      sprite: { x: 300, y: 0, width: 40, height: 20 },
    });
    await expect(
      commitMixedBatchGeometry(
        resizeWidth(80, [
          { type: 'key', id: KEY_ID },
          { type: 'sprite', id: SPRITE_ID },
        ]),
        [FULL_ID],
      ),
    ).resolves.toBe(true);
    const [frames, options] = mocks.commitTreeFrames.mock.calls[0];
    // 스프라이트는 비율 그대로
    expect(frames).toEqual([
      {
        elementType: 'key',
        id: KEY_ID,
        frame: { x: 0, y: 0, width: 80, height: 60 },
      },
      {
        elementType: 'sprite',
        id: SPRITE_ID,
        frame: { x: 300, y: 0, width: 80, height: 40 },
      },
    ]);
    expect(mocks.pluginFrames.get(FULL_ID)).toEqual({
      x: 100,
      y: 0,
      width: 80,
      height: 50,
    });
    expect(mocks.commitFrames.mock.calls[0][2]).toBe(options?.gestureId);
  });

  it('크기 일괄에 내용이 크기를 정하는 플러그인이 섞이거나 대상이 없거나 모드 밖이면 거절한다', async () => {
    await expect(
      commitMixedBatchGeometry(resizeWidth(80), [FULL_ID]),
    ).resolves.toBe(false);
    await expect(
      commitMixedBatchGeometry(align(), ['plugin-a::missing']),
    ).resolves.toBe(false);
    seed({ plugins: [pluginElement({ tabId: '5key' })] });
    await expect(commitMixedBatchGeometry(align(), [FULL_ID])).resolves.toBe(
      false,
    );
    expect(mocks.commitTreeFrames).not.toHaveBeenCalled();
    expect(mocks.commitFrames).not.toHaveBeenCalled();
  });

  it('미리 막는 검사가 던지면 아무것도 고치지 않는다', async () => {
    const failure = new Error('preflight');
    expect(() =>
      commitMixedBatchGeometry(align(), [FULL_ID], {
        preflight: () => {
          throw failure;
        },
      }),
    ).toThrow(failure);
    expect(pluginPosition()).toEqual({ x: 100, y: 0 });
    expect(mocks.commitFrames).not.toHaveBeenCalled();
  });

  describe('plugin 단독 배치 (native 대상 0개)', () => {
    it('옛 종류 연산 없이 플러그인 틀 커밋만 보낸다', async () => {
      seed({
        plugins: [
          pluginElement(),
          pluginElement({
            id: SECOND_FULL_ID.split('::')[1],
            fullId: SECOND_FULL_ID,
            position: { x: 300, y: 20 },
          }),
        ],
      });
      await expect(
        commitMixedBatchGeometry(align([]), [FULL_ID, SECOND_FULL_ID]),
      ).resolves.toBe(true);
      expect(mocks.commitTreeFrames).not.toHaveBeenCalled();
      // 바뀐 틀만 고르는 일은 틀 커밋이 맡는다
      expect(mocks.commitFrames.mock.calls[0][1]).toEqual([
        FULL_ID,
        SECOND_FULL_ID,
      ]);
      expect(pluginPosition(SECOND_FULL_ID)).toEqual({ x: 100, y: 20 });
    });

    it('plugin 1개 단독은 합산 최소 미달로 거절한다', async () => {
      await expect(
        commitMixedBatchGeometry(align([]), [FULL_ID]),
      ).resolves.toBe(false);
    });
  });
});
