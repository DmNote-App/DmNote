import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultKeyPosition } from '@src/renderer/editor/model/keys';

const { commitPatch, commitTreeLegacyFields } = vi.hoisted(() => ({
  commitPatch: vi.fn(),
  commitTreeLegacyFields: vi.fn(),
}));

vi.mock('@src/renderer/editor/runtime/lifecycle/legacyEditorMutation', () => ({
  commitLegacyEditorPatch: commitPatch,
  runExclusiveLegacyMutation: (mutation: () => Promise<unknown>) => mutation(),
}));
vi.mock('@src/renderer/editor/runtime/operations/editorSemanticOps', () => ({
  commitTreeLegacyFields,
}));

import { keysApi, updatePositionsWithGesture } from './keysApi';
import {
  graphItemsApi,
  knobItemsApi,
  layerGroupsApi,
  spriteItemsApi,
  statItemsApi,
} from './itemsApi';

import type {
  CanonicalReactiveSpritePosition,
  EditorDocumentV1,
} from '@src/types/editor';
import type { KeyPositions } from '@src/types/key/keys';

const document: EditorDocumentV1 = {
  schemaVersion: 1,
  keys: { '4key': ['A'] },
  keyPositions: { '4key': [createDefaultKeyPosition()] },
  statPositions: {},
  graphPositions: {},
  knobPositions: {},
  spritePositions: {},
  layerGroups: { '4key': [{ id: 'group-1', name: 'Group 1' }] },
};

// 백엔드 실물 wire 형태: layerName·groupId는 None이면 직렬화에서 생략된다
const spriteFixture = (id: string): CanonicalReactiveSpritePosition => ({
  activation: 'whileHeld',
  pressDurationMs: 300,
  id,
  dx: 0,
  dy: 0,
  width: 200,
  height: 150,
  rotation: 0,
  hidden: false,
  zIndex: null,
  className: null,
  useInlineStyles: null,
  baseImage: null,
  pivot: { x: 0.5, y: 0.5 },
  idleTransform: { x: 0, y: 0, rotation: 0, scale: 1 },
  poses: [],
  transitionMs: 90,
  transitionEasing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  referenceNaturalSize: null,
});

describe('editor API compatibility adapters', () => {
  beforeEach(() => {
    commitPatch.mockReset();
    commitPatch.mockResolvedValue(structuredClone(document));
    commitTreeLegacyFields.mockReset();
  });

  it('routes key writers through editor_commit and preserves return shapes', async () => {
    const mappings = { '4key': ['A'] };
    // 입력 echo와 canonical fixture가 값 비교되므로 id까지 같은 사본을 쓴다
    const positions = structuredClone(document.keyPositions) as KeyPositions;

    await expect(keysApi.update(mappings)).resolves.toEqual(document.keys);
    await expect(keysApi.updatePositions(positions)).resolves.toEqual(
      document.keyPositions,
    );
    await expect(
      keysApi.updateWithPositions(mappings, positions),
    ).resolves.toEqual({
      keys: document.keys,
      positions: document.keyPositions,
    });

    expect(commitPatch.mock.calls).toEqual([
      [{ schemaVersion: 1, keys: mappings }],
      [{ schemaVersion: 1, keyPositions: positions }, undefined],
      [
        {
          schemaVersion: 1,
          keys: mappings,
          keyPositions: positions,
        },
        undefined,
      ],
    ]);

    commitPatch.mockClear();
    commitPatch.mockResolvedValue(structuredClone(document));
    await updatePositionsWithGesture(
      positions,
      '6f9c2f6a-0b1d-4e5f-8a3c-2d7e9b4c1a50',
    );
    expect(commitPatch).toHaveBeenCalledWith(
      { schemaVersion: 1, keyPositions: positions },
      { gestureId: '6f9c2f6a-0b1d-4e5f-8a3c-2d7e9b4c1a50' },
    );
  });

  it('routes every item collection writer and returns its canonical field', async () => {
    await expect(statItemsApi.updatePositions({})).resolves.toEqual({});
    await expect(graphItemsApi.updatePositions({})).resolves.toEqual({});
    await expect(knobItemsApi.updatePositions({})).resolves.toEqual({});
    await expect(layerGroupsApi.update(document.layerGroups)).resolves.toEqual(
      document.layerGroups,
    );

    expect(commitPatch.mock.calls).toEqual([
      [{ schemaVersion: 1, statPositions: {} }],
      [{ schemaVersion: 1, graphPositions: {} }],
      [{ schemaVersion: 1, knobPositions: {} }],
      [{ schemaVersion: 1, layerGroups: document.layerGroups }],
    ]);
  });

  it('sprite patchPosition은 지금 값에서 패치를 만들어 트리로 보낸다', async () => {
    const sprite = spriteFixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    commitTreeLegacyFields.mockImplementation(
      (
        _type: string,
        _mode: string,
        _id: string,
        makeFields: (current: unknown) => Record<string, unknown> | null,
      ) => {
        expect(makeFields({ ...sprite, layerName: 'old' })).toEqual({
          layerName: 'new',
        });
        return Promise.resolve('committed');
      },
    );

    await expect(
      spriteItemsApi.patchPosition(
        '4key',
        sprite.id,
        { layerName: 'new' },
        'g1',
      ),
    ).resolves.toBe('committed');
    expect(commitTreeLegacyFields).toHaveBeenCalledWith(
      'sprite',
      '4key',
      sprite.id,
      expect.any(Function),
      'g1',
    );
  });

  it('sprite patchPosition은 지금 장면 트리에 없으면 무커밋 targetMissing이다', async () => {
    commitTreeLegacyFields.mockReturnValue(null);
    await expect(
      spriteItemsApi.patchPosition('4key', 'missing', { layerName: 'x' }),
    ).resolves.toBe('targetMissing');
    expect(commitPatch).not.toHaveBeenCalled();
  });
});
