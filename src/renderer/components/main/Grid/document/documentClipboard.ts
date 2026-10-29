// 트리 요소 클립보드 - 옛 종류 클립보드와 같은 규칙(같은 만큼 비켜 붙이기, 다른 탭에도 붙이기)
// 두 클립보드는 함께 서지 않는다 - 한쪽에 복사하면 다른 쪽을 비운다
import { create } from 'zustand';

import { PASTE_OFFSET } from '@hooks/Grid/constants';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import type { Node, Op } from '@src/types/generated/elementDocument';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { editDocument } from './documentEditActions';
import { documentGroupRoots } from './documentGroups';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

interface DocumentClipboardState {
  nodes: Node[];
  set: (nodes: Node[]) => void;
  clear: () => void;
}

export const useDocumentClipboardStore = create<DocumentClipboardState>(
  (set) => ({
    nodes: [],
    set: (nodes) => set({ nodes }),
    clear: () => set({ nodes: [] }),
  }),
);

// 옛 종류를 복사하면 트리 클립보드를 비운다
useGridSelectionStore.subscribe((state, previous) => {
  if (
    state.clipboard !== previous.clipboard &&
    state.clipboard.length > 0 &&
    useDocumentClipboardStore.getState().nodes.length > 0
  ) {
    useDocumentClipboardStore.getState().clear();
  }
});

const reissue = (node: Node, nextId: () => string): Node =>
  node.type === 'group'
    ? {
        ...node,
        id: nextId(),
        children: node.children.map((child) => reissue(child, nextId)),
      }
    : {
        ...node,
        id: nextId(),
        frame: {
          ...node.frame,
          x: node.frame.x + PASTE_OFFSET,
          y: node.frame.y + PASTE_OFFSET,
        },
      };

/** 붙여넣기 연산 - 새 id, 같은 만큼 비켜, 복사한 순서(겹치는 순서)대로 맨 위에 넣는다 */
export const buildDocumentPaste = (
  sceneId: string,
  nodes: readonly Node[],
  nextId: () => string = () => crypto.randomUUID(),
) => {
  const pasted = nodes.map((node) => reissue(node, nextId));
  const ops: Op[] = pasted.map((node) => ({
    op: 'insert',
    scene: sceneId,
    parent: null,
    index: null,
    node,
  }));
  // 선택은 요소 id로 - 그룹은 안쪽 요소
  const elementIds = (node: Node): string[] =>
    node.type === 'group' ? node.children.flatMap(elementIds) : [node.id];
  return { ops, ids: pasted.flatMap(elementIds) };
};

/** 고른 트리 요소를 겹치는 순서대로 복사 - 옛 종류 클립보드는 비운다 */
export const copyDocumentSelection = () => {
  const { sceneId, selectedIds } = useDocumentSelectionStore.getState();
  const scene = sceneId
    ? getElementDocumentStore()?.getScene(sceneId)
    : undefined;
  if (!scene || selectedIds.length === 0) return false;
  // 요소가 다 골라진 트리 그룹은 그룹째 복사한다
  const roots = documentGroupRoots(scene, selectedIds);
  const picked: Node[] = [];
  const visit = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      if (roots.includes(node.id)) picked.push(structuredClone(node));
      else if (node.type === 'group') visit(node.children);
    }
  };
  visit(scene.nodes);
  if (picked.length === 0) return false;
  useGridSelectionStore.getState().clearClipboard();
  useDocumentClipboardStore.getState().set(picked);
  return true;
};

/** 지금 탭에 붙여넣고 붙인 요소를 고른다 */
export const pasteDocumentClipboard = async (sceneId: string) => {
  const { nodes } = useDocumentClipboardStore.getState();
  if (nodes.length === 0) return;
  const { ops, ids } = buildDocumentPaste(sceneId, nodes);
  const result = await editDocument(ops);
  if (result?.status === 'committed') {
    useDocumentSelectionStore.getState().setSelection(sceneId, ids);
  }
};

/** 우클릭 복제 - 옛 종류처럼 복사 뒤 붙여넣기 */
export const duplicateDocumentSelection = async (sceneId: string) => {
  if (copyDocumentSelection()) await pasteDocumentClipboard(sceneId);
};
