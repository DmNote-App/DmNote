import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useKeyStore } from '@stores/data/useKeyStore';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import {
  previewOverlay,
  previewPatchOf,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import { previewApi } from '@api/modules/editor/previewApi';

import type { PreviewEnvelope } from '@src/types/preview';

const KEY_ID_A = '00000000-0000-4000-8000-000000000101';
const KEY_ID_B = '00000000-0000-4000-8000-000000000102';
const STAT_ID_A = '00000000-0000-4000-8000-000000000201';
const GRAPH_ID_A = '00000000-0000-4000-8000-000000000301';
const KNOB_ID_A = '00000000-0000-4000-8000-000000000401';

// 트리 문서 - 미리보기 확정은 트리 커밋 하나로 간다
const tree = vi.hoisted(() => ({
  elements: new Map<string, unknown>(),
  edit: vi.fn(),
}));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) => tree.elements.get(id),
    getSceneIds: () => ['4key'],
    getRevision: () => 1,
    subscribe: () => () => {},
    edit: tree.edit,
  }),
}));

vi.mock('@api/modules/editor/previewApi', () => ({
  previewApi: {
    subscribe: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
  },
}));

const treeElement = (id: string, kind: string, x: number) => ({
  type: 'element',
  id,
  kind,
  frame: { x, y: 0, width: 60, height: 60, rotation: 0 },
  legacy: {},
});

const resetTree = () => {
  tree.elements = new Map([
    [KEY_ID_A, treeElement(KEY_ID_A, 'key', 0)],
    [KEY_ID_B, treeElement(KEY_ID_B, 'key', 70)],
    [STAT_ID_A, treeElement(STAT_ID_A, 'stat', 0)],
    [GRAPH_ID_A, treeElement(GRAPH_ID_A, 'graph', 0)],
    [KNOB_ID_A, treeElement(KNOB_ID_A, 'knob', 0)],
  ]);
  tree.edit.mockReset();
  tree.edit.mockResolvedValue({ status: 'committed', revision: 1 });
};

const resetPositionStores = () => {
  useKeyStore.setState({ selectedKeyType: '4key' });
  resetTree();
};

const remoteEnvelope = (
  overrides: Partial<PreviewEnvelope>,
): PreviewEnvelope => ({
  schemaVersion: 2,
  sessionId: 'remote-session',
  seq: 1,
  kind: 'patch',
  sourceLabel: 'panel',
  domain: 'keyPosition',
  mode: '4key',
  targets: [KEY_ID_A],
  patch: { backgroundColor: '#ff0000' },
  ...overrides,
});

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('previewOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewOverlay.clearAll();
    resetPositionStores();
  });

  afterEach(() => {
    editGestureController.cancel();
    previewOverlay.clearAll();
  });

  it('로컬 patch는 rendered에만 합성되고 canonical은 불변', () => {
    previewOverlay.applyLocalPatchByIds('s1', '4key', [KEY_ID_A], {
      backgroundColor: '#123456',
    });

    expect(previewPatchOf('keyPosition', '4key', KEY_ID_A)).toEqual({
      backgroundColor: '#123456',
    });
    expect(previewPatchOf('keyPosition', '4key', KEY_ID_B)).toBeNull();
  });

  it('세션 종료 시 오버레이만 제거되고 rendered가 canonical로 복귀', () => {
    previewOverlay.applyLocalPatchByIds('s1', '4key', [KEY_ID_A], {
      width: 120,
    });
    previewOverlay.endSession('s1');

    expect(previewPatchOf('keyPosition', '4key', KEY_ID_A)).toBeNull();
  });

  it('원격 envelope는 세션 내 stale seq를 폐기', () => {
    previewOverlay.applyRemoteEnvelope(remoteEnvelope({ seq: 2 }));
    previewOverlay.applyRemoteEnvelope(
      remoteEnvelope({ seq: 1, patch: { backgroundColor: '#00ff00' } }),
    );

    expect(
      previewPatchOf('keyPosition', '4key', KEY_ID_A)?.backgroundColor,
    ).toBe('#ff0000');
  });

  it('종료된 세션의 늦은 patch는 tombstone으로 차단', () => {
    previewOverlay.applyRemoteEnvelope(remoteEnvelope({ seq: 1 }));
    previewOverlay.endSession('remote-session');
    previewOverlay.applyRemoteEnvelope(remoteEnvelope({ seq: 2 }));

    expect(previewPatchOf('keyPosition', '4key', KEY_ID_A)).toBeNull();
  });

  it('cancel envelope는 세션 오버레이를 제거', () => {
    previewOverlay.applyRemoteEnvelope(remoteEnvelope({ seq: 1 }));
    previewOverlay.applyRemoteEnvelope(
      remoteEnvelope({ seq: 2, kind: 'cancel', targets: [], patch: {} }),
    );

    expect(previewPatchOf('keyPosition', '4key', KEY_ID_A)).toBeNull();
  });

  it('병합 커밋은 두 창의 세션을 함께 끝내고 늦은 patch를 차단', () => {
    previewOverlay.applyLocalPatchByIds('main-session', '4key', [KEY_ID_A], {
      width: 90,
    });
    previewOverlay.applyRemoteEnvelope(
      remoteEnvelope({
        sessionId: 'panel-session',
        targets: [KEY_ID_B],
        patch: { width: 95 },
      }),
    );

    previewOverlay.endSessions(['main-session', 'panel-session']);

    expect(previewPatchOf('keyPosition', '4key', KEY_ID_A)).toBeNull();
    expect(previewPatchOf('keyPosition', '4key', KEY_ID_B)).toBeNull();

    previewOverlay.applyLocalPatchByIds('main-session', '4key', [KEY_ID_A], {
      width: 100,
    });
    previewOverlay.applyRemoteEnvelope(
      remoteEnvelope({
        sessionId: 'panel-session',
        seq: 2,
        targets: [KEY_ID_B],
        patch: { width: 105 },
      }),
    );
    expect(previewPatchOf('keyPosition', '4key', KEY_ID_A)).toBeNull();
    expect(previewPatchOf('keyPosition', '4key', KEY_ID_B)).toBeNull();
  });

  it('프리뷰 활성 중 canonical 편집이 들어와도 오버레이가 재합성됨', () => {
    previewOverlay.applyLocalPatchByIds('s1', '4key', [KEY_ID_A], {
      backgroundColor: '#123456',
    });

    tree.elements.set(KEY_ID_B, {
      ...treeElement(KEY_ID_B, 'key', 70),
      frame: { x: 70, y: 0, width: 200, height: 60, rotation: 0 },
    });

    // 지금 값이 바뀌어도 미리보기는 그 요소에 그대로 남는다
    expect(previewPatchOf('keyPosition', '4key', KEY_ID_A)).toEqual({
      backgroundColor: '#123456',
    });
  });

  it('stat patch는 canonical을 바꾸지 않고 도메인 렌더 결과에만 합성', () => {
    previewOverlay.applyLocalPatchByIds(
      'stat-session',
      '4key',
      [STAT_ID_A],
      { width: 120 },
      'statPosition',
    );

    expect(previewPatchOf('statPosition', '4key', STAT_ID_A)).toEqual({
      width: 120,
    });
    expect(previewPatchOf('keyPosition', '4key', STAT_ID_A)).toBeNull();

    previewOverlay.endSession('stat-session');
    expect(previewPatchOf('statPosition', '4key', STAT_ID_A)).toBeNull();
  });

  it('같은 세션과 대상의 서로 다른 도메인 patch를 독립 보관', () => {
    previewOverlay.applyLocalPatchByIds('mixed-session', '4key', [KEY_ID_A], {
      width: 90,
    });
    previewOverlay.applyLocalPatchByIds(
      'mixed-session',
      '4key',
      [STAT_ID_A],
      { width: 130 },
      'statPosition',
    );

    expect(previewPatchOf('keyPosition', '4key', KEY_ID_A)?.width).toBe(90);
    expect(previewPatchOf('statPosition', '4key', STAT_ID_A)?.width).toBe(130);
  });
});

describe('editGestureController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editGestureController.cancel();
    previewOverlay.clearAll();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    resetPositionStores();
    resetTree();
  });

  afterEach(() => {
    editGestureController.cancel();
    previewOverlay.clearAll();
    vi.unstubAllGlobals();
  });

  it('commitPending은 네 도메인 누적 patch를 동작 id 하나의 트리 커밋으로 승격', async () => {
    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { width: 90 } },
    ]);
    editGestureController.preview(
      '4key',
      [{ id: STAT_ID_A, patch: { width: 100 } }],
      { domain: 'statPosition' },
    );
    editGestureController.preview(
      '4key',
      [{ id: GRAPH_ID_A, patch: { width: 110 } }],
      { domain: 'graphPosition' },
    );
    editGestureController.preview(
      '4key',
      [{ id: KNOB_ID_A, patch: { width: 120 } }],
      { domain: 'knobPosition' },
    );
    const sessionId = editGestureController.activeGestureId();

    await expect(editGestureController.commitPendingAsync()).resolves.toBe(
      true,
    );

    expect(tree.edit).toHaveBeenCalledOnce();
    const [ops, options] = tree.edit.mock.calls[0];
    expect(options).toEqual({ gestureId: sessionId });
    expect(
      (ops as Array<{ op: string; id: string; frame?: { width?: number } }>)
        .filter(({ op }) => op === 'setFrame')
        .map(({ id, frame }) => [id, frame?.width]),
    ).toEqual([
      [KEY_ID_A, 90],
      [STAT_ID_A, 100],
      [GRAPH_ID_A, 110],
      [KNOB_ID_A, 120],
    ]);
    expect(editGestureController.hasActiveGesture()).toBe(false);
  });

  it('정산 전에 대상이 트리에서 사라지면 커밋하지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { width: 90 } },
    ]);
    tree.elements.delete(KEY_ID_A);
    await editGestureController.commitPendingAsync();
    expect(tree.edit).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('첫 preview에서 게스처 시작', () => {
    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { backgroundColor: '#abcdef' } },
    ]);

    expect(editGestureController.hasActiveGesture()).toBe(true);
    expect(
      previewPatchOf('keyPosition', '4key', KEY_ID_A)?.backgroundColor,
    ).toBe('#abcdef');
  });

  it('새 게스처는 남은 로컬 프리뷰를 교체하고 브로커에도 종료를 알린다', () => {
    const staleSessionId = '11111111-1111-4111-8111-111111111111';
    previewOverlay.applyLocalPatchByIds(staleSessionId, '4key', [KEY_ID_A], {
      backgroundColor: '#111111',
    });

    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { backgroundColor: '#abcdef' } },
    ]);

    expect(previewApi.cancel).toHaveBeenCalledWith(staleSessionId);
    expect(
      previewPatchOf('keyPosition', '4key', KEY_ID_A)?.backgroundColor,
    ).toBe('#abcdef');
  });

  it('활성 게스처가 없어도 cancel은 남은 로컬 프리뷰를 회수한다', () => {
    const staleSessionId = '11111111-1111-4111-8111-111111111111';
    previewOverlay.applyLocalPatchByIds(staleSessionId, '4key', [KEY_ID_A], {
      backgroundColor: '#111111',
    });

    editGestureController.cancel();

    expect(previewApi.cancel).toHaveBeenCalledWith(staleSessionId);
    expect(previewPatchOf('keyPosition', '4key', KEY_ID_A)).toBeNull();
  });

  it('preview는 coalescing 후 채널로 발행됨', async () => {
    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { backgroundColor: '#111111' } },
    ]);
    await flushPromises();

    expect(previewApi.publish).toHaveBeenCalledTimes(1);
    const request = vi.mocked(previewApi.publish).mock.calls[0][0];
    expect(request.mode).toBe('4key');
    expect(request.domain).toBe('keyPosition');
    expect(request.targets).toEqual([KEY_ID_A]);
    expect(request.patch).toEqual({ backgroundColor: '#111111' });
  });

  it('발행 대기 중 쌓인 중간값은 대상별 최신 값 하나로 합쳐 발행됨', async () => {
    let release: () => void = () => undefined;
    vi.mocked(previewApi.publish).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { width: 1 } },
    ]);
    await flushPromises();
    expect(previewApi.publish).toHaveBeenCalledTimes(1);

    // in-flight 하나가 도는 동안 값이 계속 바뀐다 (드래그, 방향키 꾹 누르기)
    for (const width of [2, 3, 4, 5]) {
      editGestureController.preview('4key', [
        { id: KEY_ID_A, patch: { width } },
      ]);
      await flushPromises();
    }
    expect(previewApi.publish).toHaveBeenCalledTimes(1);

    release();
    await flushPromises();
    await flushPromises();

    // 중간값 2, 3, 4는 이미 무의미하므로 IPC를 타지 않는다
    expect(previewApi.publish).toHaveBeenCalledTimes(2);
    expect(vi.mocked(previewApi.publish).mock.calls[1][0].patch).toEqual({
      width: 5,
    });
  });

  it('아직 발행하지 않은 다른 그룹은 대기 중 최신값으로 교체됨', async () => {
    let release: () => void = () => undefined;
    vi.mocked(previewApi.publish).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { width: 10 } },
      { id: KEY_ID_B, patch: { width: 20 } },
    ]);
    await flushPromises();
    expect(previewApi.publish).toHaveBeenCalledTimes(1);

    editGestureController.preview('4key', [
      { id: KEY_ID_B, patch: { width: 30 } },
    ]);
    await flushPromises();

    release();
    await flushPromises();
    await flushPromises();

    const targetOneCalls = vi
      .mocked(previewApi.publish)
      .mock.calls.map(([request]) => request)
      .filter((request) => request.targets.includes(KEY_ID_B));
    expect(targetOneCalls).toHaveLength(1);
    expect(targetOneCalls[0].patch).toEqual({ width: 30 });
  });

  it('같은 patch를 쓰는 여러 대상은 한 번에 발행됨', async () => {
    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { width: 42 } },
      { id: KEY_ID_B, patch: { width: 42 } },
    ]);
    await flushPromises();

    expect(previewApi.publish).toHaveBeenCalledTimes(1);
    const request = vi.mocked(previewApi.publish).mock.calls[0][0];
    expect(request.targets).toEqual([KEY_ID_A, KEY_ID_B]);
    expect(request.patch).toEqual({ width: 42 });
  });

  it('settleCommit 성공 시 로컬 세션 종료 + 보조 cancel 브로드캐스트', async () => {
    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { width: 100 } },
    ]);
    const sessionId = editGestureController.activeGestureId();

    editGestureController.settleCommit(Promise.resolve());
    await flushPromises();

    expect(editGestureController.hasActiveGesture()).toBe(false);
    // 배치 간격 커밋처럼 committed echo가 다른 gestureId로 향하면
    // 원격 창 세션이 잔존하므로 성공 경로에도 보조 cancel이 나가야 함
    expect(previewApi.cancel).toHaveBeenCalledTimes(1);
    expect(previewApi.cancel).toHaveBeenCalledWith(sessionId);
    expect(previewPatchOf('keyPosition', '4key', KEY_ID_A)).toBeNull();
  });

  it('settleCommit 실패 시 세션 유지', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { width: 100 } },
    ]);

    editGestureController.settleCommit(Promise.reject(new Error('io')));
    await flushPromises();

    expect(editGestureController.hasActiveGesture()).toBe(true);
    expect(previewPatchOf('keyPosition', '4key', KEY_ID_A)?.width).toBe(100);
  });

  it('새 조작이 교체한 정산 대기 세션은 늦게 실패해도 되살아나지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let rejectFirst!: (reason: Error) => void;
    const firstCommit = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject;
    });

    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { width: 100 } },
    ]);
    editGestureController.settleCommit(firstCommit);

    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { width: 120 } },
    ]);
    editGestureController.cancel();
    rejectFirst(new Error('late io'));
    await flushPromises();

    expect(editGestureController.hasActiveGesture()).toBe(false);
    expect(previewPatchOf('keyPosition', '4key', KEY_ID_A)).toBeNull();
  });

  it('settleCommit 실패 뒤 편집 대상이 갈렸으면 세션을 되살리지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useGridSelectionStore.setState({
      selectedElements: [{ type: 'key', id: 'key-0', index: 0 }],
    });
    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { width: 100 } },
    ]);

    editGestureController.settleCommit(Promise.reject(new Error('io')));
    // 정산이 끝나기 전에 선택이 다른 요소로 넘어간다 (분리 패널 selection sync)
    useGridSelectionStore.setState({
      selectedElements: [{ type: 'key', id: 'key-1', index: 1 }],
    });
    await flushPromises();

    // 되살리면 이미 떠난 대상의 patch가 다음 커밋 경계에 실린다
    expect(editGestureController.hasActiveGesture()).toBe(false);
  });

  it('cancel은 canonical을 건드리지 않고 오버레이만 제거', () => {
    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { width: 150 } },
    ]);
    editGestureController.cancel();

    expect(previewPatchOf('keyPosition', '4key', KEY_ID_A)).toBeNull();
    expect(editGestureController.hasActiveGesture()).toBe(false);
  });

  it('stat 프리뷰 Escape 취소는 canonical 값으로 원복', () => {
    editGestureController.preview(
      '4key',
      [{ id: STAT_ID_A, patch: { width: 150 } }],
      { domain: 'statPosition' },
    );

    expect(previewPatchOf('statPosition', '4key', STAT_ID_A)?.width).toBe(150);

    editGestureController.cancel();

    expect(previewPatchOf('statPosition', '4key', STAT_ID_A)).toBeNull();
  });

  it('서로 다른 도메인의 같은 patch를 별도 채널 메시지로 발행', async () => {
    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { width: 90 } },
    ]);
    editGestureController.preview(
      '4key',
      [{ id: STAT_ID_A, patch: { width: 90 } }],
      { domain: 'statPosition' },
    );

    await flushPromises();

    expect(vi.mocked(previewApi.publish)).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(previewApi.publish)
        .mock.calls.map(([request]) => request.domain),
    ).toEqual(['keyPosition', 'statPosition']);
  });

  it('비 native 전용 preview는 게스처 세션을 만들지 않는다', async () => {
    editGestureController.preview('4key', [
      { id: 'legacy-key', patch: { fontColor: '#poison' } },
    ]);
    await flushPromises();

    expect(editGestureController.hasActiveGesture()).toBe(false);
    expect(editGestureController.activeGestureId()).toBeNull();
    expect(previewApi.publish).not.toHaveBeenCalled();
  });

  it('활성 세션 중 비 native 전용 preview는 세션을 죽이지 않는다', () => {
    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { fontColor: '#aa0000' } },
    ]);
    const sessionId = editGestureController.activeGestureId();
    expect(sessionId).not.toBeNull();

    editGestureController.preview('4key', [
      { id: 'legacy-key', patch: { fontColor: '#poison' } },
    ]);

    expect(editGestureController.activeGestureId()).toBe(sessionId);
    expect(previewPatchOf('keyPosition', '4key', KEY_ID_A)).toEqual({
      fontColor: '#aa0000',
    });
  });

  it('모드가 바뀌면 이전 게스처를 취소하고 새로 시작', () => {
    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { width: 90 } },
    ]);
    const first = editGestureController.activeGestureId();

    editGestureController.preview('5key', [
      { id: KEY_ID_A, patch: { width: 95 } },
    ]);

    expect(editGestureController.activeGestureId()).not.toBe(first);
    expect(previewApi.cancel).toHaveBeenCalledWith(first);
  });

  it('구분자 포함 id의 서로 다른 선택은 다른 지문으로 barrier를 발화한다', () => {
    useGridSelectionStore.setState({
      selectedElements: [{ type: 'plugin', id: 'a|plugin:b' }],
    });
    editGestureController.preview('4key', [
      { id: KEY_ID_A, patch: { width: 90 } },
    ]);
    expect(editGestureController.hasActiveGesture()).toBe(true);

    // 이어붙이기 지문이면 두 선택 모두 'plugin:a|plugin:b'로 충돌해 미발화
    useGridSelectionStore.setState({
      selectedElements: [
        { type: 'plugin', id: 'a' },
        { type: 'plugin', id: 'b' },
      ],
    });
    expect(editGestureController.hasActiveGesture()).toBe(false);
  });
});
