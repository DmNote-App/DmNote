/**
 * 키 컨텍스트 메뉴 예측자 context 재해석 테스트
 * 열림 시점 index가 아니라 요소 id로 현재 배열에서 재해석하는지 검증
 */
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
import type {
  KeyMenuContext,
  PluginMenuItemInternal,
} from '@src/types/plugin/api';

// 예측자 맥락은 요소 id로 트리에서 다시 읽는다 - IPC 경계만 대역 (트리 스토어·런타임은 실물)
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
const { useGridContextMenu } = await import(
  '@hooks/Grid/contextMenu/useGridContextMenu'
);
const { usePluginMenuStore } = await import(
  '@stores/plugin/usePluginMenuStore'
);
const { useKeyStore } = await import('@stores/data/useKeyStore');

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const ID_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

// 키 - 트리 순서가 순번, 입력 슬롯이 키 코드
const keyNode = (id: string, slot: string, index: number): ElementNode =>
  fillKindDefaults({
    type: 'element',
    id,
    kind: 'key',
    frame: { x: index * 70, y: 0, width: 60, height: 60, rotation: 0 },
    input: { type: 'key', slot },
    legacy: { index },
  } as unknown as ElementNode);

const documentOf = (keys: readonly [string, string][]): Document => ({
  formatVersion: 1,
  kindVersions: {},
  scenes: {
    '4key': {
      nodes: keys.map(([id, slot], index) => keyNode(id, slot, index)),
    },
  },
});

// 렌더 결과 캡처 - act가 effect까지 flush하므로 호출 시점엔 항상 최신
const captured: { current: ReturnType<typeof useGridContextMenu> | null } = {
  current: null,
};
const latest = () => captured.current!;

const Probe = () => {
  const result = useGridContextMenu({
    selectedKeyType: '4key',
    locale: 'ko',
    t: (key) => key,
    noteEffect: false,
  });
  useEffect(() => {
    captured.current = result;
  });
  return null;
};

describe('키 메뉴 예측자 context 재해석', () => {
  let container: HTMLDivElement;
  let root: Root;
  let seenContexts: KeyMenuContext[];

  const seedMenuItem = () => {
    seenContexts = [];
    const item: PluginMenuItemInternal<KeyMenuContext> = {
      id: 'inspect',
      fullId: 'pluginA::inspect',
      pluginId: 'pluginA',
      label: 'menu.inspect',
      position: 'top',
      visible: (context) => {
        seenContexts.push(context);
        return true;
      },
      disabled: (context) => context.keyCode !== 'A',
      onClick: () => {},
    };
    usePluginMenuStore.setState({
      keyMenuItems: [item as PluginMenuItemInternal<KeyMenuContext>],
      gridMenuItems: [],
    });
  };

  // 키 [id, 슬롯] - 트리 순서대로
  const renderProbe = (keys: readonly [string, string][]) => {
    act(() => {
      useKeyStore.setState({ selectedKeyType: '4key' });
      ipc.backend!.replace(() => documentOf(keys));
      root.render(<Probe />);
    });
  };

  beforeAll(async () => {
    ipc.backend = createFakeElementDocumentBackend(documentOf([]));
    await loadElementDocumentStore();
  });

  beforeEach(() => {
    seedMenuItem();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    usePluginMenuStore.setState({ keyMenuItems: [], gridMenuItems: [] });
  });

  it('열림 중 재정렬돼도 예측자 context가 원래 요소를 따라간다', () => {
    renderProbe([
      [ID_1, 'A'],
      [ID_2, 'B'],
    ]);

    // 열림 시점: index 0 = ID_1
    const items = latest().getKeyMenuItems(ID_1);
    expect(items.some((item) => item.id === 'pluginA::inspect')).toBe(true);
    expect(seenContexts.at(-1)).toMatchObject({
      id: ID_1,
      index: 0,
      keyCode: 'A',
    });

    // 재정렬 리렌더 - 동결된 index 0은 이제 다른 요소를 가리킨다
    renderProbe([
      [ID_2, 'B'],
      [ID_1, 'A'],
    ]);

    const reordered = latest().getKeyMenuItems(ID_1);
    const pluginItem = reordered.find(
      (item) => item.id === 'pluginA::inspect',
    )!;
    // id로 재해석되어 원래 요소(ID_1) 기준으로 평가된다
    expect(seenContexts.at(-1)).toMatchObject({
      id: ID_1,
      index: 1,
      keyCode: 'A',
    });
    expect(pluginItem.disabled).toBe(false);
  });

  it('요소 소실 시 플러그인 항목을 감춰 fail-closed로 동작한다', () => {
    renderProbe([[ID_2, 'B']]);

    const items = latest().getKeyMenuItems(ID_1);
    // 예측자 미평가 + 플러그인 항목 제외, 기본 항목은 유지
    expect(seenContexts).toHaveLength(0);
    expect(items.some((item) => item.isPlugin)).toBe(false);
    expect(items.map((item) => item.id)).toEqual([
      'delete',
      'duplicate',
      'counterReset',
      'bringToFront',
      'sendToBack',
    ]);
  });

  it('안정 id가 없으면(null) 플러그인 항목을 노출하지 않는다', () => {
    renderProbe([[ID_1, 'A']]);

    const items = latest().getKeyMenuItems(null);
    expect(seenContexts).toHaveLength(0);
    expect(items.some((item) => item.isPlugin)).toBe(false);
  });
});
