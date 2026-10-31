import { deletePluginElements } from '@plugins/runtime/displayElement/pluginElementActions';
import {
  removePluginElementsLocally,
  sendPluginTreeEdit,
} from '@plugins/runtime/displayElement/pluginTreeGeometry';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import {
  documentRemoveOps,
  removeDocumentElements,
} from './documentEditActions';
import { structureTargetIds } from './treeEditedSelection';

/** 고른 것 지우기 - 트리 요소와 트리에 노드가 있는 플러그인 요소는 한 트리 커밋으로(다 고른 그룹은
 * 그룹째, 비게 된 그룹도 함께), 트리에 아직 없는 플러그인 요소는 플러그인 스토어에서. 같은 동작 id라 되돌리기 한 번 */
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
  if (backed.length === 0) {
    if (treeIds.length > 0) {
      await removeDocumentElements(sceneId, treeIds, { gestureId });
    }
    return;
  }
  const pluginIds = removePluginElementsLocally(backed);
  await sendPluginTreeEdit(
    documentRemoveOps(sceneId, [...treeIds, ...backed]),
    pluginIds,
    gestureId,
  ).catch((error: unknown) => {
    console.error('[ElementDocument] edit was not applied', error);
  });
};
