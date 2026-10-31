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
      { gestureId: 'g1' },
    );
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('거절되면 저장된 값을 다시 받아 되돌리고, 보류는 그대로 둔다', async () => {
    mocks.nodes.set('a::1', frame(0, 0));
    usePluginDisplayElementStore.setState({
      elements: [element('a::1', { x: 10, y: 0 })],
    });
    mocks.edit.mockResolvedValueOnce({ status: 'rejected', code: 'VIOLATION' });
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
  });

  it('자동 저장 없이 빼고 그 플러그인 id를 돌려준다', async () => {
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
    expect(
      usePluginDisplayElementStore
        .getState()
        .elements.map((candidate) => candidate.fullId),
    ).toEqual(['a::2']);
  });

  it('보류한 지우기는 되돌리지 않고, 거절·실패한 지우기만 저장된 값으로 되돌린다', async () => {
    const ops = [{ op: 'remove' as const, scene: '4key', ids: ['a::1'] }];
    mocks.edit.mockRejectedValueOnce(new ElementEditHeldError());
    await sendPluginTreeEdit(ops, ['a'], 'g');
    expect(mocks.restore).not.toHaveBeenCalled();
    mocks.edit.mockResolvedValueOnce({ status: 'rejected', code: 'violation' });
    await expect(sendPluginTreeEdit(ops, ['a'], 'g')).rejects.toThrow();
    mocks.edit.mockRejectedValueOnce(new Error('ipc'));
    await expect(sendPluginTreeEdit(ops, ['a', 'a'])).rejects.toThrow('ipc');
    expect(mocks.restore.mock.calls).toEqual([
      ['a', true],
      ['a', true],
    ]);
    expect(mocks.edit.mock.calls[0][1]).toEqual({ gestureId: 'g' });
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
