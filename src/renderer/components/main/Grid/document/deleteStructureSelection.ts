import { deleteFrozenSelection } from '@src/renderer/editor/runtime/intent/deleteFrozenSelection';
import { removeDocumentElements } from './documentEditActions';
import { combinedSelection, treeOnlySelectedIds } from './treeEditedSelection';

/** 고른 것 지우기 - 트리에만 있는 종류는 트리에서, 옛 종류·플러그인은 옛 지우기로 (같은 동작 id - 되돌리기 한 번) */
export const deleteStructureSelection = (sceneId: string) => {
  const gestureId = crypto.randomUUID();
  const treeOnlyIds = treeOnlySelectedIds(sceneId);
  if (treeOnlyIds.length > 0) {
    void removeDocumentElements(sceneId, treeOnlyIds, { gestureId });
  }
  return deleteFrozenSelection(combinedSelection(sceneId), { gestureId });
};
