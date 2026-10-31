import { deletePluginElements } from '@plugins/runtime/displayElement/pluginElementActions';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { removeDocumentElements } from './documentEditActions';
import { structureTargetIds } from './treeEditedSelection';

/** 고른 것 지우기 - 트리 요소는 트리에서, 플러그인 요소는 플러그인 스토어에서(낙관 반영).
 * 같은 동작 id라 되돌리기 한 번 */
export const deleteStructureSelection = async (sceneId: string) => {
  const gestureId = crypto.randomUUID();
  const plugins = new Set(
    useDocumentSelectionStore
      .getState()
      .selectedElements.filter(({ type }) => type === 'plugin')
      .map(({ id }) => id),
  );
  const treeIds = structureTargetIds(sceneId).filter((id) => !plugins.has(id));
  if (plugins.size > 0) deletePluginElements([...plugins], gestureId);
  if (treeIds.length > 0) {
    await removeDocumentElements(sceneId, treeIds, { gestureId });
  }
};
