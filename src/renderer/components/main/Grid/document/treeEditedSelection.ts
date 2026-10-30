// 트리로 옮긴 옛 종류(노브 등)는 트리 선택이 맡는다 - 옛 선택을 읽는 동작(지우기·묶기·레이어 끌기 등)이
// 함께 다루도록 옛 선택 모양으로 합쳐 읽는다
import {
  useGridSelectionStore,
  type SelectedElement,
} from '@stores/grid/useGridSelectionStore';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { readAuthorityPositions } from '@src/renderer/editor/model/elementStores';
import { isEditorElementType } from '@src/types/editor';
import { TREE_EDITED_KINDS } from '@src/types/elementKinds';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

const selectedDocumentIds = (sceneId: string) => {
  const selection = useDocumentSelectionStore.getState();
  return selection.sceneId === sceneId ? selection.selectedIds : [];
};

const kindOf = (sceneId: string, id: string) =>
  getElementDocumentStore()?.getElement(sceneId, id)?.kind;

const treeEditedOf = (
  sceneId: string,
  ids: readonly string[],
): SelectedElement[] =>
  ids.flatMap((id) => {
    const kind = kindOf(sceneId, id);
    if (!kind || !isEditorElementType(kind) || !TREE_EDITED_KINDS.has(kind)) {
      return [];
    }
    const index = (
      (readAuthorityPositions(kind)[sceneId] ?? []) as Array<{ id: string }>
    ).findIndex((position) => position.id === id);
    return index >= 0 ? [{ type: kind, id, index } as SelectedElement] : [];
  });

/** 트리 선택 중 트리로 옮긴 옛 종류를 옛 선택 모양으로 */
export const treeEditedSelection = (sceneId: string) =>
  treeEditedOf(sceneId, selectedDocumentIds(sceneId));

/** 옛 선택 + 트리로 옮긴 옛 종류 선택 */
export const combinedSelection = (sceneId: string): SelectedElement[] => [
  ...useGridSelectionStore.getState().selectedElements,
  ...treeEditedSelection(sceneId),
];

/** 트리에만 있는 종류(커서 트래커 등)의 선택 id */
export const treeOnlySelectedIds = (sceneId: string) =>
  selectedDocumentIds(sceneId).filter((id) => {
    const kind = kindOf(sceneId, id);
    return !!kind && !isEditorElementType(kind);
  });

const EMPTY_IDS: string[] = [];

/** 합친 선택 구독 - 일괄 패널처럼 옛 선택 모양으로 노브까지 다루는 곳 */
export const useCombinedSelection = (sceneId: string): SelectedElement[] => {
  const legacy = useGridSelectionStore((state) => state.selectedElements);
  const documentIds = useDocumentSelectionStore((state) =>
    state.sceneId === sceneId ? state.selectedIds : EMPTY_IDS,
  );
  if (documentIds.length === 0) return legacy;
  // 고른 id를 넘겨 의존성을 드러낸다 (컴파일러 메모)
  const treeEdited = treeEditedOf(sceneId, documentIds);
  return treeEdited.length > 0 ? [...legacy, ...treeEdited] : legacy;
};
