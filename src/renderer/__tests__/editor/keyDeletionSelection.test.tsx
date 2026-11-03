// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { FakeElementDocumentBackend } from '@src/renderer/__tests__/fakeElementDocumentBackend';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { Document } from '@src/types/generated/elementDocument';

const apiMocks = vi.hoisted(() => ({
  resetMode: vi.fn(),
}));

vi.mock('@api/modules/editor/keysApi', () => ({
  keysApi: {
    resetMode: (...args: unknown[]) => apiMocks.resetMode(...args),
  },
}));

// IPC 경계만 대역 - 키 순번은 트리 순서 (트리 스토어·런타임은 실물)
const ipc = vi.hoisted(() => ({
  backend: null as FakeElementDocumentBackend | null,
}));
vi.mock('@api/modules/editor/elementDocumentApi', () => ({
  elementDocumentApi: new Proxy(
    {},
    {
      get: (_target, name: string) =>
        name === 'registerKind' || name === 'unregisterKind'
          ? async () => undefined
          : (ipc.backend!.api as Record<string, unknown>)[name],
    },
  ),
}));

vi.mock('@api/pluginDisplayElements', () => ({
  setUndoRedoInProgress: vi.fn(),
}));

vi.mock('@plugins/runtime/displayElement/displayElementApi', () => ({
  removeDisplayElementsInternal: vi.fn(),
}));

const { createFakeElementDocumentBackend } = await import(
  '@src/renderer/__tests__/fakeElementDocumentBackend'
);
const { loadElementDocumentStore } = await import(
  '@src/renderer/editor/document/elementDocumentRuntime'
);
const { fillKindDefaults } = await import(
  '@src/renderer/elementKinds/runtime/elementKindDefaults'
);
const { useKeyManager } = await import('@hooks/useKeyManager');
const { useKeyStore } = await import('@stores/data/useKeyStore');
const { useDocumentSelectionStore } = await import(
  '@stores/grid/useDocumentSelectionStore'
);

type KeyManager = ReturnType<typeof useKeyManager>;

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('키 삭제 선택 정리', () => {
  const keyIds = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
  ];
  const originalApi = window.api;
  const resetMode = apiMocks.resetMode;
  let root: Root;
  let host: HTMLDivElement;
  let manager: KeyManager | null;

  // 키 셋 - 슬롯 A·B·C, 트리 순서가 순번
  const documentOf = (): Document => ({
    formatVersion: 1,
    kindVersions: {},
    scenes: {
      '4key': {
        nodes: keyIds.map((id, index) =>
          fillKindDefaults({
            type: 'element',
            id,
            kind: 'key',
            frame: { x: index * 70, y: 0, width: 60, height: 60, rotation: 0 },
            input: { type: 'key', slot: ['A', 'B', 'C'][index] },
            legacy: { index },
          } as unknown as ElementNode),
        ),
      },
    },
  });

  beforeAll(async () => {
    ipc.backend = createFakeElementDocumentBackend(documentOf());
    await loadElementDocumentStore();
  });

  const Harness = () => {
    const value = useKeyManager();
    useEffect(() => {
      manager = value;
    }, [value]);
    return null;
  };

  const latest = () => {
    if (!manager) throw new Error('key manager not captured');
    return manager;
  };

  beforeEach(() => {
    resetMode.mockReset().mockResolvedValue({ success: true });
    window.api = {
      keys: { resetMode },
    } as unknown as Window['api'];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    manager = null;
    useKeyStore.setState({
      selectedKeyType: '4key',
      isBootstrapped: false,
      isLocalUpdateInProgress: false,
    });
    act(() => ipc.backend!.replace(documentOf));
    useDocumentSelectionStore.getState().clearSelection();
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useDocumentSelectionStore.getState().clearSelection();
    window.api = originalApi;
  });

  it('현재 탭 리셋 성공 시 grid 선택을 해제한다', async () => {
    useDocumentSelectionStore
      .getState()
      .setSelectedElements([{ type: 'key', id: keyIds[0], index: 0 }]);
    act(() => root.render(<Harness />));

    await act(async () => latest().handleResetCurrentMode());

    expect(useDocumentSelectionStore.getState().selectedElements).toEqual([]);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([]);
  });

  it('현재 탭 리셋 실패 시 grid 선택을 보존한다', async () => {
    resetMode.mockResolvedValueOnce({ success: false });
    const selection = [{ type: 'key' as const, id: keyIds[0], index: 0 }];
    useDocumentSelectionStore.getState().setSelectedElements(selection);
    act(() => root.render(<Harness />));

    await act(async () => latest().handleResetCurrentMode());

    // 키 선택은 트리 선택이 맡는다
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([
      keyIds[0],
    ]);
  });
});
