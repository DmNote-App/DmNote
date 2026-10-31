import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';

const mocks = vi.hoisted(() => ({
  nodes: new Set<string>(),
  remove: vi.fn(),
  deletePlugins: vi.fn(),
}));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) =>
      mocks.nodes.has(id) ? { id } : undefined,
  }),
}));
vi.mock('./documentEditActions', () => ({
  removeDocumentElements: mocks.remove,
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

const { deleteStructureSelection } = await import('./deleteStructureSelection');

describe('고른 것 지우기', () => {
  beforeEach(() => {
    mocks.nodes = new Set(['t1', 'p::in-tree']);
    mocks.remove.mockReset().mockResolvedValue({ status: 'committed' });
    mocks.deletePlugins.mockClear();
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
    const [scene, ids, options] = mocks.remove.mock.calls[0];
    expect(scene).toBe('4key');
    expect(ids).toEqual(['t1', 'p::in-tree']);
    expect(mocks.deletePlugins).toHaveBeenCalledWith(
      ['p::new'],
      options.gestureId,
    );
  });

  it('트리에 노드가 있는 요소가 없으면 트리 지우기를 보내지 않는다', async () => {
    mocks.nodes = new Set();
    useDocumentSelectionStore
      .getState()
      .replaceSelection('4key', [], [{ type: 'plugin', id: 'p::new' }]);
    await deleteStructureSelection('4key');
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.deletePlugins).toHaveBeenCalledOnce();
  });
});
