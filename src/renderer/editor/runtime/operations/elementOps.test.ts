import { beforeEach, describe, expect, it, vi } from 'vitest';

// 트리 커밋 입구 대역 - 칸 쓰기 함수가 거르는 것과 보내는 대상·패치·틀만 본다 (커밋은 treeEditCommit 테스트)
const api = vi.hoisted(() => ({
  commitPropertyPatch: vi.fn(),
  commitFrames: vi.fn(),
}));
vi.mock('./treeEditCommit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./treeEditCommit')>()),
  commitPropertyPatch: api.commitPropertyPatch,
  commitFrames: api.commitFrames,
}));

// 트리 문서 - 테스트가 꾸민 요소의 지금 틀 (트리 낙관 반영 포함)
const tree = vi.hoisted(() => ({
  scenes: {} as Record<string, Array<{ id: string; kind: string }>>,
}));
vi.mock(
  '@src/renderer/editor/document/elementDocumentRuntime',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@src/renderer/editor/document/elementDocumentRuntime')
    >()),
    getElementDocumentStore: () => ({
      getElement: (scene: string, id: string) =>
        tree.scenes[scene]?.find((node) => node.id === id),
      getSceneIds: () => Object.keys(tree.scenes),
    }),
  }),
);

import { useKeyStore } from '@stores/data/useKeyStore';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import {
  commitBatchGeometryByIds,
  commitElementGeometryById,
  commitSingleElementBoundsById,
  patchElementHiddenById,
  patchElementLayerNameById,
  patchFontStyleByTargets,
  patchFontFamilyByTargets,
  patchStylePropertyById,
  patchStylePropertyByTargets,
  patchPaintByTargets,
  patchShadowByTargets,
  patchNotePaintById,
  patchNotePaintByIds,
  patchGraphColorsByIds,
  patchGraphPropertiesByIds,
  patchGraphTypesByIds,
  patchKnobPropertiesByIds,
  patchSoundEnabledByIds,
  patchSoundPathByIds,
  patchSoundVolumeByIds,
  patchCounterAnimationEnabledByTargets,
  patchCounterAnimationPresetByTargets,
  patchCounterEnabledByTargets,
  patchCounterLayoutByTargets,
  patchCounterTypographyByTargets,
  patchCounterFillByTargets,
  patchInactiveImageByTargets,
  patchActiveImageByTargets,
  patchIdleTransparentByTargets,
  patchActiveTransparentById,
  patchActiveTransparentByTargets,
  patchIdleImageFitById,
  patchActiveImageFitById,
  patchNotePropertiesByIds,
  patchUseInlineStylesByTargets,
} from './elementOps';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

const node = (
  kind: string,
  id: string,
  frame: Partial<{ x: number; y: number; width: number; height: number }> = {},
) => ({
  type: 'element',
  id,
  kind,
  frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0, ...frame },
});

describe('elementOps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.commitPropertyPatch.mockImplementation(async (targets: unknown[]) =>
      targets.map(() => 'applied'),
    );
    api.commitFrames.mockImplementation(async (targets: unknown[]) =>
      targets.map(() => 'applied'),
    );
    useKeyStore.setState({ selectedKeyType: '4key' });
    tree.scenes = { '4key': [node('key', ID_A), node('key', ID_B)] };
    useDocumentSelectionStore.setState({ selectedElements: [] });
  });

  it('단일 축 기하는 지금 틀의 나머지를 보존한다', async () => {
    tree.scenes['4key'] = [
      node('key', ID_A, { x: 10, y: 77, width: 123, height: 91 }),
      node('key', ID_B),
    ];

    await commitElementGeometryById('key', ID_A, { dx: 50 });

    expect(api.commitFrames).toHaveBeenCalledWith(
      [
        {
          elementType: 'key',
          id: ID_A,
          frame: { x: 50, y: 77, width: 123, height: 91 },
        },
      ],
      {},
    );
  });

  it('단일 축 기하는 호출 뒤 patch 변조와 무관하게 부른 때의 값을 쓴다', async () => {
    const patch = { dx: 50 } as { dx: number; dy?: number };

    const committed = commitElementGeometryById('key', ID_A, patch);
    patch.dx = 999;
    patch.dy = 777;
    await committed;

    expect(api.commitFrames.mock.calls[0][0][0].frame).toMatchObject({
      x: 50,
      y: 0,
    });
  });

  it('단일 축 기하 대상이 트리에 없거나 종류가 다르면 보내지 않고 false로 끝난다', async () => {
    tree.scenes['4key'] = [node('key', ID_B)];

    await expect(
      commitElementGeometryById('key', ID_A, { width: 90 }),
    ).resolves.toBe(false);
    await expect(
      commitElementGeometryById('stat', ID_B, { width: 90 }),
    ).resolves.toBe(false);
    expect(api.commitFrames).not.toHaveBeenCalled();
  });

  it('단일 축 기하의 커밋 실패는 오류로 올린다', async () => {
    api.commitFrames.mockRejectedValueOnce(new Error('start failed'));

    await expect(
      commitElementGeometryById('key', ID_A, { height: 80 }),
    ).rejects.toThrow('start failed');
  });

  it('배치 정렬은 대상 전부의 틀을 커밋 하나로 보낸다', async () => {
    tree.scenes['4key'] = [
      node('key', ID_A, { x: 10, y: 0, width: 10, height: 20 }),
      node('stat', ID_B, { x: 50, y: 10, width: 20, height: 30 }),
    ];

    await commitBatchGeometryByIds({
      mode: '4key',
      targets: [
        { type: 'key', id: ID_A },
        { type: 'stat', id: ID_B },
      ],
      operation: { kind: 'align', direction: 'right' },
    });

    expect(api.commitFrames).toHaveBeenCalledOnce();
    expect(api.commitFrames.mock.calls[0][0]).toEqual([
      {
        elementType: 'key',
        id: ID_A,
        frame: { x: 60, y: 0, width: 10, height: 20 },
      },
      {
        elementType: 'stat',
        id: ID_B,
        frame: { x: 50, y: 10, width: 20, height: 30 },
      },
    ]);
  });

  it('배치 기하 대상 하나라도 그 탭에 그 종류로 없으면 보내지 않고 false로 끝난다', async () => {
    await expect(
      commitBatchGeometryByIds({
        mode: '4key',
        targets: [
          { type: 'key', id: ID_A },
          { type: 'key', id: '33333333-3333-4333-8333-333333333333' },
        ],
        operation: { kind: 'align', direction: 'left' },
      }),
    ).resolves.toBe(false);
    await expect(
      commitBatchGeometryByIds({
        mode: 'custom',
        targets: [
          { type: 'key', id: ID_A },
          { type: 'key', id: ID_B },
        ],
        operation: { kind: 'align', direction: 'left' },
      }),
    ).resolves.toBe(false);
    await expect(
      commitBatchGeometryByIds({
        mode: '4key',
        targets: [
          { type: 'key', id: ID_A },
          { type: 'stat', id: ID_B },
        ],
        operation: { kind: 'align', direction: 'left' },
      }),
    ).resolves.toBe(false);

    expect(api.commitFrames).not.toHaveBeenCalled();
  });

  it('간격이 이미 맞으면 보내지 않고 false를 반환한다', async () => {
    tree.scenes['4key'] = [
      node('key', ID_A, { x: 0, width: 10 }),
      node('key', ID_B, { x: 15, width: 10 }),
    ];
    await expect(
      commitBatchGeometryByIds({
        mode: '4key',
        targets: [
          { type: 'key', id: ID_A },
          { type: 'key', id: ID_B },
        ],
        operation: { kind: 'spacing', spacing: 5 },
      }),
    ).resolves.toBe(false);

    expect(api.commitFrames).not.toHaveBeenCalled();
  });

  it('배치 기하의 커밋 실패는 오류로 올리고, 대상 하나라도 targetMissing이면 false로 끝난다', async () => {
    tree.scenes['4key'] = [
      node('key', ID_A, { x: 0, width: 10 }),
      node('key', ID_B, { x: 30, width: 10 }),
    ];
    const descriptor = {
      mode: '4key',
      targets: [
        { type: 'key' as const, id: ID_A },
        { type: 'key' as const, id: ID_B },
      ],
      operation: { kind: 'align' as const, direction: 'right' as const },
    };

    api.commitFrames.mockRejectedValueOnce(new Error('preflight failed'));
    await expect(commitBatchGeometryByIds(descriptor)).rejects.toThrow(
      'preflight failed',
    );
    api.commitFrames.mockResolvedValueOnce(['applied', 'targetMissing']);
    await expect(commitBatchGeometryByIds(descriptor)).resolves.toBe(false);
  });

  it('단일 bounds는 틀로 보내고(스프라이트도) 커밋 실패는 오류로 올린다', async () => {
    api.commitFrames.mockRejectedValue(new Error('start failed'));

    await expect(
      commitSingleElementBoundsById('sprite', ID_B, {
        dx: 5,
        dy: 8,
        width: 400,
        height: 60,
      }),
    ).rejects.toThrow('start failed');

    expect(api.commitFrames.mock.calls[0][0]).toEqual([
      {
        elementType: 'sprite',
        id: ID_B,
        frame: { x: 5, y: 8, width: 400, height: 60 },
      },
    ]);
  });

  it('단일 bounds의 targetMissing은 false로 끝난다', async () => {
    api.commitFrames.mockResolvedValueOnce(['targetMissing']);

    await expect(
      commitSingleElementBoundsById('key', ID_A, {
        dx: 50,
        dy: 60,
        width: 90,
        height: 80,
      }),
    ).resolves.toBe(false);
  });

  it('hidden은 적용되면 true, targetMissing이면 미적용으로 반환한다', async () => {
    api.commitPropertyPatch
      .mockResolvedValueOnce(['applied'])
      .mockResolvedValueOnce(['targetMissing']);

    await expect(patchElementHiddenById('key', ID_A, true)).resolves.toBe(true);
    await expect(patchElementHiddenById('key', ID_A, false)).resolves.toBe(
      false,
    );
  });

  it('hidden patch 편입 전 실패는 오류로 올린다', async () => {
    api.commitPropertyPatch.mockRejectedValueOnce(new Error('start failed'));
    await expect(patchElementHiddenById('key', ID_A, true)).rejects.toThrow(
      'start failed',
    );
  });

  it('hidden patch preflight 실패는 wire 편입 전에 오류로 올린다', async () => {
    const preflight = vi.fn(() => {
      throw new Error('authority changed');
    });
    api.commitPropertyPatch.mockImplementationOnce(
      async (_targets, _patch, options) => {
        options?.preflight?.();
        throw new Error('wire must not run');
      },
    );

    await expect(
      patchElementHiddenById('key', ID_A, true, { preflight }),
    ).rejects.toThrow('authority changed');

    expect(preflight).toHaveBeenCalledOnce();
  });

  it('layerName 편입 전 실패는 오류로 올린다', async () => {
    api.commitPropertyPatch.mockRejectedValueOnce(new Error('start failed'));

    await expect(
      patchElementLayerNameById('key', ID_A, 'After'),
    ).rejects.toThrow('start failed');
  });

  it('graphType batch 편입 전 실패는 오류로 올린다', async () => {
    const graphB = '00000000-0000-4000-8000-00000000008f';
    api.commitPropertyPatch.mockRejectedValueOnce(new Error('start failed'));

    await expect(patchGraphTypesByIds([ID_A, graphB], 'bar')).rejects.toThrow(
      'start failed',
    );
  });

  it('graphType batch는 일부 missing이어도 생존 대상 적용으로 판정한다', async () => {
    const missingId = '00000000-0000-4000-8000-000000000090';
    api.commitPropertyPatch.mockResolvedValueOnce(['applied', 'targetMissing']);

    await expect(patchGraphTypesByIds([ID_A, missingId], 'bar')).resolves.toBe(
      true,
    );
    expect(api.commitPropertyPatch).toHaveBeenCalledOnce();
  });

  it('graphColor batch는 preview gestureId를 트리 커밋에 전달한다', async () => {
    await patchGraphColorsByIds([ID_A], '#new', {
      gestureId: 'graph-color-gesture',
    });

    expect(api.commitPropertyPatch).toHaveBeenLastCalledWith(
      [{ elementType: 'graph', id: ID_A }],
      { property: 'graphColor', value: '#new' },
      expect.objectContaining({ gestureId: 'graph-color-gesture' }),
    );
  });

  it('graphType batch의 빈 ID와 중복 ID는 eager와 wire 전에 거절한다', async () => {
    await expect(patchGraphTypesByIds([ID_A, ''], 'bar')).resolves.toBe(false);
    await expect(patchGraphTypesByIds([ID_A, ID_A], 'bar')).resolves.toBe(
      false,
    );

    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });

  it.each([
    [
      'active stat',
      [{ elementType: 'stat', id: ID_A }],
      { property: 'activeFontPaint', value: { color: '#fff', gradient: null } },
    ],
    [
      'active knob',
      [{ elementType: 'knob', id: ID_A }],
      { property: 'activeFontPaint', value: { color: '#fff', gradient: null } },
    ],
    [
      'idle graph',
      [{ elementType: 'graph', id: ID_A }],
      { property: 'fontPaint', value: { color: '#fff', gradient: null } },
    ],
    [
      'idle knob',
      [{ elementType: 'knob', id: ID_A }],
      { property: 'fontPaint', value: { color: '#fff', gradient: null } },
    ],
    [
      'synthetic idle',
      [{ elementType: 'key', id: 'key-0' }],
      { property: 'fontPaint', value: { color: '#fff', gradient: null } },
    ],
  ] as const)(
    'font paint %s는 eager/wire 전에 거절한다',
    async (_label, targets, patch) => {
      await expect(
        patchPaintByTargets(targets as never, patch as never),
      ).resolves.toBe(false);
      expect(api.commitPropertyPatch).not.toHaveBeenCalled();
    },
  );

  it('runtime leaf batch 편입 전 실패는 graph와 knob 모두 오류로 올린다', async () => {
    const otherId = '00000000-0000-4000-8000-000000000096';
    api.commitPropertyPatch.mockRejectedValueOnce(new Error('start failed'));
    await expect(
      patchGraphPropertiesByIds([ID_A, otherId], {
        property: 'graphSpeed',
        value: 2200,
      }),
    ).rejects.toThrow('start failed');

    api.commitPropertyPatch.mockRejectedValueOnce(new Error('start failed'));
    await expect(
      patchKnobPropertiesByIds([ID_A, otherId], {
        property: 'sensitivity',
        value: 3,
      }),
    ).rejects.toThrow('start failed');
  });

  it('useInlineStyles batch는 duplicate와 empty ID를 wire 전에 거절한다', async () => {
    await expect(
      patchUseInlineStylesByTargets(
        [
          { elementType: 'key', id: ID_A },
          { elementType: 'stat', id: ID_A },
        ],
        true,
      ),
    ).resolves.toBe(false);
    await expect(
      patchUseInlineStylesByTargets([{ elementType: 'graph', id: '' }], true),
    ).resolves.toBe(false);
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });

  it('font style batch는 duplicate와 empty ID를 wire 전에 거절한다', async () => {
    await expect(
      patchFontStyleByTargets(
        [
          { elementType: 'key', id: ID_A },
          { elementType: 'stat', id: ID_A },
        ],
        { property: 'fontUnderline', value: true },
      ),
    ).resolves.toBe(false);
    await expect(
      patchFontStyleByTargets([{ elementType: 'graph', id: '' }], {
        property: 'fontStrikethrough',
        value: true,
      }),
    ).resolves.toBe(false);
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });

  it('fontFamily batch는 duplicate와 empty ID를 wire 전에 거절한다', async () => {
    await expect(
      patchFontFamilyByTargets(
        [
          { elementType: 'key', id: ID_A },
          { elementType: 'stat', id: ID_A },
        ],
        { property: 'fontFamily', value: 'Family One' },
      ),
    ).resolves.toBe(false);
    await expect(
      patchFontFamilyByTargets([{ elementType: 'graph', id: '' }], {
        property: 'fontFamily',
        value: 'Family One',
      }),
    ).resolves.toBe(false);
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });

  it('displayText는 raw common-4 leaf와 gesture를 N ops 한 commit으로 보낸다', async () => {
    const graphId = '00000000-0000-4000-8000-0000000000d3';
    const knobId = '00000000-0000-4000-8000-0000000000d4';
    const targets = [
      { elementType: 'key' as const, id: ID_A },
      { elementType: 'stat' as const, id: ID_B },
      { elementType: 'graph' as const, id: graphId },
      { elementType: 'knob' as const, id: knobId },
    ];

    await patchStylePropertyByTargets(
      targets,
      { property: 'displayText', value: '  Raw label  ' },
      {
        gestureId: 'gesture-display',
      },
    );

    expect(api.commitPropertyPatch).toHaveBeenCalledOnce();
    expect(api.commitPropertyPatch.mock.calls[0]?.[0]).toEqual(targets);
    expect(api.commitPropertyPatch.mock.calls[0]?.[1]).toEqual({
      property: 'displayText',
      value: '  Raw label  ',
    });
    expect(api.commitPropertyPatch.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        gestureId: 'gesture-display',
      }),
    );
  });

  it('className은 raw common-4 leaf와 gesture를 공용 text commit으로 보낸다', async () => {
    const targets = [
      { elementType: 'key' as const, id: ID_A },
      { elementType: 'stat' as const, id: ID_B },
    ];

    await patchStylePropertyByTargets(
      targets,
      { property: 'className', value: '  Raw class  ' },
      {
        gestureId: 'gesture-class',
      },
    );

    expect(api.commitPropertyPatch).toHaveBeenCalledOnce();
    expect(api.commitPropertyPatch.mock.calls[0]?.[0]).toEqual(targets);
    expect(api.commitPropertyPatch.mock.calls[0]?.[1]).toEqual({
      property: 'className',
      value: '  Raw class  ',
    });
    expect(api.commitPropertyPatch.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        gestureId: 'gesture-class',
      }),
    );
  });

  it.each([
    [{ property: 'borderWidth', value: 12.5 }, 'gesture-border-width'],
    [{ property: 'borderRadius', value: 88.5 }, 'gesture-border-radius'],
    [{ property: 'fontSize', value: 31.5 }, 'gesture-font-size'],
  ] as const)(
    '%j numeric style은 exact leaf와 gesture를 한 commit으로 보낸다',
    async (patch, gestureId) => {
      await patchStylePropertyByTargets(
        [{ elementType: 'key', id: ID_A }],
        patch,
        { gestureId },
      );

      expect(api.commitPropertyPatch).toHaveBeenCalledWith(
        [{ elementType: 'key', id: ID_A }],
        patch,
        expect.objectContaining({
          gestureId,
        }),
      );
    },
  );

  it.each([
    ['wrong type', [{ elementType: 'stat' as const, id: ID_B }], 20],
    ['negative', [{ elementType: 'key' as const, id: ID_A }], -0.1],
    ['over max', [{ elementType: 'key' as const, id: ID_A }], 50.1],
    ['nonfinite', [{ elementType: 'key' as const, id: ID_A }], Infinity],
  ])('noteGlowSize %s는 wire 전에 거절한다', async (_label, targets, value) => {
    await expect(
      patchStylePropertyByTargets(targets, {
        property: 'noteGlowSize',
        value: value,
      }),
    ).resolves.toBe(false);
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });

  it.each([
    [
      'idle graph',
      [{ elementType: 'graph', id: ID_A }],
      { property: 'counterFillIdle', value: { color: '#fff' } },
    ],
    [
      'active stat',
      [{ elementType: 'stat', id: ID_A }],
      { property: 'counterFillActive', value: { color: '#fff' } },
    ],
    [
      'synthetic',
      [{ elementType: 'key', id: 'key-0' }],
      { property: 'counterFillIdle', value: { color: '#fff' } },
    ],
  ] as const)(
    'counter fill %s는 eager/wire 전에 거절한다',
    async (_label, targets, patch) => {
      await expect(
        patchCounterFillByTargets(targets as never, patch as never),
      ).resolves.toBe(false);
      expect(api.commitPropertyPatch).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'graph',
      [{ elementType: 'graph' as const, id: ID_A }],
      { property: 'shadow', value: { leaf: 'blur', value: 1 } },
    ],
    [
      'active stat',
      [{ elementType: 'stat' as const, id: ID_B }],
      { property: 'activeShadow', value: { leaf: 'blur', value: 1 } },
    ],
    [
      'empty color',
      [{ elementType: 'key' as const, id: ID_A }],
      { property: 'shadow', value: { leaf: 'color', value: '' } },
    ],
    [
      'range',
      [{ elementType: 'key' as const, id: ID_A }],
      { property: 'shadow', value: { leaf: 'offsetX', value: 101 } },
    ],
  ] as const)(
    'shadow %s는 wire 전에 거절한다',
    async (_label, targets, patch) => {
      await expect(
        patchShadowByTargets(targets as never, patch as never),
      ).resolves.toBe(false);
      expect(api.commitPropertyPatch).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'synthetic',
      ['key-0'],
      { property: 'notePaint', value: { color: '#fff' } },
    ],
    ['empty', [], { property: 'notePaint', value: { opacity: 50 } }],
    [
      'duplicate',
      [ID_A, ID_A],
      { property: 'notePaint', value: { opacity: 50 } },
    ],
    [
      'combined',
      [ID_A],
      { property: 'notePaint', value: { color: '#fff', opacity: 50 } },
    ],
    [
      'border color',
      [ID_A],
      { property: 'noteBorderPaint', value: { color: '#fff', opacity: 50 } },
    ],
  ] as const)(
    'note paint %s는 wire 전에 거절한다',
    async (_label, ids, patch) => {
      await expect(patchNotePaintByIds([...ids], patch as never)).resolves.toBe(
        false,
      );
      expect(api.commitPropertyPatch).not.toHaveBeenCalled();
    },
  );

  it('note paint 편입 전 실패는 오류로 올린다', async () => {
    api.commitPropertyPatch.mockRejectedValueOnce(new Error('start failed'));

    await expect(
      patchNotePaintById(ID_A, {
        property: 'notePaint',
        value: { opacity: 99 },
      }),
    ).rejects.toThrow('start failed');
  });

  it.each([
    ['wrong type', 'stat', { property: 'noteOffsetX', value: 0 }],
    ['offset range', 'key', { property: 'noteOffsetY', value: 500.1 }],
    ['width zero', 'key', { property: 'noteWidth', value: 0 }],
    ['border width range', 'key', { property: 'noteBorderWidth', value: 20.1 }],
    [
      'border radius range',
      'key',
      { property: 'noteBorderRadius', value: -0.1 },
    ],
  ] as const)(
    'note numeric %s는 wire 전에 거절한다',
    async (_label, elementType, patch) => {
      await expect(
        patchStylePropertyByTargets([{ elementType, id: ID_A }], patch),
      ).resolves.toBe(false);
      expect(api.commitPropertyPatch).not.toHaveBeenCalled();
    },
  );

  it('displayText는 invalid target을 wire 전에 거절하고 편입 전 실패는 오류로 올린다', async () => {
    await expect(
      patchStylePropertyByTargets(
        [
          { elementType: 'key', id: ID_A },
          { elementType: 'graph', id: ID_A },
        ],
        { property: 'displayText', value: '' },
      ),
    ).resolves.toBe(false);
    await expect(
      patchStylePropertyByTargets([{ elementType: 'knob', id: 'knob-0' }], {
        property: 'displayText',
        value: '',
      }),
    ).resolves.toBe(false);
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();

    api.commitPropertyPatch.mockRejectedValueOnce(new Error('start failed'));
    await expect(
      patchStylePropertyById('key', ID_A, {
        property: 'displayText',
        value: 'After',
      }),
    ).rejects.toThrow('start failed');
  });

  it('note batch는 duplicate와 empty ID를 wire 전에 거절한다', async () => {
    await expect(
      patchNotePropertiesByIds([ID_A, ID_A], {
        property: 'noteAlignment',
        value: 'center',
      }),
    ).resolves.toBe(false);
    await expect(
      patchNotePropertiesByIds([''], {
        property: 'noteGlowEnabled',
        value: true,
      }),
    ).resolves.toBe(false);
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });

  it('soundEnabled batch는 empty, duplicate, synthetic ID를 wire 전에 거절한다', async () => {
    await expect(patchSoundEnabledByIds([], true)).resolves.toBe(false);
    await expect(patchSoundEnabledByIds([ID_A, ID_A], true)).resolves.toBe(
      false,
    );
    await expect(patchSoundEnabledByIds(['key-0'], true)).resolves.toBe(false);
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });

  it('soundVolume은 invalid value와 empty, duplicate, synthetic ID를 wire 전에 거절한다', async () => {
    await expect(patchSoundVolumeByIds([], 100)).resolves.toBe(false);
    await expect(patchSoundVolumeByIds([ID_A, ID_A], 100)).resolves.toBe(false);
    await expect(patchSoundVolumeByIds(['key-0'], 100)).resolves.toBe(false);
    await expect(patchSoundVolumeByIds([ID_A], -1)).resolves.toBe(false);
    await expect(patchSoundVolumeByIds([ID_A], 201)).resolves.toBe(false);
    await expect(patchSoundVolumeByIds([ID_A], Number.NaN)).resolves.toBe(
      false,
    );
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });

  it('soundPath batch는 empty, duplicate, synthetic ID를 wire 전에 거절한다', async () => {
    await expect(patchSoundPathByIds([], 'sounds/a.wav')).resolves.toBe(false);
    await expect(
      patchSoundPathByIds([ID_A, ID_A], 'sounds/a.wav'),
    ).resolves.toBe(false);
    await expect(patchSoundPathByIds(['key-0'], 'sounds/a.wav')).resolves.toBe(
      false,
    );
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });

  it('counter animation batch는 empty, duplicate, synthetic target을 wire 전에 거절한다', async () => {
    const intent = { presetId: 'preset-a' };
    await expect(
      patchCounterAnimationPresetByTargets([], intent),
    ).resolves.toBe(false);
    await expect(
      patchCounterAnimationPresetByTargets(
        [
          { elementType: 'key', id: ID_A },
          { elementType: 'stat', id: ID_A },
        ],
        intent,
      ),
    ).resolves.toBe(false);
    await expect(
      patchCounterAnimationPresetByTargets(
        [{ elementType: 'key', id: 'key-0' }],
        intent,
      ),
    ).resolves.toBe(false);
  });

  it('counter bool batch는 empty, duplicate, synthetic target을 wire 전에 거절한다', async () => {
    await expect(patchCounterEnabledByTargets([], true)).resolves.toBe(false);
    await expect(
      patchCounterAnimationEnabledByTargets(
        [
          { elementType: 'key', id: ID_A },
          { elementType: 'stat', id: ID_A },
        ],
        true,
      ),
    ).resolves.toBe(false);
    await expect(
      patchCounterEnabledByTargets([{ elementType: 'key', id: 'key-0' }], true),
    ).resolves.toBe(false);
  });

  it('counter layout batch는 empty, duplicate, synthetic target을 wire 전에 거절한다', async () => {
    await expect(
      patchCounterLayoutByTargets([], { property: 'counterGap', value: 2 }),
    ).resolves.toBe(false);
    await expect(
      patchCounterLayoutByTargets(
        [
          { elementType: 'key', id: ID_A },
          { elementType: 'stat', id: ID_A },
        ],
        { property: 'counterAlign', value: 'top' },
      ),
    ).resolves.toBe(false);
    await expect(
      patchCounterLayoutByTargets([{ elementType: 'key', id: 'key-0' }], {
        property: 'counterPlacement',
        value: 'inside',
      }),
    ).resolves.toBe(false);
  });

  it('counter typography는 invalid leaf와 empty, duplicate, synthetic target을 wire 전에 거절한다', async () => {
    await expect(
      patchCounterTypographyByTargets([], {
        property: 'counterFontSize',
        value: 8,
      }),
    ).resolves.toBe(false);
    await expect(
      patchCounterTypographyByTargets(
        [
          { elementType: 'key', id: ID_A },
          { elementType: 'stat', id: ID_A },
        ],
        { property: 'counterFontWeight', value: 400 },
      ),
    ).resolves.toBe(false);
    await expect(
      patchCounterTypographyByTargets([{ elementType: 'key', id: 'key-0' }], {
        property: 'counterFontItalic',
        value: true,
      }),
    ).resolves.toBe(false);
    await expect(
      patchCounterTypographyByTargets([{ elementType: 'key', id: ID_A }], {
        property: 'counterFontSize',
        value: 7,
      }),
    ).resolves.toBe(false);
    await expect(
      patchCounterTypographyByTargets([{ elementType: 'key', id: ID_A }], {
        property: 'counterFontWeight',
        value: 400.5,
      }),
    ).resolves.toBe(false);
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });

  it('counter fontFamily는 empty, duplicate, synthetic target을 wire 전에 거절한다', async () => {
    await expect(
      patchCounterTypographyByTargets([], {
        property: 'counterFontFamily',
        value: '',
      }),
    ).resolves.toBe(false);
    await expect(
      patchCounterTypographyByTargets(
        [
          { elementType: 'key', id: ID_A },
          { elementType: 'stat', id: ID_A },
        ],
        { property: 'counterFontFamily', value: 'Counter' },
      ),
    ).resolves.toBe(false);
    await expect(
      patchCounterTypographyByTargets([{ elementType: 'key', id: 'key-0' }], {
        property: 'counterFontFamily',
        value: 'Counter',
      }),
    ).resolves.toBe(false);
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });

  it('inactiveImage batch는 empty, duplicate, synthetic target을 wire 전에 거절한다', async () => {
    await expect(patchInactiveImageByTargets([], 'picked.png')).resolves.toBe(
      false,
    );
    await expect(
      patchInactiveImageByTargets(
        [
          { elementType: 'key', id: ID_A },
          { elementType: 'stat', id: ID_A },
        ],
        'picked.png',
      ),
    ).resolves.toBe(false);
    await expect(
      patchInactiveImageByTargets(
        [{ elementType: 'knob', id: 'knob-0' }],
        'picked.png',
      ),
    ).resolves.toBe(false);
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });

  it('activeImage batch는 empty, duplicate, synthetic target을 wire 전에 거절한다', async () => {
    await expect(patchActiveImageByTargets([], 'active.png')).resolves.toBe(
      false,
    );
    await expect(
      patchActiveImageByTargets(
        [
          { elementType: 'key', id: ID_A },
          { elementType: 'knob', id: ID_A },
        ],
        'active.png',
      ),
    ).resolves.toBe(false);
    await expect(
      patchActiveImageByTargets(
        [{ elementType: 'knob', id: 'knob-0' }],
        'active.png',
      ),
    ).resolves.toBe(false);
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });

  it('image transparency batch는 empty, duplicate, synthetic target을 wire 전에 거절한다', async () => {
    await expect(patchIdleTransparentByTargets([], true)).resolves.toBe(false);
    await expect(
      patchIdleTransparentByTargets(
        [
          { elementType: 'key', id: ID_A },
          { elementType: 'graph', id: ID_A },
        ],
        true,
      ),
    ).resolves.toBe(false);
    await expect(
      patchActiveTransparentByTargets(
        [{ elementType: 'knob', id: 'knob-0' }],
        true,
      ),
    ).resolves.toBe(false);
    await expect(
      patchActiveTransparentById('key', 'key-0', true),
    ).resolves.toBe(false);
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });

  it('single image fit은 synthetic target을 wire 전에 거절한다', async () => {
    await expect(
      patchIdleImageFitById('graph', 'graph-0', 'cover'),
    ).resolves.toBe(false);
    await expect(
      patchActiveImageFitById('key', 'key-0', 'contain'),
    ).resolves.toBe(false);
    expect(api.commitPropertyPatch).not.toHaveBeenCalled();
  });
});

// 분리 속성 패널 창의 커밋 경로. 즉시 반영이 없으면 낙관 커밋이 해제되는
// 프레임에 값이 옛 canonical로 되돌아갔다가 editor:committed 도착 때
// 다시 바뀌어 토글이 버벅인다
