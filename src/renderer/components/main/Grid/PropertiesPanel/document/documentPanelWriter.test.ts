import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';

const mocks = vi.hoisted(() => {
  const persisted = () => vi.fn(() => Promise.resolve(true));
  return {
    activeGestureId: vi.fn(() => null as string | null),
    settleCommit: vi.fn(),
    preview: vi.fn(),
    cancel: vi.fn(),
    commitElementGeometryById: persisted(),
    patchElementPropertyById: persisted(),
    patchPaintById: persisted(),
    patchStylePropertyById: persisted(),
    patchPaintByTargets: persisted(),
    patchStylePropertyByTargets: persisted(),
    patchInactiveImageByTargets: persisted(),
    patchIdleTransparentByTargets: persisted(),
    patchElementPropertyByTargets: persisted(),
  };
});

vi.mock('@src/renderer/editor/runtime/gesture/editGestureController', () => ({
  editGestureController: {
    activeGestureId: mocks.activeGestureId,
    settleCommit: mocks.settleCommit,
    preview: mocks.preview,
    cancel: mocks.cancel,
  },
}));

vi.mock(
  '@src/renderer/editor/runtime/operations/elementOps',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@src/renderer/editor/runtime/operations/elementOps')
    >()),
    commitElementGeometryById: mocks.commitElementGeometryById,
    patchElementPropertyById: mocks.patchElementPropertyById,
    patchPaintById: mocks.patchPaintById,
    patchStylePropertyById: mocks.patchStylePropertyById,
    patchPaintByTargets: mocks.patchPaintByTargets,
    patchStylePropertyByTargets: mocks.patchStylePropertyByTargets,
    patchInactiveImageByTargets: mocks.patchInactiveImageByTargets,
    patchIdleTransparentByTargets: mocks.patchIdleTransparentByTargets,
  }),
);

vi.mock(
  '@src/renderer/editor/runtime/operations/elementPropertyCore',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@src/renderer/editor/runtime/operations/elementPropertyCore')
    >()),
    patchElementPropertyByTargets: mocks.patchElementPropertyByTargets,
  }),
);

const { batchPanelWriterFor, singlePanelWriterFor } = await import(
  './documentPanelWriter'
);

const GESTURE = '64444444-4444-4444-8444-444444444444';
const graph = (id: string): ElementNode =>
  ({
    type: 'element',
    id,
    kind: 'graph',
    frame: { x: 0, y: 0, width: 200, height: 100, rotation: 0 },
  } as ElementNode);
const A = '63333333-3333-4333-8333-333333333333';
const B = '65555555-5555-4555-8555-555555555555';

describe('선언 패널 옛 종류 쓰기', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeGestureId.mockReturnValue(GESTURE);
  });

  describe('하나 - 옛 단일 패널 처리기', () => {
    it('그래프 색 확정은 고르는 동안의 미리보기 제스처를 정산한다', () => {
      singlePanelWriterFor('4key', graph(A))!.commitField(
        'graphColor',
        '#123456',
      );
      expect(mocks.patchElementPropertyById).toHaveBeenCalledWith(
        'graph',
        A,
        { property: 'graphColor', value: '#123456' },
        { gestureId: GESTURE },
      );
      expect(mocks.settleCommit).toHaveBeenCalledWith(
        mocks.patchElementPropertyById.mock.results[0]?.value,
      );
    });

    it('미리보기가 없는 칸은 제스처 없이 쓴다', () => {
      singlePanelWriterFor('4key', graph(A))!.commitField('graphType', 'bar');
      expect(mocks.patchElementPropertyById).toHaveBeenCalledWith(
        'graph',
        A,
        { property: 'graphType', value: 'bar' },
        {},
      );
      expect(mocks.settleCommit).not.toHaveBeenCalled();
    });

    it('칠 확정은 제스처를 정산한다', () => {
      const patch = {
        property: 'backgroundPaint',
        value: { color: '#654321', gradient: null },
      } as const;
      singlePanelWriterFor('4key', graph(A))!.commitPaint(patch);
      expect(mocks.patchPaintById).toHaveBeenCalledWith('graph', A, patch, {
        gestureId: GESTURE,
      });
      expect(mocks.settleCommit).toHaveBeenCalledWith(
        mocks.patchPaintById.mock.results[0]?.value,
      );
    });

    it('위치·크기는 고른 요소 id로 쓰고 제스처를 정산한다', () => {
      singlePanelWriterFor('4key', graph(A))!.commitGeometry?.('dx', 17);
      expect(mocks.commitElementGeometryById).toHaveBeenCalledWith(
        'graph',
        A,
        { dx: 17 },
        { gestureId: GESTURE },
      );
      expect(mocks.settleCommit).toHaveBeenCalledOnce();
    });

    it('옛 모양 id가 아니면 쓰지 않는다', () => {
      const writer = singlePanelWriterFor('4key', graph('graph-0'))!;
      writer.commitField('graphType', 'bar');
      writer.commitGeometry?.('dx', 17);
      expect(mocks.patchElementPropertyById).not.toHaveBeenCalled();
      expect(writer.commitGeometry).toBeUndefined();
    });

    it('고유 값 미리보기는 옛 칸 이름으로 그 종류 미리보기에 얹는다', () => {
      singlePanelWriterFor('4key', graph(A))!.previewField(
        'graphColor',
        '#ABCDEF',
      );
      expect(mocks.preview).toHaveBeenCalledWith(
        '4key',
        [{ id: A, patch: { graphColor: '#ABCDEF' } }],
        { domain: 'graphPosition' },
      );
    });
  });

  describe('여럿 - 옛 일괄 패널 처리기', () => {
    it('그래프 색 확정은 고른 요소 모두를 한 커밋으로 쓰고 제스처를 정산한다', () => {
      batchPanelWriterFor('4key', [graph(A), graph(B)])!.commitField(
        'graphColor',
        '#abcdef',
        { settlesPreview: true },
      );
      expect(mocks.patchElementPropertyByTargets).toHaveBeenCalledWith(
        [
          { elementType: 'graph', id: A },
          { elementType: 'graph', id: B },
        ],
        { property: 'graphColor', value: '#abcdef' },
        { gestureId: GESTURE },
      );
      expect(mocks.settleCommit).toHaveBeenCalledWith(
        mocks.patchElementPropertyByTargets.mock.results[0]?.value,
      );
    });

    it('미리보기가 없는 칸은 제스처 없이 쓴다', () => {
      batchPanelWriterFor('4key', [graph(A), graph(B)])!.commitField(
        'graphSpeed',
        1500,
      );
      expect(mocks.patchElementPropertyByTargets).toHaveBeenCalledWith(
        expect.any(Array),
        { property: 'graphSpeed', value: 1500 },
        {},
      );
      expect(mocks.settleCommit).not.toHaveBeenCalled();
    });

    it('스타일 확정은 옛 일괄 패널처럼 제스처를 정산한다', () => {
      batchPanelWriterFor('4key', [graph(A), graph(B)])!.commitStyle({
        property: 'borderWidth',
        value: 3,
      });
      expect(mocks.patchStylePropertyByTargets).toHaveBeenCalledWith(
        [
          { elementType: 'graph', id: A },
          { elementType: 'graph', id: B },
        ],
        { property: 'borderWidth', value: 3 },
        { gestureId: GESTURE },
      );
      expect(mocks.settleCommit).toHaveBeenCalledOnce();
    });

    it('이미지는 종류별 id 묶음으로 쓴다', () => {
      batchPanelWriterFor('4key', [graph(A), graph(B)])!.commitInactiveImage(
        'img.png',
      );
      expect(mocks.patchInactiveImageByTargets).toHaveBeenCalledWith(
        [
          { elementType: 'graph', id: A },
          { elementType: 'graph', id: B },
        ],
        'img.png',
      );
    });
  });

  it('트리에만 있는 종류가 있으면 옛 처리기를 쓰지 않는다', () => {
    const tracker = { ...graph(B), kind: 'cursorTracker' } as ElementNode;
    expect(singlePanelWriterFor('4key', tracker)).toBeNull();
    expect(batchPanelWriterFor('4key', [graph(A), tracker])).toBeNull();
  });
});
