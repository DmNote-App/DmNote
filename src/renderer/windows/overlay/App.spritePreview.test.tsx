// 오버레이 창의 스프라이트 반영 계약
// 오버레이는 방송 화면이라 스크럽 프리뷰 봉투를 반영하지 않고
// 커밋 정산된 canonical만 레이아웃·씬 입력으로 쓴다
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyStore } from '@stores/data/useKeyStore';
import { resetAllKeySignals } from '@stores/signals/keySignals';
import { previewOverlay } from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { loadElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  createFakeElementDocumentBackend,
  type FakeElementDocumentBackend,
} from '@src/renderer/__tests__/fakeElementDocumentBackend';

import type { Document } from '@src/types/generated/elementDocument';
import type { PreviewEnvelope } from '@src/types/preview';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  backend: null as FakeElementDocumentBackend | null,
  bootstrap: vi.fn(),
  layoutInputs: [] as Array<{
    currentItemArrays: {
      spritePositions: ReadonlyArray<{ id?: string | null; dx: number }>;
    };
  }>,
  sceneSpritePositions: [] as Array<
    ReadonlyArray<{ id?: string | null; dx: number }>
  >,
}));

// 오버레이는 키·아이템 위치를 트리에서 읽는다 - 실제 트리 스토어 아래에 가짜 백엔드를 붙인다
vi.mock('@api/modules/editor/elementDocumentApi', () => ({
  elementDocumentApi: new Proxy(
    {},
    {
      get: (_target, name: string) =>
        (mocks.backend!.api as Record<string, unknown>)[name],
    },
  ),
}));
vi.mock('@tauri-apps/api/window', () => ({
  currentMonitor: vi.fn(),
  getCurrentWindow: () => ({
    startDragging: vi.fn(() => Promise.resolve()),
  }),
  Window: { getByLabel: vi.fn() },
}));
vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalPosition: class LogicalPosition {},
  PhysicalPosition: class PhysicalPosition {},
}));
vi.mock('@tauri-apps/api/menu', () => ({
  Menu: { new: vi.fn() },
}));
vi.mock('@contexts/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@hooks/app/useCustomCssInjection', () => ({
  useCustomCssInjection: vi.fn(),
}));
vi.mock('@hooks/app/useCustomJsInjection', () => ({
  useCustomJsInjection: vi.fn(),
}));
vi.mock('@hooks/app/useBlockBrowserShortcuts', () => ({
  useBlockBrowserShortcuts: vi.fn(),
}));
vi.mock('@hooks/app/useAppBootstrap', () => ({ useAppBootstrap: vi.fn() }));
vi.mock('@hooks/overlay/useBuiltinStatsSubscription', () => ({
  useBuiltinStatsSubscription: vi.fn(),
}));
vi.mock('@hooks/overlay/useNoteSystem', () => ({
  useNoteSystem: () => ({
    notesRef: { current: {} },
    subscribe: () => () => {},
    handleKeyDown: vi.fn(),
    handleKeyUp: vi.fn(),
    finalizeAllActive: vi.fn(),
    reconcileActiveNotes: vi.fn(),
    noteBuffer: {},
    updateTrackLayouts: vi.fn(),
  }),
}));
vi.mock('@hooks/overlay/useOverlayHitRegions', () => ({
  useOverlayHitRegions: () => {},
  subscribeHitContextMenu: () => () => {},
}));
vi.mock('@components/shared/OverlayScene', () => ({
  default: (props: {
    displayItemArrays: {
      spritePositions: ReadonlyArray<{ id?: string | null; dx: number }>;
    };
  }) => {
    mocks.sceneSpritePositions.push(props.displayItemArrays.spritePositions);
    return null;
  },
}));
vi.mock('@hooks/shared/useLayoutComputation', () => ({
  // 합성된 sprite 입력을 그대로 통과시켜 OverlayScene까지의 배선을 관찰
  computeLayout: (input: {
    currentItemArrays: {
      spritePositions: ReadonlyArray<{ id?: string | null; dx: number }>;
    };
  }) => {
    mocks.layoutInputs.push(input);
    return {
      bounds: null,
      displayPositions: [],
      displayItemArrays: input.currentItemArrays,
      positionOffset: { x: 0, y: 0 },
      topOffset: 0,
      webglTracks: [],
    };
  },
}));
vi.mock('@utils/input/axisEventBus', () => ({
  axisEventBus: { initialize: vi.fn(), resetBaselines: vi.fn() },
}));
vi.mock('@utils/input/keyEventBus', () => ({
  keyEventBus: {
    subscribe: vi.fn(() => vi.fn()),
    initialize: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock('@api/modules/window/obsApi', () => ({
  obsApi: {
    onResync: vi.fn(() => vi.fn()),
  },
}));

import App from './App';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';

const SPRITE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SESSION_ID = '00000000-0000-4000-8000-0000000000aa';

// 4key 장면에 스프라이트 하나 - x가 오버레이 위치(dx)
const documentWithSpriteAt = (x: number): Document =>
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
            frame: { x, y: 25, width: 200, height: 120, rotation: 0 },
            values: {
              activation: 'whileHeld',
              pressDurationMs: 300,
              baseImage: null,
              pivot: { x: 0.5, y: 0.5 },
              idleTransform: { x: 0, y: 0, rotation: 0, scale: 1 },
              poses: [],
              transitionMs: 90,
              transitionEasing: 'linear',
              referenceNaturalSize: null,
            },
          },
        ],
      },
    },
  } as unknown as Document);

mocks.backend = createFakeElementDocumentBackend(documentWithSpriteAt(15));

const remoteEnvelope = (
  overrides: Partial<PreviewEnvelope> = {},
): PreviewEnvelope => ({
  schemaVersion: 2,
  sessionId: SESSION_ID,
  seq: 1,
  kind: 'patch',
  sourceLabel: 'main',
  domain: 'spritePosition',
  mode: '4key',
  targets: [SPRITE_ID],
  patch: { dx: 99 },
  ...overrides,
});

const lastLayoutSprites = () =>
  mocks.layoutInputs[mocks.layoutInputs.length - 1].currentItemArrays
    .spritePositions;

const lastSceneSprites = () =>
  mocks.sceneSpritePositions[mocks.sceneSpritePositions.length - 1];

const flushAsync = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('overlay sprite preview composition', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalApi: Window['api'];

  beforeEach(async () => {
    originalApi = window.api;
    mocks.bootstrap.mockReset();
    mocks.bootstrap.mockResolvedValue({ activeKeys: [] });
    mocks.layoutInputs.length = 0;
    mocks.sceneSpritePositions.length = 0;
    previewOverlay.clearAll();
    window.api = {
      app: { bootstrap: mocks.bootstrap },
      keys: { onKeysReset: vi.fn(() => vi.fn()) },
    } as unknown as Window['api'];
    usePluginDisplayElementStore.setState({ elements: [] });
    useKeyStore.setState({
      selectedKeyType: '4key',
      customTabs: [],
      isBootstrapped: true,
      isLocalUpdateInProgress: false,
    });
    // 트리 스토어는 부트스트랩(목)이 아니라 여기서 불러온다. 앞 테스트가 바꾼 문서는 처음 모양으로
    await act(async () => {
      await loadElementDocumentStore();
      mocks.backend!.replace(() => documentWithSpriteAt(15));
    });
    resetAllKeySignals();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<App />);
    });
    await flushAsync();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    previewOverlay.clearAll();
    resetAllKeySignals();
    window.api = originalApi;
    vi.restoreAllMocks();
  });

  it('원격 프리뷰 patch는 오버레이 레이아웃·씬 입력에 반영되지 않는다', () => {
    expect(lastLayoutSprites()[0].dx).toBe(15);

    act(() => {
      previewOverlay.applyRemoteEnvelope(remoteEnvelope());
    });

    expect(lastLayoutSprites()[0].dx).toBe(15);
    expect(lastSceneSprites()[0].dx).toBe(15);
    // 트리 장면이 그대로라 같은 위치 목록 - layout memo 재계산도 없다
    const before = lastLayoutSprites();
    act(() => {
      previewOverlay.applyRemoteEnvelope(remoteEnvelope());
    });
    expect(lastLayoutSprites()).toBe(before);
  });

  it('커밋 정산 후에는 갱신된 canonical을 프리뷰 없이 반영한다', async () => {
    act(() => {
      previewOverlay.applyRemoteEnvelope(remoteEnvelope());
    });

    // 커밋 정산: 확정 문서 반영 + 세션 종료
    await act(async () => {
      mocks.backend!.replace(() => documentWithSpriteAt(99));
      previewOverlay.endSession(SESSION_ID);
    });

    expect(lastLayoutSprites()[0].dx).toBe(99);
    expect(lastSceneSprites()[0].dx).toBe(99);
    expect(lastSceneSprites()).toBe(lastLayoutSprites());
  });
});
