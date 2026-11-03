// @vitest-environment jsdom
import React, { act } from 'react';
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
import type { KeySlot } from '@src/types/key/keys';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  rebind: vi.fn(async (_id: string, _slot: unknown) => true),
  mapping: null as null | {
    keyIndex: number;
    keySlot?: KeySlot | null;
    onKeyMappingChange?: (index: number, slot: KeySlot) => void;
  },
}));

vi.mock(
  '@src/renderer/editor/runtime/operations/keySlotOps',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    rebindKeySlotById: (id: string, slot: unknown) => mocks.rebind(id, slot),
  }),
);
// 매핑 섹션 부품은 옛 키 패널 그대로 - 받은 값·쓰기만 본다
vi.mock(
  '@components/main/Grid/PropertiesPanel/single/SingleMappingSection',
  () => ({
    default: (props: NonNullable<typeof mocks.mapping>) => {
      mocks.mapping = props;
      return null;
    },
  }),
);

// IPC 경계만 대역 - 트리 스토어·런타임은 실물
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

const { createFakeElementDocumentBackend } = await import(
  '@src/renderer/__tests__/fakeElementDocumentBackend'
);
const { loadElementDocumentStore } = await import(
  '@src/renderer/editor/document/elementDocumentRuntime'
);
const { fillKindDefaults } = await import(
  '@src/renderer/elementKinds/runtime/elementKindDefaults'
);
const { default: KeySlotSection } = await import('./KeySlotSection');

const KEY_A = '62000000-0000-4000-8000-000000000001';
const KEY_B = '62000000-0000-4000-8000-000000000002';

const keyNode = (id: string, slot: string, index: number): ElementNode =>
  fillKindDefaults({
    type: 'element',
    id,
    kind: 'key',
    frame: { x: index * 70, y: 0, width: 60, height: 60, rotation: 0 },
    input: { type: 'key', slot },
    legacy: { index },
  } as unknown as ElementNode);

const documentOf = (): Document => ({
  formatVersion: 1,
  kindVersions: {},
  scenes: {
    '4key': { nodes: [keyNode(KEY_A, 'A', 0), keyNode(KEY_B, 'B', 1)] },
  },
});

describe('키 매핑 섹션', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    ipc.backend = createFakeElementDocumentBackend(documentOf());
    await loadElementDocumentStore();
  });

  beforeEach(() => {
    mocks.rebind.mockClear();
    mocks.mapping = null;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root.render(
        <KeySlotSection
          sceneId="4key"
          elementIds={[KEY_B]}
          panelElement={null}
          t={(key) => key}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('고른 키의 입력 슬롯과 트리 순번을 보인다', () => {
    expect(mocks.mapping?.keySlot).toBe('B');
    expect(mocks.mapping?.keyIndex).toBe(1);
  });

  it('바꾼 슬롯은 고른 키의 안정 id로 저장한다 (순번으로 다시 찾지 않는다)', () => {
    act(() => mocks.mapping?.onKeyMappingChange?.(99, 'Z'));

    expect(mocks.rebind).toHaveBeenCalledExactlyOnceWith(KEY_B, 'Z');
  });

  it('저장 대기 중 대상 키가 사라지면 무시된 편집을 기록한다', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.rebind.mockResolvedValueOnce(false);

    await act(async () => mocks.mapping?.onKeyMappingChange?.(1, 'Z'));

    expect(warning).toHaveBeenCalledWith(
      'Element operation skipped (fail-closed)',
      'key mapping target disappeared',
    );
    warning.mockRestore();
  });
});
