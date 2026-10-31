// 트리로 옮긴 옛 종류(노브 등)는 트리 선택이 맡는다 - 옛 선택을 읽는 동작(지우기·묶기·레이어 끌기 등)이
// 함께 다루도록 옛 선택 모양으로 합쳐 읽는다
import {
  useGridSelectionStore,
  type SelectedElement,
} from '@stores/grid/useGridSelectionStore';
import { useSyncExternalStore } from 'react';
import {
  getElementDocumentStore,
  subscribeElementDocument,
  useElementDocumentScene,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import { isEditorElementType } from '@src/types/editor';
import { isPluginKind, TREE_EDITED_KINDS } from '@src/types/elementKinds';
import { keepOtherSelection } from '@stores/grid/keepOtherSelection';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

const selectedDocumentIds = (sceneId: string) => {
  const selection = useDocumentSelectionStore.getState();
  return selection.sceneId === sceneId ? selection.selectedIds : [];
};

const kindOf = (sceneId: string, id: string) =>
  getElementDocumentStore()?.getElement(sceneId, id)?.kind;

// 순번은 트리에 실린 옛 순번 (패널·동작은 id로 트리를 읽는다)
const treeEditedOf = (
  sceneId: string,
  ids: readonly string[],
): SelectedElement[] =>
  ids.flatMap((id) => {
    const element = getElementDocumentStore()?.getElement(sceneId, id);
    const kind = element?.kind;
    if (!kind || !isEditorElementType(kind) || !TREE_EDITED_KINDS.has(kind)) {
      return [];
    }
    const index =
      (element.legacy as { index?: number } | undefined)?.index ?? 0;
    return [{ type: kind, id, index } as SelectedElement];
  });

/** 트리 선택 중 트리로 옮긴 옛 종류를 옛 선택 모양으로 */
export const treeEditedSelection = (sceneId: string) =>
  treeEditedOf(sceneId, selectedDocumentIds(sceneId));

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
  const pluginIds: string[] = [];
  for (const id of ids) {
    const kind = kindOf(sceneId, id);
    (kind && isPluginKind(kind) ? pluginIds : treeIds).push(id);
  }
  setSplitSelection(sceneId, treeIds, pluginIds);
};

/** 트리 몫·플러그인 몫을 이미 나눈 선택 - 트리에 아직 없는 플러그인 요소(스크립트가 막 만든 것 등)도 옛 선택으로 */
export const setSplitSelection = (
  sceneId: string,
  treeIds: readonly string[],
  pluginIds: readonly string[],
) => {
  const plugins: SelectedElement[] = pluginIds.map((id) => ({
    type: 'plugin',
    id,
  }));
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
  useDocumentSelectionStore.getState().setSelection(sceneId, [...treeIds]);
  if (plugins.length > 0) {
    keepOtherSelection(() =>
      useGridSelectionStore.getState().setSelectedElements(plugins),
    );
  }
};

/** 옛 속성 패널이 보는 선택 - 트리 선택이 모두 트리로 옮긴 옛 종류이고 플러그인이 섞이지 않으면
 * 그 요소까지 합친다 (플러그인 섞인 일괄 커밋은 트리로 보내지 못한다).
 * _scene은 React Compiler가 메모하는 훅에서 장면이 바뀌면 다시 합치도록 넘기는 자리(값은 안에서 읽는다) */
export const panelSelectionOf = (
  legacy: SelectedElement[],
  sceneId: string,
  documentIds: readonly string[],
  _scene?: unknown,
): SelectedElement[] => {
  if (documentIds.length === 0) return legacy;
  const treeEdited = treeEditedOf(sceneId, documentIds);
  return treeEdited.length === documentIds.length &&
    legacy.every((element) => element.type !== 'plugin')
    ? [...legacy, ...treeEdited]
    : legacy;
};

const EMPTY_IDS: string[] = [];

const subscribePanelSelectionSources = (listener: () => void) => {
  const stops = [
    useGridSelectionStore.subscribe(listener),
    useDocumentSelectionStore.subscribe(listener),
    subscribeElementDocument(listener),
  ];
  return () => stops.forEach((stop) => stop());
};

const isInPanelSelection = (sceneId: string, id: string) => {
  const documentIds = selectedDocumentIds(sceneId);
  if (!documentIds.includes(id)) return false;
  return panelSelectionOf(
    useGridSelectionStore.getState().selectedElements,
    sceneId,
    documentIds,
  ).some((element) => element.id === id);
};

/** 요소 하나가 패널 선택에 드는지 (편집 화면 얼굴의 일괄 미리보기) - 장면·선택이 바뀌어도
 * 이 값이 같으면 다시 그리지 않는다 (얼굴마다 선택 목록을 통째로 구독하면 요소 하나만 고쳐도 모두 다시 그린다) */
export const useInPanelSelection = (sceneId: string, id: string): boolean =>
  useSyncExternalStore(
    subscribePanelSelectionSources,
    () => isInPanelSelection(sceneId, id),
    () => false,
  );

/** 옛 속성 패널이 보는 선택 구독 (일괄 패널·그라데이션 축·편집 화면 얼굴의 일괄 미리보기) */
export const usePanelSelection = (sceneId: string): SelectedElement[] => {
  const legacy = useGridSelectionStore((state) => state.selectedElements);
  const documentIds = useDocumentSelectionStore((state) =>
    state.sceneId === sceneId ? state.selectedIds : EMPTY_IDS,
  );
  // 트리가 바뀌면(종류 확인·지운 요소) 다시 합친다
  const scene = useElementDocumentScene(sceneId);
  return panelSelectionOf(legacy, sceneId, documentIds, scene);
};
