import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';

import {
  applyCanonicalPluginInstances,
  applyCommittedPluginInstancesProjection,
  initPluginInstancesUndoSync,
  notePluginTreeEdit,
  registerPluginInstancesReapplier,
  syncOwnTreeEditFields,
} from './instancesUndoSync';
import { isInstanceSaveSuppressed } from './instanceSaveSuppression';
import {
  markPluginElementsEditing,
  resetPluginTreeEditOwnership,
} from './pluginTreeEditOwnership';

const { instancesGetMock, changed } = vi.hoisted(() => ({
  instancesGetMock: vi.fn(),
  changed: {
    listener: null as
      | null
      | ((payload: {
          pluginId: string;
          revision?: number;
          originMutationId?: string;
        }) => void),
  },
}));

vi.mock('@api/modules/plugin/pluginInstancesApi', () => ({
  pluginInstancesApi: {
    get: instancesGetMock,
    onChanged: (listener: typeof changed.listener) => {
      changed.listener = listener;
      return () => undefined;
    },
  },
}));

describe('plugin instances committed projection', () => {
  it('projection 구독이 예약한 trailing save를 적용 직후 취소한다', () => {
    const order: string[] = [];
    const cancelPendingSave = vi.fn(() => order.push('cancel'));
    const unregister = registerPluginInstancesReapplier(
      'plugin-projection',
      'definition-a',
      {
        cancelPendingSave,
        reapply: vi.fn(),
      },
    );

    applyCommittedPluginInstancesProjection('plugin-projection', () => {
      order.push('apply');
    });

    expect(order).toEqual(['apply', 'cancel']);
    expect(cancelPendingSave).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('해제된 definition의 저장 취소 핸들러는 호출하지 않는다', () => {
    const cancelPendingSave = vi.fn();
    const unregister = registerPluginInstancesReapplier(
      'plugin-unloaded',
      'definition-a',
      {
        cancelPendingSave,
        reapply: vi.fn(),
      },
    );
    unregister();

    applyCommittedPluginInstancesProjection('plugin-unloaded', vi.fn());

    expect(cancelPendingSave).not.toHaveBeenCalled();
  });
});

describe('canonical 재주입 후 선택 정리', () => {
  const pluginElement = (pluginId: string, suffix: string) => ({
    id: suffix,
    fullId: `${pluginId}:${suffix}`,
    pluginId,
    html: '<div />',
    position: { x: 0, y: 0 },
  });

  beforeEach(() => {
    instancesGetMock.mockReset();
    useDocumentSelectionStore.setState({ selectedElements: [] });
    usePluginDisplayElementStore.setState({ elements: [] });
  });

  it('canonical 재주입 후 옛 plugin 선택을 정리한다', async () => {
    const pluginId = 'plugin-prune-a';
    usePluginDisplayElementStore.setState({
      elements: [pluginElement(pluginId, 'old')],
    });
    useDocumentSelectionStore.getState().setSelectedElements([
      { type: 'plugin', id: `${pluginId}:old` },
      { type: 'key', id: '11111111-1111-4111-8111-111111111111', index: 0 },
    ]);
    const unregister = registerPluginInstancesReapplier(pluginId, 'def-a', {
      cancelPendingSave: vi.fn(),
      // diff 적용은 생존 fullId를 보존한다 - 스냅샷에 없는 옛 요소만 소멸하고
      // 신규가 추가된 상황 (소멸 fullId를 쥔 선택이 prune 대상)
      reapply: () => {
        usePluginDisplayElementStore.setState({
          elements: [pluginElement(pluginId, 'new')],
        });
      },
    });
    instancesGetMock.mockResolvedValue({ modelRevision: 5, instances: [] });

    await applyCanonicalPluginInstances(pluginId);

    expect(useDocumentSelectionStore.getState().selectedElements).toEqual([]);
    // 키 선택은 트리 선택이 맡고 플러그인 정리에 휩쓸리지 않는다
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ]);
    unregister();
  });

  it('다른 플러그인의 pull은 리로드 공백 중인 플러그인 선택을 지우지 않는다', async () => {
    const pulled = 'plugin-prune-pulled';
    const idle = 'plugin-prune-idle';
    // idle 플러그인은 리로드 공백 - reapplier는 등록됐지만 인스턴스 복원이
    // setTimeout+비동기 IPC라 요소가 아직 스토어에 없다
    usePluginDisplayElementStore.setState({
      elements: [pluginElement(pulled, 'own')],
    });
    useDocumentSelectionStore.getState().setSelectedElements([
      { type: 'plugin', id: `${idle}:alive` },
      { type: 'plugin', id: `${pulled}:own` },
    ]);
    const unregister = registerPluginInstancesReapplier(pulled, 'def-p', {
      cancelPendingSave: vi.fn(),
      reapply: () => {
        usePluginDisplayElementStore.setState({
          elements: [pluginElement(pulled, 'own')],
        });
      },
    });
    instancesGetMock.mockResolvedValue({ modelRevision: 9, instances: [] });

    await applyCanonicalPluginInstances(pulled);

    expect(useDocumentSelectionStore.getState().selectedElements).toEqual([
      { type: 'plugin', id: `${idle}:alive` },
      { type: 'plugin', id: `${pulled}:own` },
    ]);
    unregister();
  });

  it('생존 fullId를 보존한 diff 재적용은 선택을 유지한다', async () => {
    const pluginId = 'plugin-prune-kept';
    usePluginDisplayElementStore.setState({
      elements: [pluginElement(pluginId, 'kept')],
    });
    useDocumentSelectionStore
      .getState()
      .setSelectedElements([{ type: 'plugin', id: `${pluginId}:kept` }]);
    const reference = useDocumentSelectionStore.getState().selectedElements;
    const unregister = registerPluginInstancesReapplier(pluginId, 'def-kept', {
      cancelPendingSave: vi.fn(),
      // diff 적용: 같은 fullId가 생존하고 소유 필드만 갱신된 상황
      reapply: () => {
        usePluginDisplayElementStore.setState({
          elements: [
            { ...pluginElement(pluginId, 'kept'), position: { x: 9, y: 9 } },
          ],
        });
      },
    });
    instancesGetMock.mockResolvedValue({ modelRevision: 5, instances: [] });

    await applyCanonicalPluginInstances(pluginId);

    // prune no-op - 생존 fullId를 쥔 선택이 그대로 유지된다
    expect(useDocumentSelectionStore.getState().selectedElements).toBe(
      reference,
    );
    unregister();
  });

  it('reapplier 미등록이면 선택을 건드리지 않는다', async () => {
    const pluginId = 'plugin-prune-b';
    useDocumentSelectionStore
      .getState()
      .setSelectedElements([{ type: 'plugin', id: `${pluginId}:dead` }]);
    const reference = useDocumentSelectionStore.getState().selectedElements;
    instancesGetMock.mockResolvedValue({ modelRevision: 1, instances: [] });

    await applyCanonicalPluginInstances(pluginId);

    expect(useDocumentSelectionStore.getState().selectedElements).toBe(
      reference,
    );
  });

  it('낡은 revision pull은 선택을 건드리지 않는다', async () => {
    const pluginId = 'plugin-prune-c';
    usePluginDisplayElementStore.setState({
      elements: [pluginElement(pluginId, 'kept')],
    });
    useDocumentSelectionStore
      .getState()
      .setSelectedElements([{ type: 'plugin', id: `${pluginId}:kept` }]);
    const unregister = registerPluginInstancesReapplier(pluginId, 'def-c', {
      cancelPendingSave: vi.fn(),
      reapply: vi.fn(),
    });
    instancesGetMock.mockResolvedValue({ modelRevision: 5, instances: [] });
    await applyCanonicalPluginInstances(pluginId);

    // 늦게 도착한 낡은 pull - 단조 게이트가 reapply와 prune 모두 스킵
    usePluginDisplayElementStore.setState({ elements: [] });
    const reference = useDocumentSelectionStore.getState().selectedElements;
    instancesGetMock.mockResolvedValue({ modelRevision: 4, instances: [] });

    await applyCanonicalPluginInstances(pluginId);

    expect(useDocumentSelectionStore.getState().selectedElements).toBe(
      reference,
    );
    unregister();
  });
});

describe('자기 트리 편집 뒤 저장된 값 맞추기', () => {
  const pluginId = 'tree-sync';
  const element = (id: string, extra: Record<string, unknown> = {}) =>
    ({
      id,
      fullId: `${pluginId}::${id}`,
      pluginId,
      definitionId: 'def',
      html: '',
      position: { x: 0, y: 0 },
      tabId: '4key',
      ...extra,
    } as never);

  beforeEach(() => {
    resetPluginTreeEditOwnership();
    instancesGetMock.mockReset();
  });

  it('겹침·그룹 값은 늘, 틀·숨김은 그 편집이 고친 요소 중 고치는 중이 아닌 것만 자동 저장 없이 맞춘다', async () => {
    usePluginDisplayElementStore.setState({
      elements: [
        element('a'),
        element('b', { position: { x: 5, y: 5 } }),
        element('c', { position: { x: 2, y: 2 } }),
      ],
    });
    markPluginElementsEditing([`${pluginId}::b`]);
    instancesGetMock.mockResolvedValue({
      modelRevision: 10,
      instances: [
        { instanceId: 'a', position: { x: 9, y: 9 }, zIndex: 3, hidden: true },
        { instanceId: 'b', position: { x: 1, y: 1 }, zIndex: 4, groupId: 'g' },
        { instanceId: 'c', position: { x: 8, y: 8 }, zIndex: 5 },
      ],
    });
    const suppressed: boolean[] = [];
    const stop = usePluginDisplayElementStore.subscribe(() =>
      suppressed.push(isInstanceSaveSuppressed()),
    );
    syncOwnTreeEditFields(
      pluginId,
      new Set([`${pluginId}::a`, `${pluginId}::b`]),
    );
    await vi.waitFor(() => expect(suppressed.length).toBeGreaterThan(0));
    stop();
    const [a, b, c] = usePluginDisplayElementStore.getState().elements;
    // c는 이 편집의 대상이 아니다 - 아직 저장하지 않은 스크립트 변경일 수 있어 틀은 두고 겹침만
    expect(c).toMatchObject({ position: { x: 2, y: 2 }, zIndex: 5 });
    expect(a).toMatchObject({
      position: { x: 9, y: 9 },
      zIndex: 3,
      hidden: true,
    });
    expect(b).toMatchObject({
      position: { x: 5, y: 5 },
      zIndex: 4,
      groupId: 'g',
    });
    expect(suppressed.every(Boolean)).toBe(true);
  });

  it('자기 트리 편집 알림은 밀린 저장을 취소하지 않고 저장된 값만 맞춘다', async () => {
    const cancelPendingSave = vi.fn();
    const reapply = vi.fn();
    const unregister = registerPluginInstancesReapplier(pluginId, 'def', {
      cancelPendingSave,
      reapply,
    });
    const stop = initPluginInstancesUndoSync();
    usePluginDisplayElementStore.setState({ elements: [element('a')] });
    instancesGetMock.mockResolvedValue({
      modelRevision: 20,
      instances: [{ instanceId: 'a', position: { x: 0, y: 0 }, zIndex: 7 }],
    });
    notePluginTreeEdit('gesture-1');
    changed.listener!({
      pluginId,
      revision: 20,
      originMutationId: 'gesture-1',
    });
    await vi.waitFor(() =>
      expect(usePluginDisplayElementStore.getState().elements[0].zIndex).toBe(
        7,
      ),
    );
    expect(cancelPendingSave).not.toHaveBeenCalled();
    expect(reapply).not.toHaveBeenCalled();
    stop();
    unregister();
  });

  it('이미 더 새 리비전을 받았으면 늦게 온 조회는 버린다', async () => {
    const unregister = registerPluginInstancesReapplier(pluginId, 'def', {
      cancelPendingSave: vi.fn(),
      reapply: vi.fn(),
    });
    usePluginDisplayElementStore.setState({ elements: [element('a')] });
    instancesGetMock.mockResolvedValueOnce({
      modelRevision: 100,
      instances: [],
    });
    await applyCanonicalPluginInstances(pluginId);
    instancesGetMock.mockResolvedValueOnce({
      modelRevision: 99,
      instances: [{ instanceId: 'a', position: { x: 0, y: 0 }, zIndex: 9 }],
    });
    syncOwnTreeEditFields(pluginId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(usePluginDisplayElementStore.getState().elements[0].zIndex).toBe(
      undefined,
    );
    unregister();
  });
});
