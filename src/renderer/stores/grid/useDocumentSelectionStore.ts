import { create } from 'zustand';

import { useKeyStore } from '@stores/data/useKeyStore';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { TREE_EDITED_KINDS } from '@src/types/elementKinds';
import {
  isKeepingOtherSelection,
  keepOtherSelection,
} from './keepOtherSelection';
import type { SelectedElement } from './useGridSelectionStore';

// 캔버스 선택 하나 - 트리 요소(selectedIds, 한 장면)와 플러그인 요소(selectedElements)를 함께 든다.
// 바꿔 고르면 다른 쪽을 비우고, 넣고 빼기(keepOtherSelection 안)는 다른 쪽을 지킨다

interface DocumentSelectionState {
  sceneId: string | null;
  selectedIds: string[];
  // 플러그인 요소 선택 (옛 선택 모양)
  selectedElements: SelectedElement[];

  // 트리 요소
  select: (sceneId: string, id: string) => void;
  // 여러 개를 한 번에 - 비어 있으면 트리 요소 선택을 푼다
  setSelection: (sceneId: string, ids: string[]) => void;
  clear: () => void;
  // 두 몫을 한 번에 (범위 선택·구조 편집 대상 고르기)
  replaceSelection: (
    sceneId: string,
    treeIds: string[],
    plugins: SelectedElement[],
  ) => void;

  // 옛 선택 모양 - 트리로 옮긴 종류는 트리 요소 선택으로 보낸다
  selectElement: (element: SelectedElement, addToSelection?: boolean) => void;
  toggleSelection: (element: SelectedElement) => void;
  deselectElement: (id: string) => void;
  clearSelection: () => void;
  setSelectedElements: (elements: SelectedElement[]) => void;
  isSelected: (id: string) => boolean;
}

const EMPTY_ELEMENTS: SelectedElement[] = [];

const isTreeEditedSelection = (element: SelectedElement) =>
  element.type !== 'plugin' && TREE_EDITED_KINDS.has(element.type);

const isTreeEditedId = (sceneId: string, id: string) => {
  const kind = getElementDocumentStore()?.getElement(sceneId, id)?.kind;
  return !!kind && TREE_EDITED_KINDS.has(kind);
};

const toggleId = (ids: string[], id: string) =>
  ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];

const sameElements = (
  left: readonly SelectedElement[],
  right: readonly SelectedElement[],
) =>
  left.length === right.length &&
  left.every((element, i) => {
    const next = right[i];
    return (
      element.type === next.type &&
      element.id === next.id &&
      element.index === next.index
    );
  });

type TreePart = Pick<DocumentSelectionState, 'sceneId' | 'selectedIds'>;

const EMPTY_TREE: TreePart = { sceneId: null, selectedIds: [] };

const treePartOf = (sceneId: string, ids: string[]): TreePart =>
  ids.length === 0 ? EMPTY_TREE : { sceneId, selectedIds: ids };

// 옛 선택으로 들어온 트리로 옮긴 종류 요소 (지금 탭).
// replace: 그 몫만 바꾼다(트리에만 있는 종류는 지킨다), toggle: 넣고 뺀다, set: 트리 선택 전체를 그 요소로
const routeTreeEdited = (
  state: TreePart,
  ids: readonly string[],
  mode: 'replace' | 'toggle' | 'set',
): TreePart => {
  const sceneId = useKeyStore.getState().selectedKeyType;
  const current = state.sceneId === sceneId ? state.selectedIds : [];
  return treePartOf(
    sceneId,
    mode === 'set'
      ? [...ids]
      : mode === 'replace'
      ? [...current.filter((id) => !isTreeEditedId(sceneId, id)), ...ids]
      : ids.reduce(toggleId, current),
  );
};

export const useDocumentSelectionStore = create<DocumentSelectionState>(
  (set, get) => ({
    sceneId: null,
    selectedIds: [],
    selectedElements: EMPTY_ELEMENTS,

    select: (sceneId, id) =>
      set(
        isKeepingOtherSelection()
          ? { sceneId, selectedIds: [id] }
          : { sceneId, selectedIds: [id], selectedElements: EMPTY_ELEMENTS },
      ),
    setSelection: (sceneId, ids) => {
      if (ids.length === 0) {
        set(EMPTY_TREE);
        return;
      }
      set(
        isKeepingOtherSelection()
          ? { sceneId, selectedIds: ids }
          : { sceneId, selectedIds: ids, selectedElements: EMPTY_ELEMENTS },
      );
    },
    clear: () => set(EMPTY_TREE),
    replaceSelection: (sceneId, treeIds, plugins) =>
      set((state) => ({
        ...treePartOf(sceneId, treeIds),
        selectedElements: sameElements(state.selectedElements, plugins)
          ? state.selectedElements
          : plugins,
      })),

    selectElement: (element, addToSelection = false) => {
      const keeping = isKeepingOtherSelection();
      set((state) => {
        if (isTreeEditedSelection(element)) {
          if (addToSelection) {
            return routeTreeEdited(state, [element.id], 'toggle');
          }
          return {
            ...routeTreeEdited(
              keeping ? state : EMPTY_TREE,
              [element.id],
              'replace',
            ),
            selectedElements: EMPTY_ELEMENTS,
          };
        }
        if (addToSelection) {
          return {
            selectedElements: state.selectedElements.some(
              (other) => other.id === element.id,
            )
              ? state.selectedElements.filter(
                  (other) => other.id !== element.id,
                )
              : [...state.selectedElements, element],
          };
        }
        return keeping
          ? { selectedElements: [element] }
          : { ...EMPTY_TREE, selectedElements: [element] };
      });
    },

    toggleSelection: (element) => {
      set((state) => {
        if (isTreeEditedSelection(element)) {
          return routeTreeEdited(state, [element.id], 'toggle');
        }
        return {
          selectedElements: state.selectedElements.some(
            (other) => other.id === element.id,
          )
            ? state.selectedElements.filter((other) => other.id !== element.id)
            : [...state.selectedElements, element],
        };
      });
    },

    deselectElement: (id) => {
      set((state) =>
        state.selectedElements.some((element) => element.id === id)
          ? {
              selectedElements: state.selectedElements.filter(
                (element) => element.id !== id,
              ),
            }
          : {},
      );
    },

    // 선택 해제 - 넣고 빼기 안에서는 트리 요소 선택을 지킨다
    clearSelection: () =>
      set(
        isKeepingOtherSelection()
          ? { selectedElements: EMPTY_ELEMENTS }
          : { ...EMPTY_TREE, selectedElements: EMPTY_ELEMENTS },
      ),

    setSelectedElements: (incoming) => {
      const keeping = isKeepingOtherSelection();
      const treeIds = incoming
        .filter(isTreeEditedSelection)
        .map(({ id }) => id);
      const elements =
        treeIds.length > 0
          ? incoming.filter((element) => !isTreeEditedSelection(element))
          : incoming;
      set((state) => {
        // 논리적으로 같은 선택이면 참조를 유지해 구독자 리렌더 방지
        const plugins = sameElements(state.selectedElements, elements)
          ? {}
          : { selectedElements: elements };
        // 트리 몫이 있으면 트리 선택을 그 요소로 바로 (비우고 다시 채우면 중간의 빈 선택이 편집 제스처를 취소한다)
        if (treeIds.length > 0) {
          return {
            ...plugins,
            ...routeTreeEdited(state, treeIds, keeping ? 'replace' : 'set'),
          };
        }
        if (elements.length > 0 && !keeping && state.selectedIds.length > 0) {
          return { ...plugins, ...EMPTY_TREE };
        }
        return plugins;
      });
    },

    isSelected: (id) => get().selectedElements.some((el) => el.id === id),
  }),
);

// 재주입으로 fullId가 갈린 플러그인 선택 제거. 현존 fullId 집합 기준.
// ownerPluginId를 주면 그 플러그인 소유 선택만 판정한다 - 스토어는 전
// 플러그인 공용이라, 리로드 공백(요소가 잠시 비는 창)에 있는 다른 플러그인의
// 정당한 선택까지 죽은 것으로 보고 지우는 것을 막는다
export function pruneStalePluginSelection(
  liveFullIds: ReadonlySet<string>,
  ownerPluginId?: string,
) {
  const selection = useDocumentSelectionStore.getState();
  if (selection.selectedElements.length === 0) return;
  // 표시 요소 fullId는 `${pluginId}::${id}`다. pluginId에는 콜론이 들어갈 수
  // 없으므로(백엔드 validate_plugin_id: 영숫자·하이픈·언더스코어) 콜론 1개
  // 접두사로 충분하고, plugin-a ↔ plugin-ab 오탐도 막힌다
  const ownedByPull = (fullId: string) =>
    ownerPluginId === undefined || fullId.startsWith(`${ownerPluginId}:`);
  const kept = selection.selectedElements.filter(
    (element) =>
      element.type !== 'plugin' ||
      !ownedByPull(element.id) ||
      liveFullIds.has(element.id),
  );
  if (kept.length === selection.selectedElements.length) return;
  keepOtherSelection(() => selection.setSelectedElements(kept));
}
