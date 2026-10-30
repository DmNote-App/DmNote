import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLegacyKeyArrays } from '@src/renderer/__tests__/legacyStores/useLegacyKeyArrays';
import { createDefaultKeyPosition } from '../../model/keys';

const api = vi.hoisted(() => ({
  commitGeneratedPatch: vi.fn(),
  commitGeneratedSemanticOps: vi.fn(),
  commitSemanticOps: vi.fn(),
  captureEditorDocument: vi.fn(),
  lastAck: null as CanonicalEditorDocumentV1 | null,
}));

vi.mock('./editorSemanticOps', () => ({
  captureEditorDocument: api.captureEditorDocument,
  commitGeneratedSemanticOps: api.commitGeneratedSemanticOps,
  commitSemanticOps: api.commitSemanticOps,
  // 트리 문서 없이 옛 경로만 시험한다
}));

import { useGraphItemStore } from '@src/renderer/__tests__/legacyStores/useGraphItemStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useKnobItemStore } from '@src/renderer/__tests__/legacyStores/useKnobItemStore';
import { useSpriteStore } from '@src/renderer/__tests__/legacyStores/useSpriteStore';
import { useLayerGroupStore } from '@src/renderer/__tests__/legacyStores/useLayerGroupStore';
import { useStatItemStore } from '@src/renderer/__tests__/legacyStores/useStatItemStore';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import {
  commitBatchGeometryByIds,
  commitElementGeometryById,
  commitElementBoundsById,
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

import { enqueueEditorCompatibilityOperation } from '../lifecycle/editorCompatibilityQueue';

import type {
  CanonicalEditorDocumentV1,
  CanonicalGraphItemPosition,
  EditorDocumentV1,
  EditorPatchV1,
} from '@src/types/editor';
import type { GraphItemPosition } from '@src/types/key/graphItems';
import type { ReactiveSpritePosition } from '@src/types/key/sprites';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

const keyAt = (id: string, zIndex?: number) => ({
  ...createDefaultKeyPosition(),
  id,
  ...(zIndex !== undefined ? { zIndex } : {}),
});

const graphAt = (
  id: string,
  patch: Partial<GraphItemPosition> = {},
): CanonicalGraphItemPosition => ({
  ...createDefaultKeyPosition(),
  id,
  statType: 'kps',
  graphType: 'line',
  graphSpeed: 1000,
  graphColor: '#86EFAC',
  ...patch,
});

const spriteAt = (id: string): ReactiveSpritePosition & { id: string } => ({
  activation: 'whileHeld',
  pressDurationMs: 300,
  id,
  dx: 0,
  dy: 0,
  width: 200,
  height: 120,
  rotation: 0,
  hidden: false,
  zIndex: null,
  layerName: null,
  groupId: null,
  className: null,
  useInlineStyles: null,
  baseImage: null,
  pivot: { x: 0.5, y: 0.5 },
  idleTransform: { x: 0, y: 0, rotation: 0, scale: 1 },
  poses: [],
  transitionMs: 90,
  transitionEasing: 'linear',
  referenceNaturalSize: null,
});

// 슬롯 시점 base. 기본은 호출 시점 스토어 - 대기 중 재정렬·삭제는 테스트가
// slotBase로 재현한다
let slotBase: (() => CanonicalEditorDocumentV1) | null = null;

const documentFromStores = (): CanonicalEditorDocumentV1 =>
  ({
    schemaVersion: 1,
    keys: structuredClone(useLegacyKeyArrays.getState().keyMappings),
    keyPositions: structuredClone(
      useLegacyKeyArrays.getState().canonicalPositions,
    ),
    statPositions: structuredClone(useStatItemStore.getState().positions),
    graphPositions: structuredClone(useGraphItemStore.getState().positions),
    knobPositions: structuredClone(useKnobItemStore.getState().positions),
    spritePositions: structuredClone(useSpriteStore.getState().positions),
    layerGroups: structuredClone(useLayerGroupStore.getState().layerGroups),
  } as CanonicalEditorDocumentV1);

describe('elementOps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    slotBase = null;
    api.lastAck = null;
    api.captureEditorDocument.mockImplementation(() => documentFromStores());
    // legacy patch generator 경로는 미사용 가드 - 호출 시 base만 돌려준다
    api.commitGeneratedPatch.mockImplementation(
      async (
        generate: (base: CanonicalEditorDocumentV1) => EditorPatchV1 | null,
      ) => {
        const base = (slotBase ?? documentFromStores)();
        generate(base);
        return base;
      },
    );
    api.commitSemanticOps.mockImplementation((_ops, meta) =>
      enqueueEditorCompatibilityOperation(async () => {
        meta?.onEnrolled?.();
        return {
          document: documentFromStores(),
          opResults: _ops.map((op) =>
            op.kind === 'setBounds' || op.kind === 'resizeSprite'
              ? { status: 'applied', bounds: op.bounds }
              : { status: 'applied' },
          ),
        };
      }),
    );
    api.commitGeneratedSemanticOps.mockImplementation((generate, meta) =>
      enqueueEditorCompatibilityOperation(async () => {
        const ops = generate((slotBase ?? documentFromStores)());
        if (!ops) return null;
        meta?.preflight?.();
        meta?.onEnrolled?.();
        return {
          document: documentFromStores(),
          opResults: ops.map((op) =>
            op.kind === 'setBounds' || op.kind === 'resizeSprite'
              ? { status: 'applied', bounds: op.bounds }
              : { status: 'applied' },
          ),
        };
      }),
    );
    useKeyStore.setState({ selectedKeyType: '4key' });
    useLegacyKeyArrays.setState({
      keyMappings: { '4key': ['A', 'B'] },
      canonicalPositions: { '4key': [keyAt(ID_A), keyAt(ID_B)] },
      positions: { '4key': [keyAt(ID_A), keyAt(ID_B)] },
    });
    useStatItemStore.setState({ positions: {} });
    useGraphItemStore.setState({ positions: {} });
    useKnobItemStore.setState({ positions: {} });
    useSpriteStore.setState({ positions: {} });
    useLayerGroupStore.setState({ layerGroups: {} });
    useGridSelectionStore.setState({ selectedElements: [] });
  });

  it('단일 축 기하는 슬롯 최신 base의 나머지 bounds를 보존한다', async () => {
    const base = documentFromStores();
    base.keyPositions = {
      '4key': [
        { ...keyAt(ID_A), dx: 10, dy: 77, width: 123, height: 91 },
        keyAt(ID_B),
      ],
    } as never;
    slotBase = () => base;

    await commitElementGeometryById('key', ID_A, { dx: 50 });

    const ops = api.commitGeneratedSemanticOps.mock.calls[0][0](base);
    expect(ops).toEqual([
      {
        kind: 'setBounds',
        elementType: 'key',
        id: ID_A,
        bounds: { dx: 50, dy: 77, width: 123, height: 91 },
      },
    ]);
  });

  it('단일 축 기하는 호출 뒤 patch 변조와 무관하게 최초 intent를 유지한다', async () => {
    const patch = { dx: 50 } as { dx: number; dy?: number };
    let capturedGenerate:
      | ((base: EditorDocumentV1) => readonly unknown[] | null)
      | null = null;
    api.commitGeneratedSemanticOps.mockImplementationOnce(
      async (generate, meta) => {
        capturedGenerate = generate;
        meta?.onEnrolled?.();
        const ops = generate(documentFromStores());
        return {
          document: documentFromStores(),
          opResults: ops!.map((op: { bounds: unknown }) => ({
            status: 'applied',
            bounds: op.bounds,
          })),
        };
      },
    );

    const committed = commitElementGeometryById('key', ID_A, patch);
    patch.dx = 999;
    patch.dy = 777;
    await committed;

    const ops = capturedGenerate!(documentFromStores()) as Array<{
      bounds: Record<string, number>;
    }>;
    expect(ops[0].bounds.dx).toBe(50);
    expect(ops[0].bounds.dy).not.toBe(777);
  });

  it('단일 축 기하 대상이 슬롯 전에 사라지면 eager를 복원한다', async () => {
    const before = structuredClone(
      useLegacyKeyArrays.getState().canonicalPositions['4key'][0],
    );
    const missing = documentFromStores();
    missing.keys = { '4key': ['B'] };
    missing.keyPositions = { '4key': [keyAt(ID_B)] } as never;
    slotBase = () => missing;

    await expect(
      commitElementGeometryById('key', ID_A, { width: 90 }),
    ).resolves.toBe(false);

    expect(
      useLegacyKeyArrays.getState().canonicalPositions['4key'][0].width,
    ).toBe(before.width);
  });

  it('단일 축 기하는 편입 전 실패만 CAS 복원한다', async () => {
    api.commitGeneratedSemanticOps.mockRejectedValueOnce(
      new Error('start failed'),
    );
    const before =
      useLegacyKeyArrays.getState().canonicalPositions['4key'][0].height;

    await expect(
      commitElementGeometryById('key', ID_A, { height: 80 }),
    ).rejects.toThrow('start failed');

    expect(
      useLegacyKeyArrays.getState().canonicalPositions['4key'][0].height,
    ).toBe(before);
  });

  it('배치 정렬은 stable ID 전 대상을 N setBounds로 한 번에 생성한다', async () => {
    const stat = { ...keyAt(ID_B), dx: 50, dy: 10, width: 20, height: 30 };
    useLegacyKeyArrays.setState({
      canonicalPositions: {
        '4key': [{ ...keyAt(ID_A), dx: 10, dy: 0, width: 10, height: 20 }],
      },
      positions: {
        '4key': [{ ...keyAt(ID_A), dx: 10, dy: 0, width: 10, height: 20 }],
      },
    });
    useStatItemStore.setState({ positions: { '4key': [stat as never] } });
    api.lastAck = documentFromStores();

    await commitBatchGeometryByIds({
      mode: '4key',
      targets: [
        { type: 'key', id: ID_A },
        { type: 'stat', id: ID_B },
      ],
      operation: { kind: 'align', direction: 'right' },
    });

    expect(api.commitGeneratedSemanticOps).toHaveBeenCalledOnce();
    const generate = api.commitGeneratedSemanticOps.mock.calls[0][0];
    expect(generate(documentFromStores())).toEqual([
      {
        kind: 'setBounds',
        elementType: 'key',
        id: ID_A,
        bounds: { dx: 60, dy: 0, width: 10, height: 20 },
      },
      {
        kind: 'setBounds',
        elementType: 'stat',
        id: ID_B,
        bounds: { dx: 50, dy: 10, width: 20, height: 30 },
      },
    ]);
  });

  it('배치 geometry는 slot 최신 base에서 전체 계획을 다시 계산한다', async () => {
    useLegacyKeyArrays.setState({
      canonicalPositions: {
        '4key': [
          { ...keyAt(ID_A), dx: 0, width: 10 },
          { ...keyAt(ID_B), dx: 30, width: 10 },
        ],
      },
      positions: {
        '4key': [
          { ...keyAt(ID_A), dx: 0, width: 10 },
          { ...keyAt(ID_B), dx: 30, width: 10 },
        ],
      },
    });
    api.lastAck = documentFromStores();
    const latest = documentFromStores();
    latest.keyPositions = {
      '4key': [
        { ...keyAt(ID_B), dx: 80, width: 20 },
        { ...keyAt(ID_A), dx: 10, width: 10 },
      ],
    } as never;
    slotBase = () => latest;

    await commitBatchGeometryByIds({
      mode: '4key',
      targets: [
        { type: 'key', id: ID_A },
        { type: 'key', id: ID_B },
      ],
      operation: { kind: 'align', direction: 'right' },
    });

    const generate = api.commitGeneratedSemanticOps.mock.calls[0][0];
    expect(generate(latest)).toEqual([
      expect.objectContaining({
        id: ID_A,
        bounds: expect.objectContaining({ dx: 90 }),
      }),
      expect.objectContaining({
        id: ID_B,
        bounds: expect.objectContaining({ dx: 80 }),
      }),
    ]);
  });

  it('배치 geometry 대상 하나가 소실되면 전체 null이고 eager를 복원한다', async () => {
    useLegacyKeyArrays.setState({
      canonicalPositions: {
        '4key': [
          { ...keyAt(ID_A), dx: 0 },
          { ...keyAt(ID_B), dx: 30 },
        ],
      },
      positions: {
        '4key': [
          { ...keyAt(ID_A), dx: 0 },
          { ...keyAt(ID_B), dx: 30 },
        ],
      },
    });
    api.lastAck = documentFromStores();
    slotBase = () => {
      const base = documentFromStores();
      base.keyPositions = { '4key': [keyAt(ID_A)] } as never;
      return base;
    };

    await expect(
      commitBatchGeometryByIds({
        mode: '4key',
        targets: [
          { type: 'key', id: ID_A },
          { type: 'key', id: ID_B },
        ],
        operation: { kind: 'align', direction: 'right' },
      }),
    ).resolves.toBe(false);

    expect(useLegacyKeyArrays.getState().canonicalPositions['4key']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ID_A, dx: 0 }),
        expect.objectContaining({ id: ID_B, dx: 30 }),
      ]),
    );
  });

  it('호출 시점에 배치 geometry 대상이 없으면 eager나 슬롯 커밋을 시작하지 않는다', async () => {
    const before = structuredClone(
      useLegacyKeyArrays.getState().canonicalPositions['4key'],
    );

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

    expect(api.commitGeneratedSemanticOps).not.toHaveBeenCalled();
    expect(useLegacyKeyArrays.getState().canonicalPositions['4key']).toEqual(
      before,
    );
  });

  it('호출 시점 spacing이 이미 정확하면 슬롯 커밋 없이 false를 반환한다', async () => {
    useLegacyKeyArrays.setState({
      canonicalPositions: {
        '4key': [
          { ...keyAt(ID_A), dx: 0, width: 10 },
          { ...keyAt(ID_B), dx: 15, width: 10 },
        ],
      },
      positions: {
        '4key': [
          { ...keyAt(ID_A), dx: 0, width: 10 },
          { ...keyAt(ID_B), dx: 15, width: 10 },
        ],
      },
    });
    const before = structuredClone(
      useLegacyKeyArrays.getState().canonicalPositions['4key'],
    );

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

    expect(api.commitGeneratedSemanticOps).not.toHaveBeenCalled();
    expect(useLegacyKeyArrays.getState().canonicalPositions['4key']).toEqual(
      before,
    );
  });

  it('배치 geometry 편입 전 실패는 전체 eager를 CAS 복원한다', async () => {
    useLegacyKeyArrays.setState({
      canonicalPositions: {
        '4key': [
          { ...keyAt(ID_A), dx: 0, width: 10 },
          { ...keyAt(ID_B), dx: 30, width: 10 },
        ],
      },
      positions: {
        '4key': [
          { ...keyAt(ID_A), dx: 0, width: 10 },
          { ...keyAt(ID_B), dx: 30, width: 10 },
        ],
      },
    });
    const before = structuredClone(
      useLegacyKeyArrays.getState().canonicalPositions['4key'],
    );
    api.commitGeneratedSemanticOps.mockRejectedValueOnce(
      new Error('preflight failed'),
    );

    await expect(
      commitBatchGeometryByIds({
        mode: '4key',
        targets: [
          { type: 'key', id: ID_A },
          { type: 'key', id: ID_B },
        ],
        operation: { kind: 'align', direction: 'right' },
      }),
    ).rejects.toThrow('preflight failed');

    expect(useLegacyKeyArrays.getState().canonicalPositions['4key']).toEqual(
      before,
    );
  });

  it('단일 bounds op의 편입 전 실패는 4필드를 CAS 복원한다', async () => {
    api.commitSemanticOps.mockRejectedValue(new Error('start failed'));
    const before = structuredClone(
      useLegacyKeyArrays.getState().canonicalPositions['4key'][0],
    );

    await expect(
      commitSingleElementBoundsById('key', ID_A, {
        dx: 50,
        dy: 60,
        width: 90,
        height: 80,
      }),
    ).rejects.toThrow('start failed');

    expect(
      useLegacyKeyArrays.getState().canonicalPositions['4key'][0],
    ).toMatchObject({
      dx: before.dx,
      dy: before.dy,
      width: before.width,
      height: before.height,
    });
  });

  it('sprite bounds의 편입 전 실패는 콘텐츠 필드까지 CAS 복원한다', async () => {
    const sprite = {
      ...spriteAt(ID_B),
      idleTransform: { x: 12, y: -6, rotation: 15, scale: 1.5 },
      poses: [
        {
          poseId: 'pose-1',
          triggers: [ID_A],
          transform: { x: -30, y: 44, rotation: -90, scale: 0.5 },
          imageOverride: null,
          imageOverrideMetrics: null,
        },
      ],
    };
    useSpriteStore.setState({ positions: { '4key': [sprite] } });
    api.commitSemanticOps.mockRejectedValue(new Error('start failed'));

    await expect(
      commitSingleElementBoundsById('sprite', ID_B, {
        dx: 5,
        dy: 8,
        width: 400,
        height: 60,
      }),
    ).rejects.toThrow('start failed');

    const restored = useSpriteStore.getState().positions['4key'][0];
    expect(restored).toMatchObject({ dx: 0, dy: 0, width: 200, height: 120 });
    expect(restored.idleTransform).toEqual(sprite.idleTransform);
    expect(restored.poses).toEqual(sprite.poses);
  });

  it('단일 bounds op의 targetMissing은 canonical 동기화 결과를 유지한다', async () => {
    api.commitSemanticOps.mockImplementationOnce(async (_ops, meta) => {
      meta?.onEnrolled?.();
      useLegacyKeyArrays.setState({
        canonicalPositions: { '4key': [keyAt(ID_B)] },
        positions: { '4key': [keyAt(ID_B)] },
      });
      return {
        document: documentFromStores(),
        opResults: [{ status: 'targetMissing' }],
      };
    });

    await expect(
      commitSingleElementBoundsById('key', ID_A, {
        dx: 50,
        dy: 60,
        width: 90,
        height: 80,
      }),
    ).resolves.toBe(false);

    expect(useLegacyKeyArrays.getState().canonicalPositions['4key']).toEqual([
      keyAt(ID_B),
    ]);
  });

  it('그룹 bounds는 다중 semantic op 한 요청으로 정산한다', async () => {
    const committed = await commitElementBoundsById(
      new Map([
        [
          'key',
          new Map([
            [ID_A, { dx: 50, dy: 60, width: 90, height: 80 }],
            [ID_B, { dx: 70, dy: 80, width: 100, height: 110 }],
          ]),
        ],
      ]),
    );

    expect(committed).toBe(true);
    expect(api.commitSemanticOps).toHaveBeenCalledOnce();
    expect(api.commitSemanticOps.mock.calls[0][0]).toEqual([
      {
        kind: 'setBounds',
        elementType: 'key',
        id: ID_A,
        bounds: { dx: 50, dy: 60, width: 90, height: 80 },
      },
      {
        kind: 'setBounds',
        elementType: 'key',
        id: ID_B,
        bounds: { dx: 70, dy: 80, width: 100, height: 110 },
      },
    ]);
    expect(api.commitGeneratedPatch).not.toHaveBeenCalled();
  });

  it('그룹 bounds의 편입 전 실패는 모든 eager 필드를 CAS 복원한다', async () => {
    api.commitSemanticOps.mockRejectedValueOnce(new Error('start failed'));
    const before = structuredClone(
      useLegacyKeyArrays.getState().canonicalPositions['4key'],
    );

    await expect(
      commitElementBoundsById(
        new Map([
          [
            'key',
            new Map([
              [ID_A, { dx: 50, dy: 60, width: 90, height: 80 }],
              [ID_B, { dx: 70, dy: 80, width: 100, height: 110 }],
            ]),
          ],
        ]),
      ),
    ).rejects.toThrow('start failed');

    expect(
      useLegacyKeyArrays.getState().canonicalPositions['4key'],
    ).toMatchObject(before);
  });

  it('그룹 bounds 대기 중 일부 대상이 사라지면 생존 대상만 저장한다', async () => {
    api.commitSemanticOps.mockImplementationOnce(async (ops, meta) => {
      meta?.onEnrolled?.();
      const surviving = { ...keyAt(ID_B), ...ops[1].bounds };
      useLegacyKeyArrays.setState({
        keyMappings: { '4key': ['B'] },
        canonicalPositions: { '4key': [surviving] },
        positions: { '4key': [surviving] },
      });
      return {
        document: documentFromStores(),
        opResults: [
          { status: 'targetMissing' },
          { status: 'applied', bounds: ops[1].bounds },
        ],
      };
    });

    const committed = await commitElementBoundsById(
      new Map([
        [
          'key',
          new Map([
            [ID_A, { dx: 50, dy: 60, width: 90, height: 80 }],
            [ID_B, { dx: 70, dy: 80, width: 100, height: 110 }],
          ]),
        ],
      ]),
    );

    expect(committed).toBe(true);
    expect(useLegacyKeyArrays.getState().canonicalPositions['4key']).toEqual([
      expect.objectContaining({ id: ID_B, dx: 70 }),
    ]);
    expect(
      useLegacyKeyArrays
        .getState()
        .canonicalPositions['4key'].some(({ id }) => id === ID_A),
    ).toBe(false);
  });

  it('그룹 bounds 대상이 전부 사라지면 false로 정산하고 부활시키지 않는다', async () => {
    api.commitSemanticOps.mockImplementationOnce(async (_ops, meta) => {
      meta?.onEnrolled?.();
      useLegacyKeyArrays.setState({
        keyMappings: { '4key': [] },
        canonicalPositions: { '4key': [] },
        positions: { '4key': [] },
      });
      return {
        document: documentFromStores(),
        opResults: [{ status: 'targetMissing' }, { status: 'targetMissing' }],
      };
    });

    const committed = await commitElementBoundsById(
      new Map([
        [
          'key',
          new Map([
            [ID_A, { dx: 50, dy: 60, width: 90, height: 80 }],
            [ID_B, { dx: 70, dy: 80, width: 100, height: 110 }],
          ]),
        ],
      ]),
    );

    expect(committed).toBe(false);
    expect(useLegacyKeyArrays.getState().canonicalPositions['4key']).toEqual(
      [],
    );
  });

  it('hidden noChange는 성공으로, targetMissing은 미적용으로 반환한다', async () => {
    useLegacyKeyArrays.setState({
      canonicalPositions: {
        '4key': [{ ...keyAt(ID_A), hidden: true }, keyAt(ID_B)],
      },
      positions: {
        '4key': [{ ...keyAt(ID_A), hidden: true }, keyAt(ID_B)],
      },
    });
    api.commitSemanticOps
      .mockResolvedValueOnce({
        document: documentFromStores(),
        opResults: [{ status: 'noChange' }],
      })
      .mockResolvedValueOnce({
        document: documentFromStores(),
        opResults: [{ status: 'targetMissing' }],
      });

    await expect(patchElementHiddenById('key', ID_A, true)).resolves.toBe(true);
    await expect(patchElementHiddenById('key', ID_A, false)).resolves.toBe(
      false,
    );
  });

  it('hidden patch 편입 전 실패는 자기 eager만 복원한다', async () => {
    api.commitSemanticOps.mockRejectedValueOnce(new Error('start failed'));
    await expect(patchElementHiddenById('key', ID_A, true)).rejects.toThrow(
      'start failed',
    );
    expect(
      useLegacyKeyArrays.getState().canonicalPositions['4key'][0].hidden ??
        false,
    ).toBe(false);
  });

  it('hidden patch preflight 실패는 wire 편입 전 eager를 복원한다', async () => {
    const preflight = vi.fn(() => {
      throw new Error('authority changed');
    });
    api.commitSemanticOps.mockImplementationOnce(async (_ops, meta) => {
      meta?.preflight?.();
      throw new Error('wire must not run');
    });

    await expect(
      patchElementHiddenById('key', ID_A, true, { preflight }),
    ).rejects.toThrow('authority changed');

    expect(preflight).toHaveBeenCalledOnce();
    expect(
      useLegacyKeyArrays.getState().canonicalPositions['4key'][0].hidden ??
        false,
    ).toBe(false);
  });

  it('layerName 편입 전 실패는 자기 leaf만 CAS 복원한다', async () => {
    useLegacyKeyArrays.setState({
      canonicalPositions: {
        '4key': [{ ...keyAt(ID_A), layerName: 'Before' }, keyAt(ID_B)],
      },
      positions: {
        '4key': [{ ...keyAt(ID_A), layerName: 'Before' }, keyAt(ID_B)],
      },
    });
    api.commitSemanticOps.mockRejectedValueOnce(new Error('start failed'));

    await expect(
      patchElementLayerNameById('key', ID_A, 'After'),
    ).rejects.toThrow('start failed');
    expect(
      useLegacyKeyArrays.getState().canonicalPositions['4key'][0].layerName,
    ).toBe('Before');
  });

  it('graphType batch 편입 전 실패는 모든 eager leaf를 복원한다', async () => {
    const graphB = '00000000-0000-4000-8000-00000000008f';
    useGraphItemStore.setState({
      positions: {
        '4key': [
          graphAt(ID_A, { graphType: 'line' }),
          graphAt(graphB, { graphType: 'line' }),
        ],
      },
    });
    api.commitSemanticOps.mockRejectedValueOnce(new Error('start failed'));

    await expect(patchGraphTypesByIds([ID_A, graphB], 'bar')).rejects.toThrow(
      'start failed',
    );
    expect(
      useGraphItemStore
        .getState()
        .positions['4key'].map((position) => position.graphType),
    ).toEqual(['line', 'line']);
  });

  it('graphType batch는 일부 missing이어도 생존 대상 적용으로 판정한다', async () => {
    const missingId = '00000000-0000-4000-8000-000000000090';
    api.commitSemanticOps.mockResolvedValueOnce({
      document: documentFromStores(),
      opResults: [{ status: 'applied' }, { status: 'targetMissing' }],
    });

    await expect(patchGraphTypesByIds([ID_A, missingId], 'bar')).resolves.toBe(
      true,
    );
    expect(api.commitSemanticOps).toHaveBeenCalledOnce();
  });

  it('graphColor batch는 preview gestureId를 semantic commit에 전달한다', async () => {
    useGraphItemStore.setState({
      positions: {
        '4key': [graphAt(ID_A, { graphColor: '#old' })],
      },
    });

    await patchGraphColorsByIds([ID_A], '#new', {
      gestureId: 'graph-color-gesture',
    });

    expect(api.commitSemanticOps).toHaveBeenLastCalledWith(
      [
        {
          kind: 'patchElement',
          elementType: 'graph',
          id: ID_A,
          patch: { property: 'graphColor', value: '#new' },
        },
      ],
      expect.objectContaining({ gestureId: 'graph-color-gesture' }),
    );
  });

  it('graphType batch의 빈 ID와 중복 ID는 eager와 wire 전에 거절한다', async () => {
    await expect(patchGraphTypesByIds([ID_A, ''], 'bar')).resolves.toBe(false);
    await expect(patchGraphTypesByIds([ID_A, ID_A], 'bar')).resolves.toBe(
      false,
    );

    expect(api.commitSemanticOps).not.toHaveBeenCalled();
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
      expect(api.commitSemanticOps).not.toHaveBeenCalled();
    },
  );

  it('runtime leaf batch 편입 전 실패는 graph와 knob eager를 각각 복원한다', async () => {
    const otherId = '00000000-0000-4000-8000-000000000096';
    useGraphItemStore.setState({
      positions: {
        '4key': [
          graphAt(ID_A, { graphSpeed: 1000 }),
          graphAt(otherId, { graphSpeed: 1000 }),
        ],
      },
    });
    api.commitSemanticOps.mockRejectedValueOnce(new Error('start failed'));
    await expect(
      patchGraphPropertiesByIds([ID_A, otherId], {
        property: 'graphSpeed',
        value: 2200,
      }),
    ).rejects.toThrow('start failed');
    expect(
      useGraphItemStore
        .getState()
        .positions['4key'].map((position) => position.graphSpeed),
    ).toEqual([1000, 1000]);

    useKnobItemStore.setState({
      positions: {
        '4key': [
          { ...createDefaultKeyPosition(), id: ID_A, sensitivity: 1 },
          { ...createDefaultKeyPosition(), id: otherId, sensitivity: 1 },
        ] as never,
      },
    });
    api.commitSemanticOps.mockRejectedValueOnce(new Error('start failed'));
    await expect(
      patchKnobPropertiesByIds([ID_A, otherId], {
        property: 'sensitivity',
        value: 3,
      }),
    ).rejects.toThrow('start failed');
    expect(
      useKnobItemStore
        .getState()
        .positions['4key'].map((position) => position.sensitivity),
    ).toEqual([1, 1]);
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
    expect(api.commitSemanticOps).not.toHaveBeenCalled();
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
    expect(api.commitSemanticOps).not.toHaveBeenCalled();
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
    expect(api.commitSemanticOps).not.toHaveBeenCalled();
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

    expect(api.commitSemanticOps).toHaveBeenCalledOnce();
    expect(api.commitSemanticOps.mock.calls[0]?.[0]).toEqual(
      targets.map(({ elementType, id }) => ({
        kind: 'patchElement',
        elementType,
        id,
        patch: { property: 'displayText', value: '  Raw label  ' },
      })),
    );
    expect(api.commitSemanticOps.mock.calls[0]?.[1]).toEqual(
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

    expect(api.commitSemanticOps).toHaveBeenCalledOnce();
    expect(api.commitSemanticOps.mock.calls[0]?.[0]).toEqual(
      targets.map(({ elementType, id }) => ({
        kind: 'patchElement',
        elementType,
        id,
        patch: { property: 'className', value: '  Raw class  ' },
      })),
    );
    expect(api.commitSemanticOps.mock.calls[0]?.[1]).toEqual(
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

      expect(api.commitSemanticOps).toHaveBeenCalledWith(
        [
          {
            kind: 'patchElement',
            elementType: 'key',
            id: ID_A,
            patch,
          },
        ],
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
    expect(api.commitSemanticOps).not.toHaveBeenCalled();
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
      expect(api.commitSemanticOps).not.toHaveBeenCalled();
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
      expect(api.commitSemanticOps).not.toHaveBeenCalled();
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
      expect(api.commitSemanticOps).not.toHaveBeenCalled();
    },
  );

  it('note paint 편입 전 실패는 자기 eager leaf만 복원한다', async () => {
    const key = {
      ...keyAt(ID_A),
      noteOpacity: 80,
      noteOpacityTop: 70,
      noteOpacityBottom: 60,
      noteGlowColor: 'fresh-sibling',
    };
    useLegacyKeyArrays.setState({
      canonicalPositions: { '4key': [key] },
      positions: { '4key': [key] },
    });
    api.commitSemanticOps.mockRejectedValueOnce(new Error('start failed'));

    await expect(
      patchNotePaintById(ID_A, {
        property: 'notePaint',
        value: { opacity: 99 },
      }),
    ).rejects.toThrow('start failed');
    expect(
      useLegacyKeyArrays.getState().canonicalPositions['4key'][0],
    ).toMatchObject({
      noteOpacity: 80,
      noteOpacityTop: 70,
      noteOpacityBottom: 60,
      noteGlowColor: 'fresh-sibling',
    });
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
      expect(api.commitSemanticOps).not.toHaveBeenCalled();
    },
  );

  it('displayText는 invalid target을 wire 전에 거절하고 편입 전 실패를 복원한다', async () => {
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
    expect(api.commitSemanticOps).not.toHaveBeenCalled();

    api.commitSemanticOps.mockRejectedValueOnce(new Error('start failed'));
    await expect(
      patchStylePropertyById('key', ID_A, {
        property: 'displayText',
        value: 'After',
      }),
    ).rejects.toThrow('start failed');
    expect(
      useLegacyKeyArrays.getState().canonicalPositions['4key'][0].displayText,
    ).toBeUndefined();
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
    expect(api.commitSemanticOps).not.toHaveBeenCalled();
  });

  it('soundEnabled batch는 empty, duplicate, synthetic ID를 wire 전에 거절한다', async () => {
    await expect(patchSoundEnabledByIds([], true)).resolves.toBe(false);
    await expect(patchSoundEnabledByIds([ID_A, ID_A], true)).resolves.toBe(
      false,
    );
    await expect(patchSoundEnabledByIds(['key-0'], true)).resolves.toBe(false);
    expect(api.commitSemanticOps).not.toHaveBeenCalled();
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
    expect(api.commitSemanticOps).not.toHaveBeenCalled();
  });

  it('soundPath batch는 empty, duplicate, synthetic ID를 wire 전에 거절한다', async () => {
    await expect(patchSoundPathByIds([], 'sounds/a.wav')).resolves.toBe(false);
    await expect(
      patchSoundPathByIds([ID_A, ID_A], 'sounds/a.wav'),
    ).resolves.toBe(false);
    await expect(patchSoundPathByIds(['key-0'], 'sounds/a.wav')).resolves.toBe(
      false,
    );
    expect(api.commitSemanticOps).not.toHaveBeenCalled();
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
    expect(api.commitSemanticOps).not.toHaveBeenCalled();
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
    expect(api.commitSemanticOps).not.toHaveBeenCalled();
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
    expect(api.commitSemanticOps).not.toHaveBeenCalled();
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
    expect(api.commitSemanticOps).not.toHaveBeenCalled();
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
    expect(api.commitSemanticOps).not.toHaveBeenCalled();
  });

  it('single image fit은 synthetic target을 wire 전에 거절한다', async () => {
    await expect(
      patchIdleImageFitById('graph', 'graph-0', 'cover'),
    ).resolves.toBe(false);
    await expect(
      patchActiveImageFitById('key', 'key-0', 'contain'),
    ).resolves.toBe(false);
    expect(api.commitSemanticOps).not.toHaveBeenCalled();
  });
});

// 분리 속성 패널 창의 커밋 경로. 즉시 반영이 없으면 낙관 커밋이 해제되는
// 프레임에 값이 옛 canonical로 되돌아갔다가 editor:committed 도착 때
// 다시 바뀌어 토글이 버벅인다
