import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SelectedElement } from '@stores/grid/useGridSelectionStore';
import type { ElementBounds } from '@utils/grid/smartGuides';
import { aspectScaleRange } from '@components/main/Grid/handles/aspectResize';
import { useGridResize } from './useGridResize';
import { useCommittedApplyStore } from '@stores/data/useCommittedApplyStore';
import {
  acquireHistoryEditorFlushLock,
  resetHistoryEditorFlushLock,
} from '@src/renderer/editor/runtime/lifecycle/historyEditorFlushLock';

const mocks = vi.hoisted(() => ({
  updateElement: vi.fn(),
  setResizing: vi.fn(),
  clearGuides: vi.fn(),
  setDraggedBounds: vi.fn(),
  setActiveGuides: vi.fn(),
  setSpacingGuides: vi.fn(),
  setSizeMatchGuides: vi.fn(),
  calculateSnapPoints: vi.fn(),
  calculateSizeSnap: vi.fn(),
  // 스냅 실물 - 비율 고정·축 게이트처럼 실제 스냅 계산이 필요한 테스트가 되돌려 쓴다
  realSmartGuides: null as typeof import('@utils/grid/smartGuides') | null,
  commitFrames: vi.fn(
    (_scene: string, _ids: Iterable<string>, _gestureId?: string) =>
      Promise.resolve(),
  ),
  sendBridge: vi.fn(),
  elements: [] as Array<{ fullId: string; pluginId: string }>,
  gridSettings: {
    alignmentGuides: false,
    spacingGuides: false,
    sizeMatchGuides: false,
  },
}));

// 플러그인 요소 최종 위치·크기는 트리 노드 틀 커밋 - 고친 요소·동작 id를 기록한다
// 플러그인 틀 - 요소마다 위치·크기를 고치고(런타임 요소는 런타임 스토어, 인스턴스는 트리를 따라온다) 한 번에 보낸다
vi.mock('@plugins/runtime/displayElement/pluginTreeGeometry', () => ({
  setPluginElementFrames: (
    scene: string,
    frames: ReadonlyMap<
      string,
      { x?: number; y?: number; width?: number; height?: number }
    >,
    gestureId?: string,
  ) => {
    for (const [fullId, frame] of frames) {
      mocks.updateElement(fullId, {
        position: { x: frame.x, y: frame.y },
        measuredSize: { width: frame.width, height: frame.height },
      });
    }
    return mocks.commitFrames(scene, [...frames.keys()], gestureId);
  },
}));

vi.mock('@utils/plugin/bridgeMessages', () => ({
  sendBridgeMessageBestEffort: mocks.sendBridge,
}));

vi.mock('@stores/plugin/usePluginDisplayElementStore', () => ({
  usePluginDisplayElementStore: {
    getState: () => ({
      elements: mocks.elements,
      updateElement: mocks.updateElement,
    }),
  },
}));

vi.mock('@stores/grid/useSmartGuidesStore', () => ({
  useSmartGuidesStore: {
    getState: () => ({
      clearGuides: mocks.clearGuides,
      setDraggedBounds: mocks.setDraggedBounds,
      setActiveGuides: mocks.setActiveGuides,
      setSpacingGuides: mocks.setSpacingGuides,
      setSizeMatchGuides: mocks.setSizeMatchGuides,
    }),
  },
}));

vi.mock('@utils/grid/smartGuides', async (importOriginal) => {
  const original = await importOriginal<
    typeof import('@utils/grid/smartGuides')
  >();
  mocks.realSmartGuides = original;
  return {
    ...original,
    calculateSnapPoints: mocks.calculateSnapPoints,
    calculateSizeSnap: mocks.calculateSizeSnap,
  };
});

const useRealSmartGuides = () => {
  const real = mocks.realSmartGuides!;
  mocks.calculateSnapPoints.mockImplementation(real.calculateSnapPoints);
  mocks.calculateSizeSnap.mockImplementation(real.calculateSizeSnap);
};

vi.mock('@stores/grid/useGridSelectionStore', () => ({
  selectionElementId: (
    type: string,
    position: { id?: string } | undefined,
    index: number,
  ) => position?.id || `${type}-${index}`,
  useGridSelectionStore: {
    getState: () => ({
      setResizing: mocks.setResizing,
    }),
  },
}));

vi.mock('@stores/useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      gridSettings: mocks.gridSettings,
    }),
  },
}));

type ResizeApi = ReturnType<typeof useGridResize>;

interface HarnessProps {
  selectedElements: SelectedElement[];
  expose: (api: ResizeApi) => void;
  getOtherElements?: (excludeId: string) => ElementBounds[];
}

const Harness = ({
  selectedElements,
  expose,
  getOtherElements,
}: HarnessProps) => {
  const api = useGridResize({
    selectedElements,
    selectedKeyType: '4key',
    getOtherElements,
  });
  expose(api);
  return null;
};

const pluginSelection = (id: string): SelectedElement => ({
  id,
  type: 'plugin',
});

describe('useGridResize plugin gesture lifecycle', () => {
  let host: HTMLDivElement;
  let root: Root;
  let api: ResizeApi;
  let events: string[];
  // 플러그인 틀 커밋의 동작 id
  const frameGestureIds = () =>
    mocks.commitFrames.mock.calls.map((call) => call[2]);

  const renderHarness = async (
    selectedElements: SelectedElement[],
    getOtherElements?: (excludeId: string) => ElementBounds[],
  ) => {
    await act(async () => {
      root.render(
        <Harness
          selectedElements={selectedElements}
          getOtherElements={getOtherElements}
          expose={(nextApi) => {
            api = nextApi;
          }}
        />,
      );
    });
  };

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    events = [];
    mocks.updateElement.mockReset();
    mocks.setResizing.mockReset();
    mocks.clearGuides.mockReset();
    mocks.setDraggedBounds.mockReset();
    mocks.setActiveGuides.mockReset();
    mocks.setSpacingGuides.mockReset();
    mocks.setSizeMatchGuides.mockReset();
    mocks.calculateSnapPoints.mockReset();
    mocks.calculateSizeSnap.mockReset();
    mocks.sendBridge.mockClear();
    mocks.commitFrames.mockReset();
    mocks.commitFrames.mockImplementation(
      (_scene: string, ids: Iterable<string>) => {
        events.push(`commit:${[...ids].join(',')}`);
        return Promise.resolve();
      },
    );
    mocks.elements = [];
    mocks.gridSettings = {
      alignmentGuides: false,
      spacingGuides: false,
      sizeMatchGuides: false,
    };
    mocks.calculateSnapPoints.mockImplementation((draggedBounds) => ({
      snappedX: draggedBounds.left,
      snappedY: draggedBounds.top,
      guides: [],
      spacingGuides: [],
      didSnapX: false,
      didSnapY: false,
      didSpacingSnapX: false,
      didSpacingSnapY: false,
    }));
    mocks.calculateSizeSnap.mockImplementation((width, height) => ({
      snappedWidth: width,
      snappedHeight: height,
      sizeMatchGuides: [],
      didSnapWidth: false,
      didSnapHeight: false,
    }));
    mocks.updateElement.mockImplementation((fullId: string) => {
      events.push(`update:${fullId}`);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    resetHistoryEditorFlushLock();
    host.remove();
  });

  it('리사이즈 전용 상태만 수명에 맞춰 켜고 끈다', async () => {
    mocks.elements = [{ fullId: 'plugin-a:one', pluginId: 'plugin-a' }];
    await renderHarness([pluginSelection('plugin-a:one')]);

    await act(async () => {
      api.handleResizeStart();
    });
    expect(mocks.setResizing).toHaveBeenLastCalledWith(true);

    await act(async () => {
      api.handleResize({ x: 10, y: 20, width: 120, height: 80 });
      api.handleResizeComplete();
    });
    expect(mocks.setResizing).toHaveBeenLastCalledWith(false);
  });

  it('단일 plugin resize는 최종 값을 반영한 뒤 트리 틀로 저장하고 다음 resize와 분리한다', async () => {
    mocks.elements = [{ fullId: 'plugin-a:one', pluginId: 'plugin-a' }];
    await renderHarness([pluginSelection('plugin-a:one')]);

    for (const width of [120, 140]) {
      await act(async () => {
        api.handleResizeStart();
        api.handleResize({ x: 10, y: 20, width, height: 80 });
        api.handleResizeComplete();
      });
    }

    expect(events).toEqual([
      'update:plugin-a:one',
      'commit:plugin-a:one',
      'update:plugin-a:one',
      'commit:plugin-a:one',
    ]);
    const [first, second] = frameGestureIds();
    expect(typeof first).toBe('string');
    expect(second).not.toBe(first);
  });

  it('그룹 resize의 플러그인들은 최종 값을 반영하고 한 동작의 트리 틀 커밋으로 저장한다', async () => {
    mocks.elements = [
      { fullId: 'plugin-a:one', pluginId: 'plugin-a' },
      { fullId: 'plugin-b:one', pluginId: 'plugin-b' },
    ];
    const selected = [
      pluginSelection('plugin-a:one'),
      pluginSelection('plugin-b:one'),
    ];
    await renderHarness(selected);

    await act(async () => {
      api.handleResizeStart();
      api.handleGroupResize({
        groupBounds: { x: 10, y: 20, width: 240, height: 80 },
        elementBounds: selected.map((element, index) => ({
          element,
          bounds: { x: 10 + index * 120, y: 20, width: 100, height: 80 },
        })),
        handle: { id: 'e', dx: 1, dy: 0 },
      });
      api.handleGroupResizeComplete();
    });

    expect(events).toEqual([
      'update:plugin-a:one',
      'update:plugin-b:one',
      'commit:plugin-a:one,plugin-b:one',
    ]);
    expect(mocks.sendBridge).toHaveBeenCalledWith(
      'overlay',
      'plugin:displayElements:sync',
      { elements: mocks.elements },
    );
  });

  it('그룹 resize 중 선택이 바뀌어도 시작 구성으로 정산한다', async () => {
    mocks.elements = [
      { fullId: 'plugin-a:one', pluginId: 'plugin-a' },
      { fullId: 'plugin-a:two', pluginId: 'plugin-a' },
    ];
    const selected = [
      pluginSelection('plugin-a:one'),
      pluginSelection('plugin-a:two'),
    ];
    await renderHarness(selected);

    await act(async () => {
      api.handleResizeStart();
      api.handleGroupResize({
        groupBounds: { x: 10, y: 20, width: 200, height: 80 },
        elementBounds: selected.map((element, index) => ({
          element,
          bounds: { x: 10 + index * 100, y: 20, width: 80, height: 80 },
        })),
        handle: { id: 'e', dx: 1, dy: 0 },
      });
    });
    // 대기 중 다른 선택으로 교체
    mocks.elements = [{ fullId: 'plugin-b:one', pluginId: 'plugin-b' }];
    await renderHarness([pluginSelection('plugin-b:one')]);
    await act(async () => {
      api.handleGroupResizeComplete();
    });

    // 정산은 시작 구성(plugin-a 둘)만
    expect(events).toEqual([
      'update:plugin-a:one',
      'update:plugin-a:two',
      'commit:plugin-a:one,plugin-a:two',
    ]);
  });

  it('리사이즈 중 선택이 바뀌어도 시작 시점 동결 대상에 bounds를 커밋한다', async () => {
    mocks.elements = [{ fullId: 'plugin-a:one', pluginId: 'plugin-a' }];
    await renderHarness([pluginSelection('plugin-a:one')]);

    await act(async () => {
      api.handleResizeStart();
      api.handleResize({ x: 10, y: 20, width: 120, height: 80 });
    });
    // 대기 중 같은 개수의 다른 선택으로 교체 (분리 패널 동기화 등)
    await renderHarness([pluginSelection('plugin-b:one')]);
    await act(async () => {
      api.handleResizeComplete();
    });

    expect(events).toEqual(['update:plugin-a:one', 'commit:plugin-a:one']);
    expect(mocks.updateElement).toHaveBeenCalledWith('plugin-a:one', {
      position: { x: 10, y: 20 },
      measuredSize: { width: 120, height: 80 },
    });
  });

  it('리사이즈 중 선택이 바뀌어도 프리뷰 가이드는 시작 요소를 제외한다', async () => {
    const getOtherElements = vi.fn(() => [] as ElementBounds[]);
    mocks.gridSettings = {
      alignmentGuides: true,
      spacingGuides: true,
      sizeMatchGuides: true,
    };
    await renderHarness([pluginSelection('plugin-a:one')], getOtherElements);
    const activeResizeApi = api;

    await act(async () => {
      activeResizeApi.handleResizeStart();
    });
    // 리사이즈 중 다른 요소로 선택이 바뀐다
    await renderHarness([pluginSelection('plugin-b:one')], getOtherElements);
    await act(async () => {
      activeResizeApi.handleResize({
        x: 0,
        y: 0,
        width: 118,
        height: 60,
        handle: { id: 'e', dx: 1, dy: 0 },
      });
    });

    expect(getOtherElements).toHaveBeenLastCalledWith('plugin-a:one');
  });

  it('size match 비활성 plugin resize는 참조용 수평 간격 가이드를 유지한다', async () => {
    const pluginId = 'plugin-a:one';
    const unrelatedGuide = {
      type: 'spacing' as const,
      direction: 'horizontal' as const,
      value: 20,
      startPos: 0,
      endPos: 20,
      crossAxisPos: 0,
      fromElementId: 'reference-a',
      toElementId: 'reference-b',
      isMatched: true,
    };
    const relatedGuide = {
      ...unrelatedGuide,
      fromElementId: pluginId,
      toElementId: 'reference-c',
    };
    mocks.gridSettings = {
      alignmentGuides: true,
      spacingGuides: true,
      sizeMatchGuides: false,
    };
    mocks.calculateSnapPoints.mockReturnValue({
      snappedX: 0,
      snappedY: 0,
      guides: [],
      spacingGuides: [relatedGuide, unrelatedGuide],
      didSnapX: true,
      didSnapY: false,
      didSpacingSnapX: true,
      didSpacingSnapY: false,
    });
    await renderHarness([pluginSelection(pluginId)], () => []);

    await act(async () => {
      api.handleResizeStart();
      api.handleResize({
        x: 0,
        y: 0,
        width: 120,
        height: 60,
        handle: { id: 'e', dx: 1, dy: 0 },
      });
    });

    expect(mocks.setSpacingGuides).toHaveBeenLastCalledWith([
      relatedGuide,
      unrelatedGuide,
    ]);
  });

  it('active resize 중 unmount하면 저장 없이 리사이즈 상태를 끈다', async () => {
    mocks.elements = [{ fullId: 'plugin-a:one', pluginId: 'plugin-a' }];
    await renderHarness([pluginSelection('plugin-a:one')]);

    await act(async () => {
      api.handleResizeStart();
      root.render(null);
    });

    expect(mocks.commitFrames).not.toHaveBeenCalled();
    expect(mocks.setResizing).toHaveBeenLastCalledWith(false);
  });

  it('history 잠금 중 새 resize는 시작하거나 저장하지 않는다', async () => {
    mocks.elements = [{ fullId: 'plugin-a:one', pluginId: 'plugin-a' }];
    await renderHarness([pluginSelection('plugin-a:one')]);
    acquireHistoryEditorFlushLock('resize-start');
    try {
      await act(async () => {
        api.handleResizeStart();
        api.handleResize({ x: 10, y: 20, width: 80, height: 90 });
        api.handleResizeComplete();
      });
      expect(mocks.commitFrames).not.toHaveBeenCalled();
      expect(mocks.setResizing).not.toHaveBeenCalled();
      expect(api.previewBounds).toBeNull();
    } finally {
      resetHistoryEditorFlushLock();
    }
  });

  it.each(
    ['plugin', 'group'].flatMap((kind) =>
      ['applied', 'locked'].map((boundary) => ({ kind, boundary })),
    ),
  )(
    '$kind history $boundary 뒤 늦은 preview와 complete는 저장하지 않는다',
    async ({ kind, boundary }) => {
      mocks.elements = [{ fullId: 'plugin-a:one', pluginId: 'plugin-a' }];
      const selection = [pluginSelection('plugin-a:one')];
      await renderHarness(selection);
      const bounds = { x: 10, y: 20, width: 80, height: 90 };
      const groupResult = {
        groupBounds: bounds,
        elementBounds: [{ element: selection[0], bounds }],
        handle: { id: 'se', dx: 1, dy: 1 },
      };
      await act(async () => {
        api.handleResizeStart();
        if (kind === 'group') api.handleGroupResize(groupResult);
        else api.handleResize(bounds);
        if (boundary === 'applied')
          useCommittedApplyStore.getState().bump('historyUndo');
        else acquireHistoryEditorFlushLock('resize-release');
        if (kind === 'group') {
          api.handleGroupResize(groupResult);
          api.handleGroupResizeComplete();
        } else {
          api.handleResize(bounds);
          api.handleResizeComplete();
        }
      });
      expect(mocks.updateElement).not.toHaveBeenCalled();
      if (boundary === 'locked') {
        await act(async () => {
          useCommittedApplyStore.getState().bump('historyUndo');
        });
        resetHistoryEditorFlushLock();
      }
      expect(api.previewBounds).toBeNull();
      expect(api.previewGroupBounds).toBeNull();
      expect(api.previewElementBounds).toBeNull();
      expect(mocks.commitFrames).not.toHaveBeenCalled();
    },
  );

  it('비율 고정 리사이즈는 기준 축의 크기 일치만 받고 반대 축을 같은 배율로 놓는다', async () => {
    useRealSmartGuides();
    mocks.gridSettings = {
      alignmentGuides: true,
      spacingGuides: false,
      sizeMatchGuides: true,
    };
    // 폭 112는 임계값 4px 안, 높이 60은 밖. 가장자리는 멀리 둬 정렬 스냅은 없다
    const other: ElementBounds = {
      id: 'other',
      left: 1000,
      top: 1000,
      right: 1112,
      bottom: 1060,
      centerX: 1056,
      centerY: 1030,
      width: 112,
      height: 60,
    };
    await renderHarness([pluginSelection('plugin-a')], () => [other]);
    const start = { x: 0, y: 0, width: 110, height: 55 };
    const handle = { id: 'e', dx: 1, dy: 0 };
    await act(async () => {
      api.handleResizeStart();
    });
    await act(async () => {
      api.handleResize({
        ...start,
        handle,
        aspect: {
          start,
          primary: 'width',
          range: aspectScaleRange(start, { dx: 1, dy: 0 }, 10),
        },
      });
    });
    expect(api.previewBounds?.width).toBe(112);
    expect(api.previewBounds?.height).toBeCloseTo(56, 9);
    expect(api.previewBounds?.y).toBeCloseTo(-0.5, 9);
    expect(api.previewBounds?.x).toBe(0);
  });

  it('기준 축 스냅이 배율 범위를 넘으면 상한으로 자른다', async () => {
    useRealSmartGuides();
    mocks.gridSettings = {
      alignmentGuides: true,
      spacingGuides: false,
      sizeMatchGuides: true,
    };
    const other: ElementBounds = {
      id: 'other',
      left: 1000,
      top: 1000,
      right: 1104,
      bottom: 1500,
      centerX: 1052,
      centerY: 1250,
      width: 104,
      height: 500,
    };
    await renderHarness([pluginSelection('plugin-a')], () => [other]);
    const start = { x: 0, y: 0, width: 100, height: 100 };
    await act(async () => {
      api.handleResizeStart();
    });
    await act(async () => {
      api.handleResize({
        ...start,
        handle: { id: 'e', dx: 1, dy: 0 },
        aspect: { start, primary: 'width', range: { min: 0.5, max: 1.02 } },
      });
    });
    // 크기 일치 104 → 배율 1.04 는 상한 1.02 밖 → 102x102, 세로는 중앙 고정
    expect(api.previewBounds).toEqual({ x: 0, y: -1, width: 102, height: 102 });
  });

  it('잡지 않은 축의 크기 일치는 무시한다 (가로 핸들은 높이를 바꾸지 않는다)', async () => {
    useRealSmartGuides();
    mocks.gridSettings = {
      alignmentGuides: true,
      spacingGuides: false,
      sizeMatchGuides: true,
    };
    // 높이 62는 임계값 안, 폭 500은 밖
    const other: ElementBounds = {
      id: 'other',
      left: 1000,
      top: 1000,
      right: 1500,
      bottom: 1062,
      centerX: 1250,
      centerY: 1031,
      width: 500,
      height: 62,
    };
    await renderHarness([pluginSelection('plugin-a')], () => [other]);
    await act(async () => {
      api.handleResizeStart();
    });
    await act(async () => {
      api.handleResize({
        x: 0,
        y: 0,
        width: 118,
        height: 60,
        handle: { id: 'e', dx: 1, dy: 0 },
      });
    });
    expect(api.previewBounds).toEqual({ x: 0, y: 0, width: 118, height: 60 });
  });

  it('플러그인 단일 리사이즈도 비율 고정 재유도를 같은 경로로 받는다', async () => {
    useRealSmartGuides();
    mocks.gridSettings = {
      alignmentGuides: true,
      spacingGuides: false,
      sizeMatchGuides: true,
    };
    mocks.elements = [{ fullId: 'plugin-a', pluginId: 'plugin' }];
    // 폭 104는 임계값 안, 높이 500은 밖
    const other: ElementBounds = {
      id: 'other',
      left: 1000,
      top: 1000,
      right: 1104,
      bottom: 1500,
      centerX: 1052,
      centerY: 1250,
      width: 104,
      height: 500,
    };
    await renderHarness([pluginSelection('plugin-a')], () => [other]);
    const start = { x: 0, y: 0, width: 100, height: 100 };
    await act(async () => {
      api.handleResizeStart();
    });
    await act(async () => {
      api.handleResize({
        ...start,
        handle: { id: 'se', dx: 1, dy: 1 },
        aspect: { start, primary: 'width', range: { min: 0.1, max: 10 } },
      });
    });
    // Shift 모서리: 폭 크기 일치 104 → 높이도 같은 배율 104
    expect(api.previewBounds).toEqual({ x: 0, y: 0, width: 104, height: 104 });
  });

  it('비율 고정은 무시한 반대 축의 정렬 가이드를 그리지 않는다', async () => {
    useRealSmartGuides();
    mocks.gridSettings = {
      alignmentGuides: true,
      spacingGuides: false,
      sizeMatchGuides: false,
    };
    // 오른쪽 가장자리 105는 오른쪽 108에(3px), 위쪽 0은 위쪽 0에 정렬 후보 - 두 축 모두 임계값 안
    const other: ElementBounds = {
      id: 'other',
      left: 8,
      top: 0,
      right: 108,
      bottom: 100,
      centerX: 58,
      centerY: 50,
      width: 100,
      height: 100,
    };
    await renderHarness([pluginSelection('plugin-a')], () => [other]);
    const start = { x: 0, y: 0, width: 100, height: 100 };
    await act(async () => {
      api.handleResizeStart();
    });
    await act(async () => {
      api.handleResize({
        x: 0,
        y: 0,
        width: 105,
        height: 105,
        handle: { id: 'se', dx: 1, dy: 1 },
        aspect: { start, primary: 'width', range: { min: 0.1, max: 10 } },
      });
    });
    // 폭만 108로 스냅되고 높이는 같은 배율로 108
    expect(api.previewBounds).toEqual({ x: 0, y: 0, width: 108, height: 108 });
    const guides = mocks.setActiveGuides.mock.calls.at(-1)?.[0] as Array<{
      type: string;
    }>;
    expect(guides.length).toBeGreaterThan(0);
    expect(guides.every((guide) => guide.type === 'vertical')).toBe(true);
  });

  it('잡지 않은 축은 정렬 후보가 있어도 위치를 옮기지 않는다', async () => {
    useRealSmartGuides();
    mocks.gridSettings = {
      alignmentGuides: true,
      spacingGuides: false,
      sizeMatchGuides: false,
    };
    // 왼쪽 가장자리 3은 다른 요소의 왼쪽 0에 정렬 후보(3px) - 아래 핸들이라 X는 잡지 않은 축
    const other: ElementBounds = {
      id: 'other',
      left: 0,
      top: 500,
      right: 100,
      bottom: 600,
      centerX: 50,
      centerY: 550,
      width: 100,
      height: 100,
    };
    await renderHarness([pluginSelection('plugin-a')], () => [other]);
    await act(async () => {
      api.handleResizeStart();
    });
    await act(async () => {
      api.handleResize({
        x: 3,
        y: 0,
        width: 100,
        height: 120,
        handle: { id: 's', dx: 0, dy: 1 },
      });
    });
    expect(api.previewBounds).toEqual({ x: 3, y: 0, width: 100, height: 120 });
    expect(mocks.setActiveGuides).not.toHaveBeenCalled();
  });
});
