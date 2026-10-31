// @vitest-environment jsdom
import React, { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FakeElementDocumentBackend } from '@src/renderer/__tests__/fakeElementDocumentBackend';
import type { Document } from '@src/types/generated/elementDocument';
import type { ElementCollections } from '@src/types/editor';

const SPRITE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const KEY_ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// IPC 경계만 대역. 트리 스토어·런타임·게스처 컨트롤러·프리뷰 오버레이는 실물이라
// 끌기 중 지금 값 교체·낙관 반영·커밋 착지 경로까지 지나간다
const ipc = vi.hoisted(() => ({
  backend: null as FakeElementDocumentBackend | null,
  previewPublish: vi.fn(async () => {}),
  previewCancel: vi.fn(async () => {}),
  previewSubscribe: vi.fn(async () => 1),
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
vi.mock('@api/modules/editor/previewApi', () => ({
  previewApi: {
    publish: ipc.previewPublish,
    cancel: ipc.previewCancel,
    subscribe: ipc.previewSubscribe,
  },
}));
vi.mock('@contexts/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

type SpriteValues = Record<string, unknown>;

const spriteValues = (overrides: SpriteValues = {}): SpriteValues => ({
  activation: 'whileHeld',
  pressDurationMs: 300,
  baseImage: null,
  pivot: { x: 0.5, y: 0.5 },
  idleTransform: { x: 0, y: 0, rotation: 0, scale: 1 },
  poses: [
    {
      poseId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      triggers: [KEY_ID_A],
      transform: { x: 10, y: 0, rotation: 90, scale: 1 },
      imageOverride: null,
      imageOverrideMetrics: null,
    },
  ],
  transitionMs: 90,
  transitionEasing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  referenceNaturalSize: null,
  ...overrides,
});

const makeDocument = (values: SpriteValues): Document =>
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
            values,
          },
        ],
      },
    },
  } as unknown as Document);

const loadHarness = async () => {
  const [backend, runtime, overlays, overlay, records, selection, position] =
    await Promise.all([
      import('@src/renderer/__tests__/fakeElementDocumentBackend'),
      import('@src/renderer/editor/document/elementDocumentRuntime'),
      import('../overlays/GridSelectionOverlays'),
      import('@src/renderer/editor/runtime/gesture/previewOverlay'),
      import('@src/renderer/elementKinds/runtime/treePanelRecords'),
      import('@stores/grid/useDocumentSelectionStore'),
      import('@src/renderer/elementKinds/runtime/treeElementPosition'),
    ]);
  const dragSession = await import('@hooks/Grid/drag/dragSession');
  return {
    createBackend: backend.createFakeElementDocumentBackend,
    loadStore: runtime.loadElementDocumentStore,
    useScene: runtime.useElementDocumentScene,
    GridSelectionOverlays: overlays.default,
    previewOverlay: overlay.previewOverlay,
    subscribePreviewOverlay: overlay.subscribePreviewOverlay,
    getPreviewOverlayVersion: overlay.getPreviewOverlayVersion,
    treePanelRecords: records.treePanelRecords,
    useDocumentSelectionStore: selection.useDocumentSelectionStore,
    currentTreePosition: position.currentTreePosition,
    releaseDragSession: dragSession.releaseDragSession,
  };
};
type Harness = Awaited<ReturnType<typeof loadHarness>>;

describe('SpriteCanvasHandles 기준점 드래그 통합 (트리 스토어)', () => {
  let harness: Harness;
  let container: HTMLDivElement;
  let root: Root;

  // Grid와 같은 합성 - 트리 기록(편집 미리보기 포함) → 선택 오버레이 → 스프라이트 손잡이
  const Host = () => {
    const previewVersion = useSyncExternalStore(
      harness.subscribePreviewOverlay,
      harness.getPreviewOverlayVersion,
    );
    const records = harness.treePanelRecords(
      harness.useScene('4key'),
      '4key',
      previewVersion,
    );
    const collections = {
      keyPositions: records.positions,
      statPositions: records.statItemPositions,
      graphPositions: records.graphItemPositions,
      knobPositions: records.knobItemPositions,
      spritePositions: records.spriteItemPositions,
    } as unknown as ElementCollections;
    return (
      <harness.GridSelectionOverlays
        selectedElements={[]}
        collections={collections}
        mode="4key"
        pluginElements={[]}
        zoom={1}
        panX={0}
        panY={0}
        hasGradientEditSession={false}
        hasSpritePoseSession={false}
        previewBounds={null}
        previewGroupBounds={null}
        previewElementBounds={null}
        onResizeStart={vi.fn()}
        onResize={vi.fn()}
        onResizeEnd={vi.fn()}
        onGroupResize={vi.fn()}
        onGroupResizeEnd={vi.fn()}
        getOtherElements={() => []}
      />
    );
  };

  const start = async (values: SpriteValues = spriteValues()) => {
    ipc.backend = harness.createBackend(makeDocument(values));
    await act(async () => {
      await harness.loadStore();
    });
    act(() =>
      harness.useDocumentSelectionStore
        .getState()
        .setSelection('4key', [SPRITE_ID]),
    );
    act(() => root.render(<Host />));
  };
  const backend = () => ipc.backend!;
  // 지금 값(낙관 반영 포함)과 백엔드에 저장된 값
  const current = () =>
    harness.currentTreePosition('4key', SPRITE_ID) as {
      pivot: { x: number; y: number };
      idleTransform: { x: number };
    };
  const saved = () =>
    (
      backend().document().scenes['4key']!.nodes[0] as unknown as {
        values: { pivot: { x: number; y: number } };
      }
    ).values;
  const pivotHandle = () =>
    container.querySelector<HTMLElement>('[data-sprite-pivot-handle="true"]')!;
  const pointer = (
    type: string,
    target: EventTarget,
    clientX: number,
    clientY: number,
    init: { ctrlKey?: boolean } = {},
  ) =>
    act(() => {
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX,
          clientY,
          pointerId: 1,
          ctrlKey: init.ctrlKey ?? false,
        }),
      );
    });
  const handleCenterX = () => parseFloat(pivotHandle().style.left) + 13;
  // rAF 스케줄러가 setTimeout 0으로 스텁돼 있어 한 틱 기다리면 move가 반영된다
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

  beforeEach(async () => {
    vi.resetModules();
    ipc.previewPublish.mockClear();
    ipc.previewCancel.mockClear();
    window.__dmn_window_type = 'main';
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id);
    });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    harness = await loadHarness();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    harness.releaseDragSession();
    vi.unstubAllGlobals();
  });

  it('중앙에 스냅된 기준점을 드래그하면 표식이 따라가고 응답 전·커밋 뒤에도 유지된다', async () => {
    await start();
    // 중앙 (100, 75) → 히트 26 좌상단 (87, 62)
    expect(pivotHandle().style.left).toBe('87px');
    expect(pivotHandle().style.top).toBe('62px');

    backend().hold();
    pointer('pointerdown', pivotHandle(), 100, 75);
    pointer('pointermove', window, 160, 75);
    await settle();
    // pivot x = 0.8 → 축 160 + 프레임 보정 0.3 → 히트 좌상단 147.3
    expect(parseFloat(pivotHandle().style.left)).toBeCloseTo(147.3, 3);

    pointer('pointermove', window, 180, 90);
    await settle();
    // 두 번째 move도 살아 있다 - 드래그가 도중에 취소되지 않았다
    expect(parseFloat(pivotHandle().style.left)).toBeCloseTo(167.4, 3);
    expect(parseFloat(pivotHandle().style.top)).toBeCloseTo(77.1, 3);

    pointer('pointerup', window, 180, 90);
    await settle();
    expect(backend().commit).toHaveBeenCalledOnce();
    // 응답 전 - 트리 스토어 낙관 반영으로 지금 값이 이미 새 기준점
    expect(current().pivot).toEqual({ x: 0.9, y: 0.6 });
    expect(parseFloat(pivotHandle().style.left)).toBeCloseTo(167.4, 3);

    await act(async () => backend().release());
    await settle();
    expect(saved().pivot).toEqual({ x: 0.9, y: 0.6 });
    expect(current().pivot).toEqual({ x: 0.9, y: 0.6 });
    expect(parseFloat(pivotHandle().style.left)).toBeCloseTo(167.4, 3);
  });

  it('직전 커밋이 착지한 직후 중앙에서 시작한 두 번째 드래그도 이어진다', async () => {
    await start(spriteValues({ pivot: { x: 1, y: 0 } }));

    // 1차: 모서리 → 중앙으로 드래그해 스냅
    pointer('pointerdown', pivotHandle(), 200.5, -0.5);
    pointer('pointermove', window, 102, 77);
    await settle();
    pointer('pointerup', window, 102, 77);
    await settle();
    expect(backend().commit).toHaveBeenCalledOnce();
    expect(saved().pivot).toEqual({ x: 0.5, y: 0.5 });
    expect(pivotHandle().style.left).toBe('87px');

    // 2차: 중앙에서 바로 다른 곳으로
    pointer('pointerdown', pivotHandle(), 100, 75);
    pointer('pointermove', window, 140, 75);
    await settle();
    expect(parseFloat(pivotHandle().style.left)).toBeCloseTo(127.2, 3);

    pointer('pointermove', window, 160, 75);
    await settle();
    expect(parseFloat(pivotHandle().style.left)).toBeCloseTo(147.3, 3);

    pointer('pointerup', window, 160, 75);
    await settle();
    expect(backend().commit).toHaveBeenCalledTimes(2);
    expect(saved().pivot).toEqual({ x: 0.8, y: 0.5 });
  });

  it('배율 0.1 idle 스프라이트도 표식이 포인터를 그대로 따라간다', async () => {
    await start(
      spriteValues({ idleTransform: { x: 0, y: 0, rotation: 0, scale: 0.1 } }),
    );
    expect(handleCenterX()).toBeCloseTo(100, 6);

    pointer('pointerdown', pivotHandle(), 100, 75);
    // 스냅이 켜진 채 1px - 프리셋 자리가 7.5px 간격으로 몰려도 옆 프리셋으로 튀지 않는다
    pointer('pointermove', window, 100, 74);
    await settle();
    expect(handleCenterX()).toBeCloseTo(100, 6);
    expect(parseFloat(pivotHandle().style.top) + 13).toBeCloseTo(75, 6);
    // 스냅 해제 상태로 5px - 배율 0.1이라 기준점은 0.25 움직이고 표식은 포인터 아래
    pointer('pointermove', window, 105, 75, { ctrlKey: true });
    await settle();
    // 105 + 프레임 보정 (2·0.75−1)·0.5 = 105.25
    expect(handleCenterX()).toBeCloseTo(105.25, 6);

    pointer('pointerup', window, 105, 75);
    await settle();
    expect(backend().commit).toHaveBeenCalledOnce();
    expect(current().pivot.x).toBeCloseTo(0.75, 9);
    expect(current().pivot.y).toBeCloseTo(0.5, 9);
    // 그림은 움직이지 않는다 - t' = t + (P − P') + sR·Δ = 0 + (100 − 150) + 0.1·50
    expect(current().idleTransform.x).toBeCloseTo(-45, 9);
    expect(handleCenterX()).toBeCloseTo(105.25, 6);
  });

  it('히트 영역 가장자리를 잡아도 첫 move에서 표식이 튀지 않는다', async () => {
    await start();

    // 중심에서 8px 오른쪽을 잡고 4px 이동 → 표식은 4px만 따라온다
    pointer('pointerdown', pivotHandle(), 108, 75);
    pointer('pointermove', window, 112, 75, { ctrlKey: true });
    await settle();
    // 축 104 + 프레임 보정 (2·0.52−1)·0.5 = 104.02
    expect(handleCenterX()).toBeCloseTo(104.02, 6);
    pointer('pointerup', window, 112, 75);
    await settle();
    expect(backend().commit).toHaveBeenCalledOnce();
    expect(saved().pivot.x).toBeCloseTo(0.52, 9);
  });

  it('표시 기준점이 지금 값과 다르면(다른 프리뷰 진행 중) 드래그를 시작하지 않는다', async () => {
    await start();
    const { editGestureController } = await import(
      '@src/renderer/editor/runtime/gesture/editGestureController'
    );
    // 다른 컨트롤의 프리뷰가 기준점을 0.75로 보여 주는 상태
    act(() =>
      editGestureController.preview(
        '4key',
        [
          {
            id: SPRITE_ID,
            patch: {
              pivot: { x: 0.75, y: 0.5 },
              idleTransform: { x: 0, y: 0, rotation: 0, scale: 1 },
            },
          },
        ],
        { domain: 'spritePosition' },
      ),
    );
    await settle();
    expect(handleCenterX()).toBeCloseTo(150.25, 6);

    pointer('pointerdown', pivotHandle(), 150, 75);
    pointer('pointermove', window, 120, 75, { ctrlKey: true });
    await settle();
    pointer('pointerup', window, 120, 75);
    await settle();
    expect(backend().commit).not.toHaveBeenCalled();
    expect(handleCenterX()).toBeCloseTo(150.25, 6);
    act(() => editGestureController.cancel());
  });

  it('컨트롤러가 잃어버린 로컬 프리뷰가 기준점을 가려도 한 번의 드래그로 회수하고 저장한다', async () => {
    await start();

    const orphanSessionId = '11111111-1111-4111-8111-111111111111';
    act(() => {
      harness.previewOverlay.applyLocalPatchByIds(
        orphanSessionId,
        '4key',
        [SPRITE_ID],
        {
          pivot: { x: 0.75, y: 0.5 },
          idleTransform: { x: 0, y: 0, rotation: 0, scale: 1 },
        },
        'spritePosition',
      );
    });
    await settle();
    expect(handleCenterX()).toBeCloseTo(150.25, 6);

    pointer('pointerdown', pivotHandle(), 150, 75);
    pointer('pointermove', window, 120, 75, { ctrlKey: true });
    await settle();
    pointer('pointerup', window, 120, 75);
    await settle();

    expect(ipc.previewCancel).toHaveBeenCalledWith(orphanSessionId);
    expect(backend().commit).toHaveBeenCalledOnce();
    expect(saved().pivot.x).toBeCloseTo(0.6, 9);
    expect(handleCenterX()).toBeCloseTo(120.1, 6);
  });

  it('다른 프리뷰가 상자 크기만 바꿔 보여 줘도 드래그를 시작하지 않는다', async () => {
    await start();
    const { editGestureController } = await import(
      '@src/renderer/editor/runtime/gesture/editGestureController'
    );
    // 기준점·transform은 지금 값 그대로, 상자만 두 배로 보이는 프리뷰
    act(() =>
      editGestureController.preview(
        '4key',
        [{ id: SPRITE_ID, patch: { width: 400, height: 300 } }],
        { domain: 'spritePosition' },
      ),
    );
    await settle();
    // 표시 표식은 두 배 상자의 중앙 (200, 150)
    expect(handleCenterX()).toBeCloseTo(200, 6);

    pointer('pointerdown', pivotHandle(), 200, 150);
    pointer('pointermove', window, 200, 150, { ctrlKey: true });
    await settle();
    pointer('pointerup', window, 200, 150);
    await settle();
    expect(backend().commit).not.toHaveBeenCalled();
    expect(saved().pivot).toEqual({ x: 0.5, y: 0.5 });
    act(() => editGestureController.cancel());
  });
});
