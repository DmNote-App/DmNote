// @vitest-environment jsdom
import React, { act, createRef, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FakeElementDocumentBackend } from '@src/renderer/__tests__/fakeElementDocumentBackend';
import type { Document } from '@src/types/generated/elementDocument';
import type {
  CanonicalReactiveSpritePosition,
  ElementCollections,
} from '@src/types/editor';

const SPRITE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const POSE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const KEY_ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// 실제 팝업 바깥 클릭과 캔버스 이미지까지 포함해 자세 프리뷰 종료와 저장값 유지를 구분
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
vi.mock('@api/modules/resources/resourceApi', () => ({
  imageApi: { load: vi.fn(() => Promise.resolve({ success: false })) },
}));
vi.mock('@utils/media/assetProbe', () => ({
  canDecodeImage: vi.fn(() => Promise.resolve(true)),
  probeImageSize: vi.fn(() => Promise.resolve({ width: 64, height: 32 })),
  canLoadFont: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@hooks/useLenis', () => ({
  useLenis: () => ({ scrollContainerRef: vi.fn() }),
}));
class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

const makeDocument = (): Document =>
  ({
    formatVersion: 1,
    kindVersions: { key: 1, sprite: 1 },
    scenes: {
      '4key': {
        nodes: [
          {
            type: 'element',
            id: KEY_ID_A,
            kind: 'key',
            frame: { x: 300, y: 0, width: 60, height: 60, rotation: 0 },
            input: { type: 'key', slot: 'A' },
            values: {},
          },
          {
            type: 'element',
            id: SPRITE_ID,
            kind: 'sprite',
            frame: { x: 0, y: 0, width: 200, height: 150, rotation: 0 },
            useInlineStyles: true,
            values: {
              activation: 'whileHeld',
              pressDurationMs: 300,
              baseImage:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yhQAAAABJRU5ErkJggg==',
              pivot: { x: 0.5, y: 0.5 },
              idleTransform: { x: 0, y: 0, rotation: 0, scale: 1 },
              poses: [
                {
                  poseId: POSE_ID,
                  triggers: [KEY_ID_A],
                  transform: { x: 0, y: 0, rotation: 0, scale: 1 },
                  imageOverride: null,
                  imageOverrideMetrics: null,
                },
              ],
              transitionMs: 0,
              transitionEasing: 'cubic-bezier(0.4, 0, 0.2, 1)',
              referenceNaturalSize: null,
            },
          },
        ],
      },
    },
  } as unknown as Document);

const loadHarness = async () => {
  const [
    backend,
    runtime,
    overlays,
    panel,
    overlay,
    records,
    selection,
    position,
    dragSession,
    spriteFace,
    editPreview,
  ] = await Promise.all([
    import('@src/renderer/__tests__/fakeElementDocumentBackend'),
    import('@src/renderer/editor/document/elementDocumentRuntime'),
    import('../overlays/GridSelectionOverlays'),
    import('@components/main/Grid/PropertiesPanel/single/SingleSpritePanel'),
    import('@src/renderer/editor/runtime/gesture/previewOverlay'),
    import('@src/renderer/elementKinds/runtime/treePanelRecords'),
    import('../document/useDocumentSelectionStore'),
    import('@src/renderer/elementKinds/runtime/treeElementPosition'),
    import('@hooks/Grid/drag/dragSession'),
    import('../layers/SpriteFaceView'),
    import('@stores/grid/useSpriteEditPreviewStore'),
  ]);
  return {
    createBackend: backend.createFakeElementDocumentBackend,
    loadStore: runtime.loadElementDocumentStore,
    useScene: runtime.useElementDocumentScene,
    GridSelectionOverlays: overlays.default,
    SingleSpritePanel: panel.SingleSpritePanel,
    SpriteFaceView: spriteFace.default,
    useSpriteEditPreviewStore: editPreview.useSpriteEditPreviewStore,
    subscribePreviewOverlay: overlay.subscribePreviewOverlay,
    getPreviewOverlayVersion: overlay.getPreviewOverlayVersion,
    treePanelRecords: records.treePanelRecords,
    useDocumentSelectionStore: selection.useDocumentSelectionStore,
    currentTreePosition: position.currentTreePosition,
    releaseDragSession: dragSession.releaseDragSession,
  };
};
type Harness = Awaited<ReturnType<typeof loadHarness>>;

describe('자세 손잡이 저장 후 실제 팝업 닫기와 다시 열기 (트리 스토어)', () => {
  let harness: Harness;
  let container: HTMLDivElement;
  let root: Root;
  let errors: string[];

  const Host = ({ isSelected = true }: { isSelected?: boolean }) => {
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
    const position = collections.spritePositions['4key']?.find(
      (candidate) => candidate.id === SPRITE_ID,
    ) as CanonicalReactiveSpritePosition | undefined;
    if (!position) return null;
    return (
      <>
        <div data-testid="grid-background" />
        <harness.SpriteFaceView
          elementId={SPRITE_ID}
          position={position}
          isSelected={isSelected}
        />
        {isSelected ? (
          <harness.SingleSpritePanel
            setPanelElement={vi.fn()}
            panelElement={container}
            singleSpritePosition={position}
            selectedKeyType="4key"
            isRenaming={false}
            renameInputRef={createRef<HTMLInputElement>() as never}
            renameValue=""
            setRenameValue={vi.fn()}
            renameCancelledRef={{ current: false }}
            handleRenameCommit={vi.fn()}
            handleRenameCancel={vi.fn()}
            handleRenameStart={vi.fn()}
            singleScrollRefFor={() => vi.fn()}
            t={((key: string) => key) as never}
          />
        ) : null}
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
      </>
    );
  };

  // 선택은 트리 선택이 맡는다 - 선택을 풀면 손잡이·패널이 사라진다
  const render = (isSelected = true) => {
    act(() =>
      harness.useDocumentSelectionStore
        .getState()
        .setSelection('4key', isSelected ? [SPRITE_ID] : []),
    );
    act(() => root.render(<Host isSelected={isSelected} />));
  };
  const start = async () => {
    ipc.backend = harness.createBackend(makeDocument());
    await act(async () => {
      await harness.loadStore();
    });
    render();
  };
  const backend = () => ipc.backend!;
  const poses = () =>
    (
      harness.currentTreePosition('4key', SPRITE_ID) as unknown as {
        poses: Array<Record<string, unknown>>;
      }
    ).poses;
  const pivotHandle = () =>
    container.querySelector<HTMLElement>('[data-sprite-pivot-handle="true"]')!;
  const poseFrame = () =>
    container.querySelector<SVGPolygonElement>(
      '[data-sprite-pose-frame="true"]',
    );
  const poseRows = () =>
    [...container.querySelectorAll<HTMLElement>('[role="button"]')].filter(
      (row) =>
        row.textContent?.startsWith('propertiesPanel.spritePose ') ?? false,
    );
  const pointer = (
    type: string,
    target: EventTarget,
    clientX: number,
    clientY: number,
    init: { buttons?: number; ctrlKey?: boolean } = {},
  ) =>
    act(() => {
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: init.buttons ?? (type === 'pointerup' ? 0 : 1),
          clientX,
          clientY,
          pointerId: 1,
          ctrlKey: init.ctrlKey ?? false,
        }),
      );
    });
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  const framePoints = () =>
    poseFrame()!
      .getAttribute('points')!
      .split(' ')
      .map((pair) => pair.split(',').map(Number));
  const pivotCenter = () => ({
    x: Number.parseFloat(pivotHandle().style.left) + 13,
    y: Number.parseFloat(pivotHandle().style.top) + 13,
  });
  const imageTransform = () =>
    container.querySelector<HTMLImageElement>(
      '[data-sprite-element] img:not([data-sprite-idle-ghost])',
    )!.style.transform;
  const elementCenter = (element: HTMLElement) => ({
    x:
      Number.parseFloat(element.style.left) +
      Number.parseFloat(element.style.width) / 2,
    y:
      Number.parseFloat(element.style.top) +
      Number.parseFloat(element.style.height) / 2,
  });

  beforeEach(async () => {
    vi.resetModules();
    window.__dmn_window_type = 'main';
    errors = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
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
    vi.restoreAllMocks();
  });

  it.each(
    (['scale', 'move', 'rotate', 'pivot'] as const).flatMap((kind) =>
      (['popup', 'selection'] as const).flatMap((closeBy) =>
        [false, true].map((invalidSibling) => ({
          kind,
          closeBy,
          invalidSibling,
        })),
      ),
    ),
  )(
    '$kind 끝낸 뒤 $closeBy 닫기와 다시 열기는 저장 응답 전후 자세를 지킨다 (무효 형제: $invalidSibling)',
    async ({ kind, closeBy, invalidSibling }) => {
      await start();
      const idleImageTransform = imageTransform();
      expect(idleImageTransform).toContain('scale(1)');
      if (invalidSibling) {
        const addButton = [
          ...container.querySelectorAll<HTMLButtonElement>('button'),
        ].find((button) =>
          button.textContent?.includes('propertiesPanel.spriteAddPose'),
        )!;
        act(() => addButton.click());
        await settle();
        expect(poseRows()).toHaveLength(2);
        expect(poses()).toHaveLength(1);
        expect(
          harness.useSpriteEditPreviewStore.getState().preview?.fallbackPose
            .triggers,
        ).toEqual([]);
        expect(backend().commit).not.toHaveBeenCalled();
      }
      act(() => poseRows()[0].click());
      await settle();
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect(poseFrame()).not.toBeNull();

      const beforeFrame = framePoints();
      const axis = pivotCenter();
      let target: Element;
      let from: { x: number; y: number };
      let to: { x: number; y: number };
      if (kind === 'move') {
        target = poseFrame()!;
        from = { x: 60, y: 60 };
        to = { x: 90, y: 80 };
      } else if (kind === 'pivot') {
        target = pivotHandle();
        from = axis;
        to = { x: axis.x + 20, y: axis.y + 10 };
      } else {
        const knob = container.querySelector<HTMLElement>(
          kind === 'scale'
            ? '[data-sprite-scale-knob]'
            : '[data-rotate-corner="0"]',
        )!;
        target = knob;
        from = elementCenter(knob);
        to =
          kind === 'scale'
            ? {
                x: axis.x + (from.x - axis.x) / 2,
                y: axis.y + (from.y - axis.y) / 2,
              }
            : { x: axis.x - (from.y - axis.y), y: axis.y + (from.x - axis.x) };
      }
      // 저장 응답은 다시 연 뒤에 도착한다
      backend().hold();
      pointer('pointerdown', target, from.x, from.y);
      pointer('pointermove', window, to.x, to.y, { ctrlKey: true });
      await settle();
      expect(poseFrame()).not.toBeNull();
      expect(backend().commit).not.toHaveBeenCalled();
      const duringImageTransform = imageTransform();
      pointer('pointerup', window, to.x, to.y);
      await settle();

      expect(backend().commit).toHaveBeenCalledTimes(1);
      expect(poses()).toHaveLength(1);
      expect(poseRows()).toHaveLength(invalidSibling ? 2 : 1);
      const savedPose = structuredClone(poses()[0]) as {
        transform: { x: number; y: number; scale: number; rotation: number };
        pivot?: unknown;
      };
      const savedFrame = framePoints();
      const savedImageTransform = imageTransform();
      if (kind !== 'pivot') {
        expect(savedImageTransform).toBe(duringImageTransform);
      }
      if (kind === 'scale') {
        expect(savedPose.transform.scale).toBeCloseTo(0.5, 9);
        expect(savedImageTransform).toContain('scale(0.5)');
      } else if (kind === 'move') {
        expect(savedPose.transform).toMatchObject({ x: 30, y: 20 });
      } else if (kind === 'rotate') {
        expect(savedPose.transform.rotation).toBeCloseTo(90, 9);
      } else {
        expect(savedPose.pivot).not.toBeNull();
        expect(savedPose.pivot).not.toEqual({ x: 0.5, y: 0.5 });
        savedFrame.forEach((point, index) => {
          expect(point[0]).toBeCloseTo(beforeFrame[index][0], 6);
          expect(point[1]).toBeCloseTo(beforeFrame[index][1], 6);
        });
      }

      // 실제 FloatingPopup의 문서 capture 리스너가 바깥 클릭으로 팝업을 닫는다
      const background = container.querySelector<HTMLElement>(
        '[data-testid="grid-background"]',
      )!;
      pointer('pointerdown', background, 600, 400);
      pointer('pointerup', background, 600, 400);
      await settle();
      expect(poseFrame()).toBeNull();
      expect(harness.useSpriteEditPreviewStore.getState().preview).toBeNull();
      expect(imageTransform()).toBe(idleImageTransform);
      expect(poses()[0]).toEqual(savedPose);
      expect(poseRows()).toHaveLength(invalidSibling ? 2 : 1);

      if (closeBy === 'selection') {
        render(false);
        await settle();
        expect(poseRows()).toHaveLength(0);
        expect(imageTransform()).toBe(idleImageTransform);
        render();
        await settle();
      }
      act(() => poseRows()[0].click());
      await settle();
      expect(framePoints()).toEqual(savedFrame);
      expect(imageTransform()).toBe(savedImageTransform);
      if (kind === 'scale') {
        const scaleInput = document.querySelector<HTMLInputElement>(
          'input[aria-label="propertiesPanel.spriteScale"]',
        );
        expect(Number.parseFloat(scaleInput!.value)).toBe(50);
      }

      // 다시 연 뒤 늦게 도착한 저장 패치와 응답도 지금 자세를 되돌리지 않는다
      await act(async () => backend().release());
      await settle();
      expect(poses()[0]).toEqual(savedPose);
      expect(framePoints()).toEqual(savedFrame);
      expect(imageTransform()).toBe(savedImageTransform);
      expect(backend().commit).toHaveBeenCalledTimes(1);
      expect(poses()).toHaveLength(1);
      expect(poseRows()).toHaveLength(
        invalidSibling && closeBy === 'popup' ? 2 : 1,
      );
      expect(errors).toEqual([]);
    },
  );
});
