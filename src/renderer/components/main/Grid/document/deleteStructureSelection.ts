import { deletePluginElements } from '@plugins/runtime/displayElement/pluginElementActions';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { removeDocumentElements } from './documentEditActions';
import { structureTargetIds } from './treeEditedSelection';

/** 고른 것 지우기 - 트리 요소와 트리에 노드가 있는 플러그인 요소는 한 트리 커밋으로(다 고른 그룹은
 * 그룹째, 비게 된 그룹도 함께 - 런타임은 트리를 따라온다), 저장하지 않는 플러그인 요소는 플러그인 스토어에서 */
export const deleteStructureSelection = async (sceneId: string) => {
  const gestureId = crypto.randomUUID();
  const plugins = new Set(
    useDocumentSelectionStore
      .getState()
      .selectedElements.filter(({ type }) => type === 'plugin')
      .map(({ id }) => id),
  );
  const store = getElementDocumentStore();
  const backed = [...plugins].filter((id) => store?.getElement(sceneId, id));
  const rest = [...plugins].filter((id) => !backed.includes(id));
  const treeIds = structureTargetIds(sceneId).filter((id) => !plugins.has(id));
  if (rest.length > 0) deletePluginElements(rest, gestureId);
  const ids = [...treeIds, ...backed];
  if (ids.length > 0) {
    await removeDocumentElements(sceneId, ids, { gestureId });
  }
};
