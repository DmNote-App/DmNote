import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';

const mocks = vi.hoisted(() => ({
  nodes: new Set<string>(),
  remove: vi.fn(),
  deletePlugins: vi.fn(),
  restore: vi.fn(async () => {}),
  removeLocally: vi.fn(),
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
vi.mock('@plugins/runtime/displayElement/pluginTreeGeometry', () => ({
  removePluginElementsLocally: (ids: string[]) => {
    mocks.removeLocally(ids);
    return mocks.restore;
  },
}));

const { deleteStructureSelection } = await import('./deleteStructureSelection');

describe('고른 것 지우기', () => {
  beforeEach(() => {
    mocks.nodes = new Set(['t1', 'p::in-tree']);
    mocks.remove.mockReset().mockResolvedValue({ status: 'committed' });
    mocks.deletePlugins.mockClear();
    mocks.restore.mockClear();
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
    const [scene, ids, options] = mocks.remove.mock.calls[0];
    expect(scene).toBe('4key');
    expect(ids).toEqual(['t1', 'p::in-tree']);
    const [plugins, gestureId] = mocks.deletePlugins.mock.calls[0];
    expect(plugins).toEqual(['p::new']);
    expect(options).toEqual({ gestureId });
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('트리 지우기가 거절되면 뺀 플러그인 요소를 저장된 값으로 되돌린다', async () => {
    mocks.remove.mockResolvedValue({ status: 'rejected', code: 'violation' });
    await deleteStructureSelection('4key');
    expect(mocks.restore).toHaveBeenCalledOnce();
  });
});
