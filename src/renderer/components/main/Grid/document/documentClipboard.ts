// 트리 요소 클립보드 - 옛 종류 클립보드와 같은 규칙(같은 만큼 비켜 붙이기, 다른 탭에도 붙이기)
// 두 클립보드는 함께 서지 않는다 - 한쪽에 복사하면 다른 쪽을 비운다
import { keepOtherSelection } from '@stores/grid/keepOtherSelection';
import { create } from 'zustand';

import { PASTE_OFFSET } from '@hooks/Grid/constants';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import type { JsonValue, Node, Op } from '@src/types/generated/elementDocument';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { editDocument } from './documentEditActions';
import { documentGroupNames, documentGroupRoots } from './documentGroups';
import { buildNextLayerGroupName } from '@utils/layerGroupUtils';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { treeModeArrays } from '@src/renderer/elementKinds/runtime/treeModeArrays';
import { takePastedKeyIds } from '@stores/grid/pastedKeyIds';
import type { SpritePose } from '@src/types/key/sprites';
import {
  freezeTriggerCanonicals,
  pastedPoseTriggers,
  reissueSpritePoseIds,
} from '@utils/sprite/poseIdentity';
import {
  buildSpriteKeyCanonicalMap,
  keyIdsByCanonical,
} from '@utils/sprite/spriteKeyBinding';
import { toPoseWireShape } from '@utils/sprite/spriteWireShape';

// 복사한 탭과 스프라이트 트리거가 가리키던 키의 canonical (스프라이트 id별) - 다른 탭에 붙일 때 다시 결합
interface DocumentClipboardSource {
  mode: string;
  triggerCanonicals: Record<string, Record<string, string>>;
}

interface DocumentClipboardState {
  nodes: Node[];
  source: DocumentClipboardSource | null;
  set: (nodes: Node[], source?: DocumentClipboardSource) => void;
  clear: () => void;
}

export const useDocumentClipboardStore = create<DocumentClipboardState>(
  (set) => ({
    nodes: [],
    source: null,
    set: (nodes, source) => set({ nodes, source: source ?? null }),
    clear: () => set({ nodes: [], source: null }),
  }),
);

const spritePosesOf = (node: Node): SpritePose[] | null =>
  node.type === 'element' &&
  node.kind === 'sprite' &&
  Array.isArray(node.values?.poses)
    ? (node.values.poses as unknown as SpritePose[])
    : null;

const elementsOf = (nodes: readonly Node[]): Node[] =>
  nodes.flatMap((node) =>
    node.type === 'group' ? elementsOf(node.children) : [node],
  );

// 그룹과 요소 모두
const nodesOf = (nodes: readonly Node[]): Node[] =>
  nodes.flatMap((node) =>
    node.type === 'group' ? [node, ...nodesOf(node.children)] : [node],
  );

/** 붙여넣을 스프라이트의 자세 - poseId 재발급, 함께 붙인 키·다른 탭의 같은 키로 트리거 재결합(옛 붙여넣기와 같은 규칙) */
export const pastedSpriteNodes = (
  nodes: readonly Node[],
  keyIdMap: ReadonlyMap<string, string>,
  cross: {
    triggerCanonicals: Record<string, Record<string, string>>;
    targetKeyIdsByCanonical: ReadonlyMap<string, readonly string[]>;
  } | null,
): Node[] =>
  nodes.map((node) => {
    if (node.type === 'group') {
      return {
        ...node,
        children: pastedSpriteNodes(node.children, keyIdMap, cross),
      };
    }
    const poses = spritePosesOf(node);
    if (!poses) return node;
    const next = reissueSpritePoseIds(
      pastedPoseTriggers(
        poses,
        keyIdMap,
        cross
          ? {
              triggerCanonicals: cross.triggerCanonicals[node.id] ?? {},
              targetKeyIdsByCanonical: cross.targetKeyIdsByCanonical,
            }
          : null,
      ),
    ).map(toPoseWireShape);
    return {
      ...node,
      values: { ...node.values, poses: next as unknown as JsonValue },
    };
  });

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

const legacyFieldsOnly = (legacy: unknown): JsonValue => {
  const fields = (legacy as { fields?: JsonValue } | null)?.fields;
  return fields === undefined ? {} : { fields };
};

const reissue = (
  node: Node,
  idFor: (id: string) => string,
  nameGroup: (name: string) => string,
): Node =>
  node.type === 'group'
    ? {
        ...node,
        id: idFor(node.id),
        name: nameGroup(node.name),
        children: node.children.map((child) =>
          reissue(child, idFor, nameGroup),
        ),
      }
    : {
        ...node,
        id: idFor(node.id),
        // 옛 종류 요소(트리로 옮긴 노브 등)는 원본의 배열 자리·z를 버린다 - 붙일 때 새로 받는다
        ...(node.legacy !== undefined
          ? { legacy: legacyFieldsOnly(node.legacy) }
          : {}),
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
  // 붙일 장면의 그룹 이름 - 그룹은 옛 종류처럼 번호를 이어 새 이름을 붙인다
  existingGroups: { id: string; name: string }[] = [],
  // 미리 정한 새 id (원본 id → 새 id) - 없는 것은 nextId로 받는다
  idMap: ReadonlyMap<string, string> = new Map(),
) => {
  const idFor = (id: string) => idMap.get(id) ?? nextId();
  const groups = [...existingGroups];
  const nameGroup = (name: string) => {
    const next = buildNextLayerGroupName(name, groups);
    groups.push({ id: next, name: next });
    return next;
  };
  const pasted = nodes.map((node) => reissue(node, idFor, nameGroup));
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
export const copyDocumentSelection = ({
  // 같은 키 입력에서 옛 종류 요소도 복사했으면(섞어 복사) 방금 채운 옛 클립보드를 지킨다
  keepLegacyClipboard = false,
}: { keepLegacyClipboard?: boolean } = {}) => {
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
  if (!keepLegacyClipboard) useGridSelectionStore.getState().clearClipboard();
  // 스프라이트 트리거가 가리키는 키를 canonical로 얼린다 (옛 복사와 같다) - 키 슬롯은 트리에서
  const sourceKeys = treeModeArrays(scene);
  const sourceKeyCanonicals = buildSpriteKeyCanonicalMap(
    sourceKeys.keySlots,
    sourceKeys.keyPositions,
  );
  const triggerCanonicals = Object.fromEntries(
    elementsOf(picked).flatMap((node) => {
      const poses = spritePosesOf(node);
      return poses
        ? [[node.id, freezeTriggerCanonicals(poses, sourceKeyCanonicals)]]
        : [];
    }),
  );
  useDocumentClipboardStore
    .getState()
    .set(picked, { mode: sceneId!, triggerCanonicals });
  return true;
};

/** 지금 탭에 붙여넣고 붙인 요소를 고른다 */
export const pasteDocumentClipboard = async (
  sceneId: string,
  // 옛 종류 클립보드와 함께 붙일 때 - 붙인 옛 요소 선택을 지킨다
  { keepOther = false }: { keepOther?: boolean } = {},
) => {
  const { nodes: copied, source } = useDocumentClipboardStore.getState();
  if (copied.length === 0) return;
  // 새 id를 먼저 정한다 - 함께 붙이는 키(트리·같은 동작의 옛 붙여넣기)의 사본 id로 스프라이트 트리거를 옮긴다
  const idMap = new Map(
    nodesOf(copied).map((node) => [node.id, crypto.randomUUID()]),
  );
  // 함께 붙인 옛 붙여넣기 - 사본 키 id와 같은 동작 id(되돌리기 한 번)
  const legacyPaste = keepOther ? takePastedKeyIds() : null;
  const pastedIds = new Map([...(legacyPaste?.keyIds ?? []), ...idMap]);
  // 다른 탭이면 그 탭의 같은 키 - 키 슬롯은 트리에서
  const targetKeys = treeModeArrays(
    getElementDocumentStore()?.getScene(sceneId),
  );
  const nodes = pastedSpriteNodes(
    copied,
    pastedIds,
    source && source.mode !== sceneId
      ? {
          triggerCanonicals: source.triggerCanonicals,
          targetKeyIdsByCanonical: keyIdsByCanonical(
            targetKeys.keySlots,
            targetKeys.keyPositions,
          ),
        }
      : null,
  );
  const { ops, ids } = buildDocumentPaste(
    sceneId,
    nodes,
    undefined,
    documentGroupNames(getElementDocumentStore()?.getScene(sceneId)),
    idMap,
  );
  const result = await editDocument(
    ops,
    legacyPaste?.gestureId ? { gestureId: legacyPaste.gestureId } : undefined,
  );
  if (result?.status === 'committed') {
    const select = () =>
      useDocumentSelectionStore.getState().setSelection(sceneId, ids);
    if (keepOther) keepOtherSelection(select);
    else select();
  }
};

/** 우클릭 복제 - 옛 종류처럼 복사 뒤 붙여넣기 */
export const duplicateDocumentSelection = async (sceneId: string) => {
  if (copyDocumentSelection()) await pasteDocumentClipboard(sceneId);
};
