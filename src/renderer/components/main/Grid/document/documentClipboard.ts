// 트리 요소 클립보드 - 옛 종류 클립보드와 같은 규칙(같은 만큼 비켜 붙이기, 다른 탭에도 붙이기)
// 두 클립보드는 함께 서지 않는다 - 한쪽에 복사하면 다른 쪽을 비운다
import { keepOtherSelection } from '@stores/grid/keepOtherSelection';
import { create } from 'zustand';

import { PASTE_OFFSET } from '@hooks/Grid/constants';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import type { JsonValue, Node, Op } from '@src/types/generated/elementDocument';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { editDocument } from './documentEditActions';
import {
  documentGroupNames,
  documentGroupRoots,
  documentParentOf,
  documentPasteAnchor,
  isLegacyNode,
} from './documentGroups';
import { useLayerCollapseStore } from '@stores/grid/useLayerCollapseStore';
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
import { isPluginKind, pluginIdOfKind } from '@src/types/elementKinds';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { reportElementOpSkipped } from '@src/renderer/editor/runtime/intent/elementIntent';

// 복사한 탭과 스프라이트 트리거가 가리키던 키의 canonical (스프라이트 id별) - 다른 탭에 붙일 때 다시 결합
interface DocumentClipboardSource {
  mode: string;
  triggerCanonicals: Record<string, Record<string, string>>;
  // 레이어 패널에서 접혀 있던 복사한 그룹 - 붙인 그룹도 접는다 (예전과 같다)
  collapsedGroups?: string[];
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

// 플러그인 요소 사본 - 원본 인스턴스 항목(다른 칸 보존)만 남기고 목록 순번은 버린다. 백엔드가 사본의 항목을 새로 둔다
const pluginEntryOnly = (legacy: unknown): JsonValue => {
  const entry = (legacy as { pluginEntry?: JsonValue } | null)?.pluginEntry;
  return entry === undefined ? {} : { pluginEntry: entry };
};

/** 붙여 넣을 새 id - 플러그인 요소는 `{플러그인}::{새 id}` (런타임 fullId와 같은 모양) */
export const freshNodeId = (node: Node, nextId: () => string): string =>
  node.type === 'element' && isPluginKind(node.kind)
    ? `${pluginIdOfKind(node.kind)}::${nextId()}`
    : nextId();

const reissue = (
  node: Node,
  idFor: (node: Node) => string,
  nameGroup: (name: string) => string,
): Node =>
  node.type === 'group'
    ? {
        ...node,
        id: idFor(node),
        name: nameGroup(node.name),
        children: node.children.map((child) =>
          reissue(child, idFor, nameGroup),
        ),
      }
    : {
        ...node,
        id: idFor(node),
        // 옛 종류 요소(트리로 옮긴 노브 등)는 원본의 배열 자리·z를 버린다 - 붙일 때 새로 받는다
        ...(node.legacy !== undefined
          ? {
              legacy: isPluginKind(node.kind)
                ? pluginEntryOnly(node.legacy)
                : legacyFieldsOnly(node.legacy),
            }
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
  // 넣을 자리 - 없으면 장면 맨 위. 여럿이면 원래 순서대로 그 자리부터 쌓는다
  at: { parent: string | null; index: number } | null = null,
) => {
  const idFor = (node: Node) => idMap.get(node.id) ?? freshNodeId(node, nextId);
  const groups = [...existingGroups];
  const nameGroup = (name: string) => {
    const next = buildNextLayerGroupName(name, groups);
    groups.push({ id: next, name: next });
    return next;
  };
  const pasted = nodes.map((node) => reissue(node, idFor, nameGroup));
  const ops: Op[] = pasted.map((node, order) => ({
    op: 'insert',
    scene: sceneId,
    parent: at?.parent ?? null,
    index: at ? at.index + order : null,
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
  const collapsed = useLayerCollapseStore.getState().collapsed;
  useDocumentClipboardStore.getState().set(picked, {
    mode: sceneId!,
    triggerCanonicals,
    collapsedGroups: nodesOf(picked)
      .filter((node) => node.type === 'group' && collapsed.has(node.id))
      .map((node) => node.id),
  });
  return true;
};

// 플러그인 정의의 탭별 인스턴스 상한 - 붙이면 넘는 플러그인이 있으면 true (옛 플러그인 붙여넣기와 같다)
const exceedsPluginInstanceLimit = (
  scene: { nodes: readonly Node[] } | undefined,
  pasted: readonly Node[],
): boolean => {
  const pastedByPlugin = new Map<string, number>();
  for (const node of elementsOf(pasted)) {
    if (node.type !== 'element' || !isPluginKind(node.kind)) continue;
    const pluginId = pluginIdOfKind(node.kind);
    pastedByPlugin.set(pluginId, (pastedByPlugin.get(pluginId) ?? 0) + 1);
  }
  const { definitions } = usePluginDisplayElementStore.getState();
  for (const [pluginId, count] of pastedByPlugin) {
    const maxInstances = definitions.get(pluginId)?.maxInstances;
    if (!maxInstances || maxInstances <= 0) continue;
    const current = elementsOf(scene?.nodes ?? []).filter(
      (node) =>
        node.type === 'element' &&
        isPluginKind(node.kind) &&
        pluginIdOfKind(node.kind) === pluginId,
    ).length;
    if (current + count > maxInstances) {
      console.warn(
        `[Plugin ${pluginId}] Max instances (${maxInstances}) reached`,
      );
      return true;
    }
  }
  return false;
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
    nodesOf(copied).map((node) => [
      node.id,
      freshNodeId(node, () => crypto.randomUUID()),
    ]),
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
  // 넣을 자리 - 이 탭에서 고른 것 중 가장 위 노드 바로 위 (예전 붙여넣기와 같다). 옛 모양은 그룹 안
  // 그룹을 나타내지 못해 옛 그룹이 그룹 안에 들게 되는 자리면 장면 맨 위로
  const targetScene = getElementDocumentStore()?.getScene(sceneId);
  // 플러그인 인스턴스 상한을 넘으면 아무것도 붙이지 않는다 (부분 붙여넣기 없음)
  if (exceedsPluginInstanceLimit(targetScene, nodes)) {
    reportElementOpSkipped('paste max instances');
    return;
  }
  const before = useDocumentSelectionStore.getState();
  const anchor = documentPasteAnchor(
    targetScene,
    before.sceneId === sceneId
      ? [...before.selectedIds, ...before.selectedElements.map(({ id }) => id)]
      : [],
  );
  const parentNested =
    anchor?.parent != null &&
    documentParentOf(targetScene, anchor.parent) != null;
  const nested =
    anchor?.parent != null &&
    nodes.some(
      (node) => isLegacyNode(node) && (node.type === 'group' || parentNested),
    );
  const { ops, ids } = buildDocumentPaste(
    sceneId,
    nodes,
    undefined,
    documentGroupNames(targetScene),
    idMap,
    nested ? null : anchor,
  );
  // 접혀 있던 그룹은 붙인 그룹도 접는다
  useLayerCollapseStore
    .getState()
    .collapse(
      (source?.collapsedGroups ?? []).flatMap((id) =>
        idMap.has(id) ? [idMap.get(id)!] : [],
      ),
    );
  const sent = editDocument(
    ops,
    legacyPaste?.gestureId ? { gestureId: legacyPaste.gestureId } : undefined,
  );
  // 선택 이동은 낙관 반영 직후 동기로 - 응답을 기다리면 그 사이 Delete 같은 조작이 원본에 간다
  const select = () =>
    useDocumentSelectionStore.getState().setSelection(sceneId, ids);
  if (keepOther) keepOtherSelection(select);
  else select();
  await sent;
  // 붙이지 못해 화면에서 빠진 사본은 선택에서 뺀다 (보류한 편집은 화면에 남아 그대로)
  const store = getElementDocumentStore();
  const selection = useDocumentSelectionStore.getState();
  const gone = new Set(ids.filter((id) => !store?.getElement(sceneId, id)));
  if (
    gone.size > 0 &&
    selection.sceneId === sceneId &&
    selection.selectedIds.some((id) => gone.has(id))
  ) {
    keepOtherSelection(() =>
      selection.setSelection(
        sceneId,
        selection.selectedIds.filter((id) => !gone.has(id)),
      ),
    );
  }
};

/** 우클릭 복제 - 옛 종류처럼 복사 뒤 붙여넣기 */
export const duplicateDocumentSelection = async (sceneId: string) => {
  if (copyDocumentSelection()) await pasteDocumentClipboard(sceneId);
};
