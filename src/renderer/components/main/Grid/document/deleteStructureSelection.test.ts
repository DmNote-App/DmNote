import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';

const mocks = vi.hoisted(() => ({
  nodes: new Set<string>(),
  remove: vi.fn(),
  send: vi.fn(),
  deletePlugins: vi.fn(),
  removeLocally: vi.fn((ids: string[]) => ids.map((id) => id.split('::')[0])),
}));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) =>
      mocks.nodes.has(id) ? { id } : undefined,
  }),
}));
vi.mock('./documentEditActions', () => ({
  removeDocumentElements: mocks.remove,
  documentRemoveOps: (scene: string, ids: string[]) => [
    { op: 'remove', scene, ids },
  ],
}));
vi.mock('./treeEditedSelection', () => ({
  structureTargetIds: () => [
    ...useDocumentSelectionStore.getState().selectedIds,
    ...useDocumentSelectionStore
      .getState()
      .selectedElements.map(({ id }) => id),
  ],
}));
vi.mock('@plugins/runtime/displayElement/pluginElementActions', () => ({
  deletePluginElements: mocks.deletePlugins,
}));
vi.mock('@plugins/runtime/displayElement/pluginTreeGeometry', () => ({
  removePluginElementsLocally: mocks.removeLocally,
  sendPluginTreeEdit: mocks.send,
}));

const { deleteStructureSelection } = await import('./deleteStructureSelection');

describe('고른 것 지우기', () => {
  beforeEach(() => {
    mocks.nodes = new Set(['t1', 'p::in-tree']);
    mocks.remove.mockReset().mockResolvedValue({ status: 'committed' });
    mocks.send.mockReset().mockResolvedValue(undefined);
    mocks.deletePlugins.mockClear();
    mocks.removeLocally.mockClear();
    useDocumentSelectionStore.getState().replaceSelection(
      '4key',
      ['t1'],
      [
        { type: 'plugin', id: 'p::in-tree' },
        { type: 'plugin', id: 'p::new' },
      ],
    );
  });

  it('트리에 노드가 있는 플러그인 요소는 트리 요소와 한 트리 지우기로, 없는 요소는 플러그인 스토어로 같은 동작 id', async () => {
    await deleteStructureSelection('4key');
    expect(mocks.removeLocally).toHaveBeenCalledWith(['p::in-tree']);
    const [ops, pluginIds, gestureId] = mocks.send.mock.calls[0];
    expect(ops).toEqual([
      { op: 'remove', scene: '4key', ids: ['t1', 'p::in-tree'] },
    ]);
    expect(pluginIds).toEqual(['p']);
    expect(mocks.deletePlugins).toHaveBeenCalledWith(['p::new'], gestureId);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('트리에 노드가 있는 플러그인 요소가 없으면 트리 지우기만 보낸다', async () => {
    mocks.nodes.delete('p::in-tree');
    await deleteStructureSelection('4key');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.remove.mock.calls[0][1]).toEqual(['t1']);
  });

  it('거절된 지우기는 호출자에게 던지지 않는다', async () => {
    mocks.send.mockRejectedValue(new Error('rejected'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(deleteStructureSelection('4key')).resolves.toBeUndefined();
    error.mockRestore();
  });
});
