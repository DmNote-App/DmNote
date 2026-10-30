// 트리로 옮긴 옛 종류(노브 등)는 트리 선택이 맡는다 - 옛 선택을 읽는 동작(지우기·묶기·레이어 끌기 등)이
// 함께 다루도록 옛 선택 모양으로 합쳐 읽는다
import { useItemElementCollections } from '@hooks/shared/useItemElementCollections';
import { useKeyStore } from '@stores/data/useKeyStore';
import {
  useGridSelectionStore,
  type SelectedElement,
} from '@stores/grid/useGridSelectionStore';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { readAuthorityPositions } from '@src/renderer/editor/model/elementStores';
import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  isEditorElementType,
  type EditorElementTypeV1,
} from '@src/types/editor';
import { isPluginKind, TREE_EDITED_KINDS } from '@src/types/elementKinds';
import { keepOtherSelection } from '@stores/grid/keepOtherSelection';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

type PositionsOf = (
  kind: EditorElementTypeV1,
) => Record<string, ReadonlyArray<{ id: string }> | undefined>;

const authorityPositionsOf: PositionsOf = (kind) =>
  readAuthorityPositions(kind) as never;

const selectedDocumentIds = (sceneId: string) => {
  const selection = useDocumentSelectionStore.getState();
  return selection.sceneId === sceneId ? selection.selectedIds : [];
};

const kindOf = (sceneId: string, id: string) =>
  getElementDocumentStore()?.getElement(sceneId, id)?.kind;

// 옛 컬렉션에 아직 없는 요소(붙여넣기 직후 등)는 뺀다 - 옛 동작·패널이 위치를 찾는다
const treeEditedOf = (
  sceneId: string,
  ids: readonly string[],
  positionsOf: PositionsOf,
): SelectedElement[] =>
  ids.flatMap((id) => {
    const kind = kindOf(sceneId, id);
    if (!kind || !isEditorElementType(kind) || !TREE_EDITED_KINDS.has(kind)) {
      return [];
    }
    const index = (positionsOf(kind)[sceneId] ?? []).findIndex(
      (position) => position.id === id,
    );
    return index >= 0 ? [{ type: kind, id, index } as SelectedElement] : [];
  });

/** 트리 선택 중 트리로 옮긴 옛 종류를 옛 선택 모양으로 */
export const treeEditedSelection = (sceneId: string) =>
  treeEditedOf(sceneId, selectedDocumentIds(sceneId), authorityPositionsOf);

/** 옛 선택 + 트리로 옮긴 옛 종류 선택 */
export const combinedSelection = (sceneId: string): SelectedElement[] => [
  ...useGridSelectionStore.getState().selectedElements,
  ...treeEditedSelection(sceneId),
];

/** 구조 편집(묶기·풀기·겹침 순서) 대상 - 트리 선택 전체 + 옛 선택(플러그인 요소 - 트리 노드 id가 fullId) */
export const structureTargetIds = (sceneId: string): string[] => {
  const ids = [...selectedDocumentIds(sceneId)];
  for (const { id } of useGridSelectionStore.getState().selectedElements) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
};

/** 구조 편집 대상 고르기 - 플러그인 요소는 옛 선택, 나머지는 트리 선택 (둘 다 바꾼다) */
export const setStructureSelection = (
  sceneId: string,
  ids: readonly string[],
) => {
  const treeIds: string[] = [];
  const plugins: SelectedElement[] = [];
  for (const id of ids) {
    const kind = kindOf(sceneId, id);
    if (kind && isPluginKind(kind)) plugins.push({ type: 'plugin', id });
    else treeIds.push(id);
  }
  if (treeIds.length === 0) {
    // 빈 선택 - 두 선택 모두 비운다
    if (plugins.length === 0) {
      useGridSelectionStore.getState().clearSelection();
      useDocumentSelectionStore.getState().clear();
      return;
    }
    useGridSelectionStore.getState().setSelectedElements(plugins);
    return;
  }
  // 트리 선택을 바꾸면 옛 선택이 비워진다 - 플러그인 몫은 그 뒤에 다시 고른다
  useDocumentSelectionStore.getState().setSelection(sceneId, treeIds);
  if (plugins.length > 0) {
    keepOtherSelection(() =>
      useGridSelectionStore.getState().setSelectedElements(plugins),
    );
  }
};

/** 트리에만 있는 종류(커서 트래커 등)의 선택 id */
export const treeOnlySelectedIds = (sceneId: string) =>
  selectedDocumentIds(sceneId).filter((id) => {
    const kind = kindOf(sceneId, id);
    return !!kind && !isEditorElementType(kind);
  });

/** 옛 속성 패널이 보는 선택 - 트리 선택이 모두 트리로 옮긴 옛 종류이고 플러그인이 섞이지 않으면
 * 그 요소까지 합친다 (플러그인 섞인 일괄 커밋은 트리로 보내지 못한다) */
export const panelSelectionOf = (
  legacy: SelectedElement[],
  sceneId: string,
  documentIds: readonly string[],
  positionsOf: PositionsOf = authorityPositionsOf,
): SelectedElement[] => {
  if (documentIds.length === 0) return legacy;
  const treeEdited = treeEditedOf(sceneId, documentIds, positionsOf);
  return treeEdited.length === documentIds.length &&
    legacy.every((element) => element.type !== 'plugin')
    ? [...legacy, ...treeEdited]
    : legacy;
};

const EMPTY_IDS: string[] = [];

/** 옛 속성 패널이 보는 선택 구독 (일괄 패널·그라데이션 축·편집 화면 얼굴의 일괄 미리보기) */
export const usePanelSelection = (sceneId: string): SelectedElement[] => {
  const legacy = useGridSelectionStore((state) => state.selectedElements);
  const documentIds = useDocumentSelectionStore((state) =>
    state.sceneId === sceneId ? state.selectedIds : EMPTY_IDS,
  );
  // 옛 컬렉션을 인자로 넘겨 늦게 들어온 요소도 다시 합친다 (컴파일러 메모 의존성)
  const items = useItemElementCollections();
  const keys = useKeyStore((state) => state.canonicalPositions);
  return panelSelectionOf(legacy, sceneId, documentIds, (kind) =>
    kind === 'key'
      ? (keys as never)
      : (items[
          EDITOR_ELEMENT_POSITION_FIELDS[kind] as keyof typeof items
        ] as never),
  );
};
