// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { createDefaultKeyPosition } from '@src/renderer/editor/model/keys';
import { makeCanonicalSpritePosition } from '@utils/sprite/spriteFixtures';
import type {
  CanonicalEditorDocumentV1,
  CanonicalReactiveSpritePosition,
} from '@src/types/editor';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';

const mocks = vi.hoisted(() => ({
  document: null as unknown as CanonicalEditorDocumentV1,
  commitOps: vi.fn((_ops: unknown[], _meta?: { gestureId?: string }) =>
    Promise.resolve({ document: null, opResults: [] }),
  ),
  commitFrames: vi.fn(
    (_scene: string, _ids: Iterable<string>, _gestureId?: string) =>
      Promise.resolve(),
  ),
  commitBatchGeometryByIds: vi.fn(() => Promise.resolve(true)),
}));

vi.mock(
  '@src/renderer/editor/runtime/operations/editorSemanticOps',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    captureEditorDocument: () => mocks.document,
    commitSemanticOps: mocks.commitOps,
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
vi.mock('@plugins/runtime/displayElement/pluginTreeGeometry', () => ({
  applyPluginElementEdit: (
    _scene: string,
    ids: ReadonlySet<string>,
    change: (ids: ReadonlySet<string>) => void,
  ) => change(ids),
  commitPluginFrames: (
    scene: string,
    ids: Iterable<string>,
    gestureId?: string,
  ) => mocks.commitFrames(scene, [...ids], gestureId),
}));

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
    sprite?: CanonicalReactiveSpritePosition;
  } = {},
) => {
  mocks.document = {
    schemaVersion: 1,
    keys: { '4key': [''] },
    keyPositions: {
      '4key': [{ ...createDefaultKeyPosition(), id: KEY_ID }],
    },
    statPositions: {},
    graphPositions: {},
    knobPositions: {},
    spritePositions: options.sprite ? { '4key': [options.sprite] } : {},
    layerGroups: {},
  } as unknown as CanonicalEditorDocumentV1;
  usePluginDisplayElementStore.setState({
    elements: options.plugins ?? [pluginElement()],
  });
};

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
    mocks.commitOps.mockClear();
    mocks.commitFrames.mockClear();
    mocks.commitBatchGeometryByIds.mockClear();
    seed();
  });

  it('혼합 정렬은 옛 종류 setBounds 연산과 플러그인 틀 커밋을 같은 동작 id로 보낸다', async () => {
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
    for (const [, meta] of mocks.commitOps.mock.calls) {
      expect(meta?.gestureId).toBe(gestureId);
    }
  });

  it('혼합 배치의 스프라이트는 resizeSprite 연산에 full bounds를 싣는다', async () => {
    const sprite = {
      ...makeCanonicalSpritePosition(),
      id: SPRITE_ID,
      dx: 300,
      dy: 0,
      width: 40,
      height: 40,
    } as CanonicalReactiveSpritePosition;
    seed({ sprite });
    await commitMixedBatchGeometry(align([{ type: 'sprite', id: SPRITE_ID }]), [
      FULL_ID,
    ]);
    const [ops] = mocks.commitOps.mock.calls[0];
    expect(ops).toEqual([
      {
        kind: 'resizeSprite',
        id: SPRITE_ID,
        bounds: { dx: 100, dy: 0, width: 40, height: 40 },
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

  it('resize에 plugin이 섞이거나 대상이 없거나 모드 밖이면 거절한다', async () => {
    await expect(
      commitMixedBatchGeometry(
        {
          ...align(),
          operation: { kind: 'resize', axis: 'width', mode: 'max' },
        } as never,
        [FULL_ID],
      ),
    ).resolves.toBe(false);
    await expect(
      commitMixedBatchGeometry(align(), ['plugin-a::missing']),
    ).resolves.toBe(false);
    seed({ plugins: [pluginElement({ tabId: '5key' })] });
    await expect(commitMixedBatchGeometry(align(), [FULL_ID])).resolves.toBe(
      false,
    );
    expect(mocks.commitOps).not.toHaveBeenCalled();
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
      expect(mocks.commitOps).not.toHaveBeenCalled();
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
