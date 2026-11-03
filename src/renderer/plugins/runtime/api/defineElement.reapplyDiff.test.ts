// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FakeElementDocumentBackend } from '@src/renderer/__tests__/fakeElementDocumentBackend';
import type { Document, Node } from '@src/types/generated/elementDocument';

// IPC 경계만 대역 - 트리 스토어·런타임·플러그인 런타임은 실물
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

vi.mock('@utils/plugin/panelModelSync', () => ({
  schedulePluginPanelModelSync: vi.fn(),
}));

vi.mock('@utils/plugin/bridgeMessages', () => ({
  sendBridgeMessageBestEffort: vi.fn(),
}));

import { createFakeElementDocumentBackend } from '@src/renderer/__tests__/fakeElementDocumentBackend';
import {
  getElementDocumentStore,
  loadElementDocumentStore,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import { drainEditorWrites } from '@src/renderer/editor/runtime/lifecycle/editorWriteBarrier';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import {
  displayElementInstanceRegistry,
  getDisplayElementInstance,
} from '../displayElement/instanceRegistry';
import {
  addDisplayElementInternal,
  displayElementApi,
} from '../displayElement/displayElementApi';
import {
  buildSavedPluginInstances,
  createDefineElement,
  type SavedInstance,
} from './defineElement';
import { runPluginTeardown } from '../pluginTeardown';

const ID_A = '50000000-0000-4000-8000-000000000001';
const ID_B = '50000000-0000-4000-8000-000000000002';
const ID_C = '50000000-0000-4000-8000-000000000003';

const saved = (
  instanceId: string,
  overrides: Partial<SavedInstance> = {},
): SavedInstance => ({
  instanceId,
  position: { x: 0, y: 0 },
  tabId: '4key',
  hidden: false,
  ...overrides,
});

// 저장 모양 → 트리 노드 (백엔드 버킷 → 트리와 같은 모양 - 그룹은 부모 그룹, 겹침값·순번은 항목에)
const documentWith = (pluginId: string, instances: SavedInstance[]) => {
  const scenes: Record<string, Node[]> = { '4key': [], '5key': [] };
  instances.forEach((instance, order) => {
    const node = {
      type: 'element',
      id: `${pluginId}::${instance.instanceId}`,
      kind: `plugin:${pluginId}`,
      frame: {
        x: instance.position.x,
        y: instance.position.y,
        width: instance.measuredSize?.width ?? 200,
        height: instance.measuredSize?.height ?? 150,
        rotation: 0,
      },
      hidden: instance.hidden === true,
      values: instance.settings ?? {},
      legacy: { pluginEntry: instance, order },
    } as unknown as Node;
    const nodes = (scenes[instance.tabId ?? '4key'] ??= []);
    if (!instance.groupId) {
      nodes.push(node);
      return;
    }
    const group = nodes.find(
      (candidate) => candidate.id === instance.groupId,
    ) as (Node & { type: 'group' }) | undefined;
    if (group) group.children.push(node);
    else
      nodes.push({
        type: 'group',
        id: instance.groupId,
        name: instance.groupId,
        children: [node],
      } as Node);
  });
  return {
    formatVersion: 1,
    kindVersions: {},
    scenes: Object.fromEntries(
      Object.entries(scenes).map(([sceneId, nodes]) => [sceneId, { nodes }]),
    ),
  } as unknown as Document;
};

ipc.backend = createFakeElementDocumentBackend(documentWith('none', []));
const backend = () => ipc.backend!;

describe('플러그인 인스턴스 저장 - 원본은 트리', () => {
  const cleanups: Array<() => void> = [];

  const defineFor = (
    pluginId: string,
    stored: SavedInstance[],
    definitionOverrides: Record<string, unknown> = {},
  ) => {
    backend().replace(() => documentWith(pluginId, stored));
    window.__dmn_current_plugin_id = pluginId;
    createDefineElement({
      pluginId,
      api: {
        settings: { get: vi.fn().mockResolvedValue({ language: 'ko' }) },
        ui: {
          contextMenu: {
            addGridMenuItem: vi.fn(() => 'menu-1'),
            removeMenuItem: vi.fn(),
          },
          displayElement: { update: vi.fn() },
        },
      },
      registerCleanup: (cleanup: () => void) => cleanups.push(cleanup),
      wrapFunctionWithContext: (fn: (...args: unknown[]) => unknown) => fn,
    } as never)({
      name: 'Example',
      template: () => '',
      ...definitionOverrides,
    });
  };

  const defElements = (pluginId: string) =>
    usePluginDisplayElementStore
      .getState()
      .elements.filter((element) => element.definitionId === pluginId);

  const findElement = (fullId: string) =>
    usePluginDisplayElementStore
      .getState()
      .elements.find((element) => element.fullId === fullId);

  // 되돌리기·다른 창 쓰기처럼 이 창 밖에서 트리가 바뀐다
  const reapply = (pluginId: string, instances: SavedInstance[]) =>
    backend().replace(() => documentWith(pluginId, instances));

  beforeEach(async () => {
    window.__dmn_window_type = 'main';
    await loadElementDocumentStore();
    backend().commit.mockClear();
    useKeyStore.setState({
      isBootstrapped: true,
      customTabs: [],
      selectedKeyType: '4key',
    });
    useDocumentSelectionStore.setState({ selectedElements: [] });
    usePluginDisplayElementStore.setState({
      elements: [],
      definitions: new Map(),
    });
  });

  afterEach(async () => {
    getElementDocumentStore()?.flushCoalesced?.();
    await drainEditorWrites();
    while (cleanups.length > 0) cleanups.pop()?.();
    displayElementInstanceRegistry.clearAll();
    usePluginDisplayElementStore.setState({
      elements: [],
      definitions: new Map(),
    });
    useDocumentSelectionStore.setState({ selectedElements: [] });
    useKeyStore.setState({ isBootstrapped: false });
    delete window.__dmn_current_plugin_id;
  });

  it('트리의 플러그인 노드를 인스턴스로 복원한다 - 위치·설정·측정 크기·숨김·그룹·겹침값', async () => {
    const pluginId = 'plugin-restore';
    defineFor(pluginId, [
      saved(ID_A, {
        position: { x: 10, y: 20 },
        settings: { volume: 2 },
        measuredSize: { width: 50, height: 60 },
        hidden: true,
        zIndex: 4,
        groupId: 'group-a',
      }),
      saved(ID_B, { tabId: '5key' }),
    ]);
    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(2));
    const a = findElement(`${pluginId}::${ID_A}`)!;
    expect(a.position).toEqual({ x: 10, y: 20 });
    expect(a.settings).toEqual({ volume: 2 });
    expect(a.measuredSize).toEqual({ width: 50, height: 60 });
    expect(a.hidden).toBe(true);
    expect(a.zIndex).toBe(4);
    expect(a.groupId).toBe('group-a');
    const b = findElement(`${pluginId}::${ID_B}`)!;
    expect(b.tabId).toBe('5key');
    // 기본 크기 틀은 측정 전
    expect(b.measuredSize).toBeUndefined();
    // 복원은 다시 쓰지 않는다
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(backend().commit).not.toHaveBeenCalled();
  });

  it('생존 요소는 소유 7필드만 갱신하고 핸들과 렌더러 필드를 보존한다', async () => {
    const pluginId = 'plugin-diff-live';
    defineFor(pluginId, [
      saved(ID_A, { position: { x: 10, y: 20 } }),
      saved(ID_B, { position: { x: 30, y: 40 } }),
    ]);
    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(2));
    const fullIdA = `${pluginId}::${ID_A}`;
    const handleA = getDisplayElementInstance(fullIdA);
    expect(handleA).toBeDefined();

    // 렌더러 소유 필드 변이 (런타임 갱신 시뮬레이션)
    usePluginDisplayElementStore.getState().updateElement(fullIdA, {
      html: '<div>live</div>',
      state: { tick: 7 },
    });
    const before = findElement(fullIdA)!;

    reapply(pluginId, [
      saved(ID_A, {
        position: { x: 99, y: 88 },
        settings: { volume: 2 },
        measuredSize: { width: 50, height: 60 },
        hidden: true,
        zIndex: 4,
        groupId: 'group-a',
      }),
      saved(ID_B, { position: { x: 30, y: 40 } }),
    ]);

    const after = findElement(fullIdA)!;
    expect(after.position).toEqual({ x: 99, y: 88 });
    expect(after.settings).toEqual({ volume: 2 });
    expect(after.measuredSize).toEqual({ width: 50, height: 60 });
    expect(after.tabId).toBe('4key');
    expect(after.hidden).toBe(true);
    expect(after.zIndex).toBe(4);
    expect(after.groupId).toBe('group-a');
    // 렌더러 소유 필드 불변
    expect(after.html).toBe('<div>live</div>');
    expect(after.state).toEqual({ tick: 7 });
    expect(after.onClick).toBe(before.onClick);
    expect(after._onClickId).toBe(before._onClickId);
    // 핸들 미dispose - 같은 인스턴스가 유효하게 동작
    expect(getDisplayElementInstance(fullIdA)).toBe(handleA);
    handleA!.update({ position: { x: 1, y: 2 } });
    expect(findElement(fullIdA)!.position).toEqual({ x: 1, y: 2 });
  });

  it('same-fullId 재적용 후 선택이 유지된다', async () => {
    const pluginId = 'plugin-diff-selection';
    defineFor(pluginId, [saved(ID_A)]);
    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(1));
    const fullIdA = `${pluginId}::${ID_A}`;
    useDocumentSelectionStore
      .getState()
      .setSelectedElements([{ type: 'plugin', id: fullIdA }]);
    const reference = useDocumentSelectionStore.getState().selectedElements;

    reapply(pluginId, [saved(ID_A, { position: { x: 77, y: 66 } })]);

    expect(useDocumentSelectionStore.getState().selectedElements).toBe(
      reference,
    );
    expect(findElement(fullIdA)!.position).toEqual({ x: 77, y: 66 });
  });

  it('재적용 뒤에도 열린 모달이 캡처한 fullId 설정 고치기가 트리까지 닿는다', async () => {
    const pluginId = 'plugin-diff-modal';
    defineFor(pluginId, [saved(ID_A)]);
    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(1));
    const fullIdA = `${pluginId}::${ID_A}`;

    reapply(pluginId, [saved(ID_A, { settings: { volume: 1 } })]);

    // 모달 commitSettingValue와 같은 update 경로
    displayElementApi.update(fullIdA, { settings: { volume: 9 } });
    expect(findElement(fullIdA)!.settings).toEqual({ volume: 9 });
    await vi.waitFor(() => expect(backend().commit).toHaveBeenCalledOnce());
    expect(backend().commit.mock.calls[0][0]).toEqual([
      {
        op: 'setValues',
        scene: '4key',
        id: fullIdA,
        values: { volume: 9 },
      },
    ]);
  });

  it('지우기는 기다리지 않고 바로 보내고, 되돌리기는 같은 fullId로 다시 넣고 새 핸들을 등록한다', async () => {
    const pluginId = 'plugin-diff-revive';
    defineFor(pluginId, [saved(ID_A), saved(ID_B)]);
    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(2));
    const fullIdB = `${pluginId}::${ID_B}`;
    const oldHandle = getDisplayElementInstance(fullIdB)!;

    displayElementApi.remove(fullIdB);
    expect(findElement(fullIdB)).toBeUndefined();
    await vi.waitFor(() => expect(backend().commit).toHaveBeenCalledOnce(), {
      timeout: 100,
    });
    expect(backend().commit.mock.calls[0][0]).toEqual([
      { op: 'remove', scene: '4key', ids: [fullIdB] },
    ]);

    // 되돌리기가 같은 인스턴스를 되살린 트리
    reapply(pluginId, [saved(ID_A), saved(ID_B)]);

    const revived = findElement(fullIdB)!;
    expect(revived.id).toBe(ID_B);
    const newHandle = getDisplayElementInstance(fullIdB)!;
    expect(newHandle).not.toBe(oldHandle);
    // 구핸들은 destroyed 유지 - update가 store에 닿지 않는다
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    oldHandle.update({ position: { x: 5, y: 5 } });
    warn.mockRestore();
    expect(findElement(fullIdB)!.position).toEqual({ x: 0, y: 0 });
    newHandle.update({ position: { x: 6, y: 6 } });
    expect(findElement(fullIdB)!.position).toEqual({ x: 6, y: 6 });
  });

  it('복원 전에 만든 요소는 남기고 복원 뒤 트리에 넣는다', async () => {
    const pluginId = 'plugin-diff-restore-window';
    defineFor(pluginId, [saved(ID_A)]);

    // define 직후, 복원이 끝나기 전의 사용자 추가
    const added = addDisplayElementInternal({
      html: '<!-- plugin-element -->',
      position: { x: 5, y: 5 },
      draggable: true,
      definitionId: pluginId,
    } as never);
    const addedFullId = added.id;
    expect(findElement(addedFullId)).toBeDefined();

    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(2));
    expect(findElement(`${pluginId}::${ID_A}`)).toBeDefined();
    await vi.waitFor(() => expect(backend().commit).toHaveBeenCalledOnce());
    const [insert] = backend().commit.mock.calls[0][0];
    expect(insert).toMatchObject({
      op: 'insert',
      scene: '4key',
      node: { id: addedFullId, frame: { x: 5, y: 5 } },
    });
    // 넣은 뒤에도 런타임에 남는다 (트리 보기와 같다)
    expect(findElement(addedFullId)).toBeDefined();
  });

  it('순서와 겹침값이 바뀐 트리는 store를 재배열하고 저장 모양이 같다', async () => {
    const pluginId = 'plugin-diff-order';
    defineFor(pluginId, [saved(ID_A), saved(ID_B)]);
    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(2));

    const snapshot = [
      saved(ID_B, {
        position: { x: 30, y: 40 },
        settings: { volume: 2 },
        measuredSize: { width: 12, height: 34 },
        zIndex: 9,
      }),
      saved(ID_A, {
        position: { x: 10, y: 20 },
        settings: { volume: 1 },
        measuredSize: { width: 56, height: 78 },
        zIndex: 1,
      }),
    ];
    reapply(pluginId, snapshot);

    expect(defElements(pluginId).map((element) => element.id)).toEqual([
      ID_B,
      ID_A,
    ]);
    expect(
      buildSavedPluginInstances(
        usePluginDisplayElementStore.getState().elements,
        pluginId,
      ),
    ).toEqual(snapshot);
  });

  it('저장된 것을 그대로 비춘다 - 인스턴스 수 제한은 만들기 메뉴의 막기다', async () => {
    const pluginId = 'plugin-cap';
    defineFor(
      pluginId,
      [
        saved(ID_A, { tabId: '4key' }),
        saved(ID_B, { tabId: '5key' }),
        saved(ID_C, { tabId: '4key' }),
      ],
      { maxInstances: 1 },
    );
    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(3));
    expect(defElements(pluginId).map((element) => element.id)).toEqual([
      ID_A,
      ID_B,
      ID_C,
    ]);
  });

  it('트리 → 런타임 반영은 다시 쓰지 않는다', async () => {
    const pluginId = 'plugin-diff-no-echo';
    defineFor(pluginId, [saved(ID_A), saved(ID_B)]);
    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(2));
    reapply(pluginId, [saved(ID_B, { position: { x: 3, y: 3 } })]);
    expect(defElements(pluginId).map((element) => element.id)).toEqual([ID_B]);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(backend().commit).not.toHaveBeenCalled();
  });

  it('스크립트 쓰기는 화면에 바로 보이고 조용해진 뒤 커밋 하나로 보낸다', async () => {
    const pluginId = 'plugin-diff-stream';
    defineFor(pluginId, [saved(ID_A)]);
    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(1));
    const fullIdA = `${pluginId}::${ID_A}`;

    displayElementApi.update(fullIdA, { position: { x: 4, y: 0 } });
    displayElementApi.update(fullIdA, { position: { x: 8, y: 2 } });
    // 트리 보기에도 바로 (런타임과 같다)
    expect(
      getElementDocumentStore()!.getElement('4key', fullIdA)?.frame,
    ).toEqual(expect.objectContaining({ x: 8, y: 2 }));
    expect(backend().commit).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(backend().commit).toHaveBeenCalledOnce());
    expect(backend().commit.mock.calls[0][0]).toEqual([
      { op: 'setFrame', scene: '4key', id: fullIdA, frame: { x: 8, y: 2 } },
    ]);
    expect(findElement(fullIdA)!.position).toEqual({ x: 8, y: 2 });
  });

  it('스크립트가 겹침값을 바꾸면 화면은 제자리에 두고 자리는 백엔드가 정하며, 이어진 쓰기는 그 노드를 고친다', async () => {
    const pluginId = 'plugin-diff-z';
    defineFor(pluginId, [saved(ID_A), saved(ID_B)]);
    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(2));
    const fullIdA = `${pluginId}::${ID_A}`;
    const ids = () =>
      getElementDocumentStore()!
        .getScene('4key')!
        .nodes.map((node) => node.id);
    const before = ids();

    displayElementApi.update(fullIdA, { zIndex: 7 });
    // 맨 위로 튀지 않는다
    expect(ids()).toEqual(before);
    displayElementApi.update(fullIdA, { position: { x: 9, y: 0 } });
    await vi.waitFor(() =>
      expect(backend().commit.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    const sent = backend().commit.mock.calls.flatMap(([ops]) => ops);
    // 다시 넣기는 자리 없이(백엔드 놓기), 이어진 위치 쓰기는 같은 노드의 틀 - 다시 넣기를 또 보내지 않는다
    expect(sent.filter((op) => op.op === 'insert')).toHaveLength(1);
    expect(sent.find((op) => op.op === 'insert')).toMatchObject({
      index: null,
    });
    expect(sent).toContainEqual(
      expect.objectContaining({ op: 'setFrame', id: fullIdA }),
    );
    expect(findElement(fullIdA)!.zIndex).toBe(7);
  });

  it('겹침값을 준 새 인스턴스도 화면에 바로 들어가, 이어진 쓰기는 다시 넣기가 아니라 그 노드를 고친다', async () => {
    const pluginId = 'plugin-diff-z-create';
    defineFor(pluginId, [saved(ID_A)]);
    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(1));
    await drainEditorWrites();
    backend().commit.mockClear();

    const added = addDisplayElementInternal({
      html: '<!-- plugin-element -->',
      position: { x: 5, y: 5 },
      draggable: true,
      definitionId: pluginId,
      zIndex: 4,
    } as never);
    expect(
      getElementDocumentStore()!.getElement('4key', added.id),
    ).toBeDefined();
    displayElementApi.update(added.id, { position: { x: 6, y: 5 } });
    await vi.waitFor(() =>
      expect(backend().commit.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    const sent = backend().commit.mock.calls.flatMap(([ops]) => ops);
    expect(sent.filter((op) => op.op === 'insert')).toHaveLength(1);
    expect(sent).toContainEqual(
      expect.objectContaining({ op: 'setFrame', id: added.id }),
    );
  });

  it('겹침값 다시 넣기가 거절되면 런타임 겹침값도 트리 값으로 돌아간다', async () => {
    const pluginId = 'plugin-diff-z-rejected';
    defineFor(pluginId, [saved(ID_A, { zIndex: 1 }), saved(ID_B)]);
    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(2));
    const fullIdA = `${pluginId}::${ID_A}`;
    backend().commit.mockImplementationOnce(async () => ({
      status: 'rejected',
      revision: 1,
      code: 'VIOLATION',
      violations: [],
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    displayElementApi.update(fullIdA, { zIndex: 7 });
    expect(findElement(fullIdA)!.zIndex).toBe(7);
    await vi.waitFor(() => expect(findElement(fullIdA)!.zIndex).toBe(1));
    warn.mockRestore();
  });

  it('거절된 쓰기는 트리 보기에서 빠지고 런타임도 트리 값으로 돌아간다', async () => {
    const pluginId = 'plugin-diff-rejected';
    defineFor(pluginId, [saved(ID_A, { position: { x: 1, y: 1 } })]);
    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(1));
    const fullIdA = `${pluginId}::${ID_A}`;
    backend().commit.mockImplementationOnce(async () => ({
      status: 'rejected',
      revision: 1,
      code: 'VIOLATION',
      violations: [],
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    displayElementApi.update(fullIdA, { position: { x: 50, y: 50 } });
    expect(findElement(fullIdA)!.position).toEqual({ x: 50, y: 50 });
    await vi.waitFor(() =>
      expect(findElement(fullIdA)!.position).toEqual({ x: 1, y: 1 }),
    );
    warn.mockRestore();
  });

  it('플러그인을 내리는 중 정리가 요소를 비워도(먼저 등록된 clearMyElements) 저장된 인스턴스를 지우지 않는다', async () => {
    const pluginId = 'plugin-teardown';
    defineFor(pluginId, [saved(ID_A), saved(ID_B)]);
    await vi.waitFor(() => expect(defElements(pluginId)).toHaveLength(2));

    runPluginTeardown(pluginId, () => {
      window.__dmn_current_plugin_id = pluginId;
      displayElementApi.clearMyElements();
    });
    expect(defElements(pluginId)).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(backend().commit).not.toHaveBeenCalled();
    expect(
      getElementDocumentStore()!.getElement('4key', `${pluginId}::${ID_A}`),
    ).toBeDefined();
  });
});
