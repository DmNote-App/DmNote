import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import { ElementEditHeldError } from '@src/renderer/editor/document/elementDocumentStore';
import { isInstanceSaveSuppressed } from './instanceSaveSuppression';

const mocks = vi.hoisted(() => ({
  nodes: new Map<string, { frame: Record<string, number> }>(),
  edit: vi.fn(),
  restore: vi.fn(async (_pluginId: string, _force?: boolean) => {}),
  flushed: [] as Array<[string, string[]]>,
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
vi.mock('./instancesCommitQueue', () => ({
  flushPluginInstancesEditSession: (pluginId: string) =>
    mocks.flushed.push([
      pluginId,
      usePluginDisplayElementStore
        .getState()
        .elements.map((element) => element.fullId),
    ]),
}));

const {
  applyPluginElementEdit,
  commitPluginFrames,
  removePluginElementsLocally,
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
    mocks.restore.mockClear();
    mocks.flushed.length = 0;
  });

  it('밀린 자동 저장을 지우기 전 목록으로 보낸 뒤 자동 저장 없이 빼고, 되돌리기는 저장된 값을 다시 받는다', async () => {
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
    const restore = removePluginElementsLocally(['a::1']);
    stop();
    expect(mocks.flushed).toEqual([['a', ['a::1', 'a::2']]]);
    expect(suppressedAtRemoval).toBe(true);
    expect(
      usePluginDisplayElementStore
        .getState()
        .elements.map((candidate) => candidate.fullId),
    ).toEqual(['a::2']);
    await restore();
    expect(mocks.restore).toHaveBeenCalledWith('a', true);
  });
});
