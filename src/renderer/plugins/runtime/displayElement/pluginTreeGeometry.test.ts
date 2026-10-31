import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import { ElementEditHeldError } from '@src/renderer/editor/document/elementDocumentStore';
import { isInstanceSaveSuppressed } from './instanceSaveSuppression';

const mocks = vi.hoisted(() => ({
  nodes: new Map<string, { frame: Record<string, number> }>(),
  edit: vi.fn(),
  restore: vi.fn(async (_pluginId: string, _force?: boolean) => {}),
  hideBySave: vi.fn(async () => true),
  flushed: [] as Array<[string, string[]]>,
  settled: Promise.resolve() as Promise<void>,
}));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) => mocks.nodes.get(id),
    edit: mocks.edit,
  }),
}));
vi.mock('./instancesUndoSync', () => ({
  applyCanonicalPluginInstances: mocks.restore,
}));
vi.mock('./pluginElementActions', () => ({
  setPluginElementsHidden: mocks.hideBySave,
}));
vi.mock('./instancesCommitQueue', () => ({
  settledPluginInstancesCommits: () => mocks.settled,
  flushPluginInstancesEditSession: (pluginId: string) =>
    mocks.flushed.push([
      pluginId,
      usePluginDisplayElementStore
        .getState()
        .elements.map((element) => element.fullId),
    ]),
}));

// 트리 스토어처럼 - 영구 실패는 편집을 버리며 onDropped를 부른다
const dropWith =
  (outcome: () => Promise<unknown>) =>
  (_ops: unknown, options?: { onDropped?: () => void }) => {
    options?.onDropped?.();
    return outcome();
  };

const {
  applyPluginElementEdit,
  commitPluginFrames,
  removePluginElementsLocally,
  sendPluginTreeEdit,
  setPluginElementHiddenInTree,
} = await import('./pluginTreeGeometry');

const element = (
  fullId: string,
  position: { x: number; y: number },
  extra: Partial<PluginDisplayElementInternal> = {},
) =>
  ({
    id: fullId.split('::')[1],
    fullId,
    pluginId: fullId.split('::')[0],
    html: '',
    position,
    tabId: '4key',
    ...extra,
  } as PluginDisplayElementInternal);

const frame = (x: number, y: number) => ({
  frame: { x, y, width: 200, height: 150, rotation: 0 },
});

describe('편집기의 플러그인 요소 위치 저장', () => {
  beforeEach(() => {
    mocks.nodes.clear();
    mocks.edit.mockReset().mockResolvedValue({ status: 'committed' });
    mocks.restore.mockClear();
  });

  it('트리에 노드가 있는 요소만 자동 저장 없이 고친다', () => {
    mocks.nodes.set('a::1', frame(0, 0));
    const seen: Array<[string[], boolean]> = [];
    applyPluginElementEdit('4key', new Set(['a::1', 'a::new']), (ids) =>
      seen.push([[...ids], isInstanceSaveSuppressed()]),
    );
    expect(seen).toEqual([
      [['a::new'], false],
      [['a::1'], true],
    ]);
  });

  it('바뀐 위치·측정 크기만 같은 동작 id의 틀 연산으로 보낸다', async () => {
    mocks.nodes.set('a::1', frame(0, 0));
    mocks.nodes.set('a::2', frame(5, 5));
    usePluginDisplayElementStore.setState({
      elements: [
        element(
          'a::1',
          { x: 10, y: 0 },
          {
            measuredSize: { width: 80, height: 150 },
          },
        ),
        element('a::2', { x: 5, y: 5 }),
        element('a::missing', { x: 1, y: 1 }),
      ],
    });
    await commitPluginFrames('4key', ['a::1', 'a::2', 'a::missing'], 'g1');
    expect(mocks.edit).toHaveBeenCalledWith(
      [
        {
          op: 'setFrame',
          scene: '4key',
          id: 'a::1',
          frame: { x: 10, width: 80 },
        },
      ],
      expect.objectContaining({ gestureId: 'g1' }),
    );
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('거절되면 저장된 값을 다시 받아 되돌리고, 보류는 그대로 둔다', async () => {
    mocks.nodes.set('a::1', frame(0, 0));
    usePluginDisplayElementStore.setState({
      elements: [element('a::1', { x: 10, y: 0 })],
    });
    mocks.edit.mockImplementationOnce(
      dropWith(async () => ({ status: 'rejected', code: 'VIOLATION' })),
    );
    await expect(commitPluginFrames('4key', ['a::1'])).rejects.toThrow(
      'VIOLATION',
    );
    expect(mocks.restore).toHaveBeenCalledWith('a', true);

    mocks.restore.mockClear();
    mocks.edit.mockRejectedValueOnce(new ElementEditHeldError());
    await expect(commitPluginFrames('4key', ['a::1'])).resolves.toBeUndefined();
    expect(mocks.restore).not.toHaveBeenCalled();
  });
});

describe('편집기의 플러그인 요소 지우기', () => {
  beforeEach(() => {
    mocks.edit.mockReset();
    mocks.restore.mockClear();
    mocks.flushed.length = 0;
  });

  it('밀린 자동 저장을 지우기 전 목록으로 먼저 보내고, 자동 저장 없이 뺀 뒤 그 플러그인 id를 돌려준다', async () => {
    usePluginDisplayElementStore.setState({
      elements: [
        element('a::1', { x: 0, y: 0 }),
        element('a::2', { x: 1, y: 1 }),
      ],
    });
    let suppressedAtRemoval: boolean | null = null;
    const stop = usePluginDisplayElementStore.subscribe(() => {
      suppressedAtRemoval = isInstanceSaveSuppressed();
    });
    const pluginIds = removePluginElementsLocally(['a::1']);
    stop();
    expect(pluginIds).toEqual(['a']);
    expect(suppressedAtRemoval).toBe(true);
    expect(mocks.flushed).toEqual([['a', ['a::1', 'a::2']]]);
    expect(
      usePluginDisplayElementStore
        .getState()
        .elements.map((candidate) => candidate.fullId),
    ).toEqual(['a::2']);
  });

  it('보류한 지우기는 되돌리지 않고, 트리 스토어가 버린 편집만(보류 뒤 버린 것 포함) 저장된 값으로 되돌린다', async () => {
    const ops = [{ op: 'remove' as const, scene: '4key', ids: ['a::1'] }];
    let dropHeld: (() => void) | undefined;
    mocks.edit.mockImplementationOnce(
      (_ops: unknown, options?: { onDropped?: () => void }) => {
        dropHeld = options?.onDropped;
        return Promise.reject(new ElementEditHeldError());
      },
    );
    await sendPluginTreeEdit(ops, ['a'], 'g');
    expect(mocks.restore).not.toHaveBeenCalled();
    // 다시 보낸 편집이 영구 거절되면 그때 되돌린다
    dropHeld?.();
    expect(mocks.restore).toHaveBeenCalledWith('a', true);
    mocks.restore.mockClear();
    mocks.edit.mockImplementationOnce(
      dropWith(async () => ({ status: 'rejected', code: 'violation' })),
    );
    await expect(sendPluginTreeEdit(ops, ['a'], 'g')).rejects.toThrow();
    mocks.edit.mockImplementationOnce(
      dropWith(() => Promise.reject(new Error('ipc'))),
    );
    await expect(sendPluginTreeEdit(ops, ['a', 'a'])).rejects.toThrow('ipc');
    expect(mocks.restore.mock.calls).toEqual([
      ['a', true],
      ['a', true],
    ]);
    expect(mocks.edit.mock.calls[0][1]).toMatchObject({ gestureId: 'g' });
  });
});

describe('편집기의 플러그인 요소 숨기기', () => {
  beforeEach(() => {
    mocks.nodes.clear();
    mocks.edit.mockReset().mockResolvedValue({ status: 'committed' });
    mocks.hideBySave.mockClear();
    usePluginDisplayElementStore.setState({
      elements: [
        element('a::1', { x: 0, y: 0 }),
        element('a::new', { x: 0, y: 0 }),
      ],
    });
  });

  it('트리에 노드가 있으면 자동 저장 없이 바로 숨기고 공통 정보 연산으로 저장한다', async () => {
    mocks.nodes.set('a::1', frame(0, 0));
    let suppressed: boolean | null = null;
    const stop = usePluginDisplayElementStore.subscribe(() => {
      suppressed = isInstanceSaveSuppressed();
    });
    await setPluginElementHiddenInTree('4key', 'a::1', true);
    stop();
    expect(suppressed).toBe(true);
    expect(usePluginDisplayElementStore.getState().elements[0].hidden).toBe(
      true,
    );
    expect(mocks.edit.mock.calls[0][0]).toEqual([
      { op: 'setCommon', scene: '4key', id: 'a::1', hidden: true },
    ]);
    expect(mocks.hideBySave).not.toHaveBeenCalled();
  });

  it('트리에 노드가 없으면 인스턴스 자동 저장으로 숨긴다', async () => {
    await setPluginElementHiddenInTree('4key', 'a::new', true);
    expect(mocks.hideBySave).toHaveBeenCalledWith([
      { fullId: 'a::new', hidden: true },
    ]);
    expect(mocks.edit).not.toHaveBeenCalled();
  });
});

describe('플러그인 트리 편집 보내기 순서', () => {
  it('화면(트리 스토어)에는 바로 얹고, 보내기는 앞서 줄 선 인스턴스 저장이 끝난 뒤로 넘긴다', async () => {
    let release!: () => void;
    mocks.settled = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.edit.mockReset().mockResolvedValue({ status: 'committed' });
    const ops = [{ op: 'remove' as const, scene: '4key', ids: ['a::1'] }];
    const sent = sendPluginTreeEdit(ops, ['a'], 'g');
    const options = mocks.edit.mock.calls[0][1] as { after: Promise<void> };
    let settled = false;
    void options.after.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await sent;
    expect(settled).toBe(true);
    mocks.settled = Promise.resolve();
  });

  it('트리에 노드가 있는 요소를 고치기 전에 밀린 자동 저장을 먼저 보낸다', () => {
    mocks.nodes.set('a::1', frame(0, 0));
    mocks.flushed.length = 0;
    usePluginDisplayElementStore.setState({
      elements: [element('a::1', { x: 0, y: 0 })],
    });
    applyPluginElementEdit('4key', new Set(['a::1']), () => {
      expect(mocks.flushed).toEqual([['a', ['a::1']]]);
    });
    expect(mocks.flushed).toHaveLength(1);
  });
});
