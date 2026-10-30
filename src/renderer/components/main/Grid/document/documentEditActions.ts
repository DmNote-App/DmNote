// 트리 문서 편집 동작 - 백엔드에 커밋하고 반영된 결과를 돌려준다
import type { ElementDocumentCommitResult } from '@api/modules/editor/elementDocumentApi';
import { withResizeValues } from '@src/renderer/elementKinds/runtime/resizeValues';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import { elementKindData } from '@src/renderer/elementKinds/defineElementKind';
import { buildNextLayerGroupName } from '@utils/layerGroupUtils';
import type {
  FramePatch,
  JsonValue,
  Node,
  Op,
  Scene,
} from '@src/types/generated/elementDocument';
import {
  documentGroupNames,
  documentGroupOps,
  documentGroupRoots,
  documentGroupsOf,
  documentParentOf,
} from './documentGroups';

const report = (result: ElementDocumentCommitResult) => {
  if (result.status === 'committed') return;
  console.error('[ElementDocument] edit was not applied', result);
};

export const editDocument = async (
  ops: Op[],
  options?: { gestureId?: string },
): Promise<ElementDocumentCommitResult | null> => {
  const store = getElementDocumentStore();
  if (!store?.edit) return null;
  try {
    // 크기와 함께 맞출 값(스프라이트 이동값 등)도 같은 커밋에
    const result = await store.edit(withResizeValues(ops), options);
    report(result);
    return result;
  } catch (error) {
    console.error('[ElementDocument] edit failed', error);
    return null;
  }
};

const newId = () => crypto.randomUUID();

/** 새 요소 - 크기는 정의의 생성 크기, 왼쪽 위가 at (다른 종류의 우클릭 추가와 같다) */
export const insertDocumentElement = (
  sceneId: string,
  kind: string,
  at: { x: number; y: number },
) => {
  const definition = elementKindDefinition(kind);
  if (!definition) return Promise.resolve(null);
  const { defaultSize, fields } = elementKindData(definition);
  const id = newId();
  // 백엔드도 기본값을 채우지만, 응답 전 화면(낙관 적용)에서도 제대로 그리도록 함께 보낸다
  const values = Object.fromEntries(
    (fields ?? []).map((field) => [
      field.name,
      (field.default ?? null) as JsonValue,
    ]),
  );
  return editDocument([
    {
      op: 'insert',
      scene: sceneId,
      parent: null,
      index: null,
      node: {
        type: 'element',
        id,
        kind,
        frame: {
          x: Math.round(at.x),
          y: Math.round(at.y),
          width: defaultSize.width,
          height: defaultSize.height,
          rotation: 0,
        },
        values,
      },
    },
  ]).then((result) => (result?.status === 'committed' ? id : null));
};

/** 지우기 - 다 고른 트리 그룹은 그룹째 지운다 */
export const removeDocumentElements = (
  sceneId: string,
  ids: string[],
  options?: { gestureId?: string },
) => {
  const roots = documentGroupRoots(
    getElementDocumentStore()?.getScene(sceneId),
    ids,
  );
  return editDocument(
    [{ op: 'remove', scene: sceneId, ids: roots.length > 0 ? roots : ids }],
    options,
  );
};

export const setDocumentFrame = (
  sceneId: string,
  id: string,
  frame: FramePatch,
) => editDocument([{ op: 'setFrame', scene: sceneId, id, frame }]);

/** 여러 요소 위치를 한 커밋으로 - 되돌리기도 한 번 */
export const moveDocumentElements = (
  sceneId: string,
  moves: ReadonlyArray<{ id: string; x: number; y: number }>,
  options?: { gestureId?: string },
) =>
  moves.length === 0
    ? Promise.resolve(null)
    : editDocument(
        moves.map(({ id, x, y }) => ({
          op: 'setFrame' as const,
          scene: sceneId,
          id,
          frame: { x, y },
        })),
        options,
      );

export const setDocumentValues = (
  sceneId: string,
  id: string,
  values: Record<string, JsonValue>,
  frame?: FramePatch,
) =>
  editDocument([
    { op: 'setValues', scene: sceneId, id, values },
    ...(frame ? [{ op: 'setFrame' as const, scene: sceneId, id, frame }] : []),
  ]);

export const setDocumentBundle = (
  sceneId: string,
  id: string,
  bundle: string,
  fields: Record<string, JsonValue>,
) => editDocument([{ op: 'setBundle', scene: sceneId, id, bundle, fields }]);

export const setDocumentCommon = (
  sceneId: string,
  id: string,
  common: { name?: string | null; hidden?: boolean },
) => editDocument([{ op: 'setCommon', scene: sceneId, id, ...common }]);

/** 겹치는 순서 - 부모 안 맨 위(목록 끝) 또는 맨 아래(목록 앞). 그룹 소속은 지킨다(옛 종류와 같다) */
export const moveDocumentElementTo = (
  sceneId: string,
  ids: string[],
  place: 'front' | 'back',
  options?: { gestureId?: string },
) => {
  const scene = getElementDocumentStore()?.getScene(sceneId);
  const roots = documentGroupRoots(scene, ids);
  const byParent = new Map<string | null, string[]>();
  for (const id of roots.length > 0 ? roots : ids) {
    const parent = documentParentOf(scene, id);
    if (parent === undefined) continue;
    byParent.set(parent, [...(byParent.get(parent) ?? []), id]);
  }
  if (byParent.size === 0) return Promise.resolve(null);
  return editDocument(
    [...byParent].map(([parent, members]) => ({
      op: 'move' as const,
      scene: sceneId,
      ids: members,
      parent,
      index: place === 'front' ? null : 0,
    })),
    options,
  );
};

// 부모의 자식 id 목록 (null이면 장면 맨 위)
const childIdsOf = (scene: Scene | undefined, parent: string | null) => {
  if (!scene) return [];
  if (parent === null) return scene.nodes.map((node) => node.id);
  let found: string[] = [];
  const visit = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      if (node.type !== 'group') continue;
      if (node.id === parent) {
        found = node.children.map((child) => child.id);
        return;
      }
      visit(node.children);
    }
  };
  visit(scene.nodes);
  return found;
};

/** 한 칸 앞·뒤로 - 부모 안에서 바로 위·아래 형제를 넘는다. 함께 고른 것끼리는 넘지 않는다 */
export const stepDocumentElements = (
  sceneId: string,
  ids: string[],
  direction: 'forward' | 'backward',
) => {
  const scene = getElementDocumentStore()?.getScene(sceneId);
  const roots = documentGroupRoots(scene, ids);
  const picked = new Set(roots.length > 0 ? roots : ids);
  const parents = new Set<string | null>();
  for (const id of picked) {
    const parent = documentParentOf(scene, id);
    if (parent !== undefined) parents.add(parent);
  }
  const ops: Op[] = [];
  for (const parent of parents) {
    const order = childIdsOf(scene, parent);
    // 앞으로는 위(목록 끝)부터, 뒤로는 아래부터 옮겨야 서로의 자리에 영향이 없다
    const indices = order.map((_, index) => index);
    if (direction === 'forward') indices.reverse();
    for (const index of indices) {
      const id = order[index];
      const neighbor = direction === 'forward' ? index + 1 : index - 1;
      if (!picked.has(id) || neighbor < 0 || neighbor >= order.length) {
        continue;
      }
      if (picked.has(order[neighbor])) continue;
      // 자리는 옮기기 전 목록 기준 - 앞으로는 이웃 다음, 뒤로는 이웃 자리
      const target = direction === 'forward' ? index + 2 : index - 1;
      ops.push({
        op: 'move',
        scene: sceneId,
        ids: [id],
        parent,
        index: target >= order.length ? null : target,
      });
      order.splice(index, 1);
      order.splice(direction === 'forward' ? index + 1 : index - 1, 0, id);
    }
  }
  return ops.length === 0 ? Promise.resolve(null) : editDocument(ops);
};

/** 고른 요소를 묶는다 - 묶는 방식은 documentGroupOps (옛 모양이 그룹 안 그룹을 못 나타내는 경우 포함) */
export const groupDocumentElements = (
  sceneId: string,
  ids: readonly string[],
  baseLabel: string,
) => {
  const scene = getElementDocumentStore()?.getScene(sceneId);
  const ops = documentGroupOps(scene, sceneId, ids, {
    id: crypto.randomUUID(),
    name: buildNextLayerGroupName(baseLabel, documentGroupNames(scene)),
  });
  return ops ? editDocument(ops) : Promise.resolve(null);
};

/** 고른 요소가 들어 있는 가장 바깥 그룹을 푼다 */
export const ungroupDocumentElements = (
  sceneId: string,
  ids: readonly string[],
) => {
  const groups = documentGroupsOf(
    getElementDocumentStore()?.getScene(sceneId),
    ids,
  );
  if (groups.length === 0) return Promise.resolve(null);
  return editDocument(
    groups.map((id) => ({ op: 'ungroup' as const, scene: sceneId, id })),
  );
};

export type StructureAction = 'front' | 'back' | 'forward' | 'backward';

/** 겹침 순서 - 맨 앞·뒤는 부모 안 끝, 한 칸은 바로 옆 형제를 넘는다 (옛 종류·플러그인·트리 전용 요소 함께) */
export const runStructureAction = (
  sceneId: string,
  ids: string[],
  action: StructureAction,
  options?: { gestureId?: string },
) =>
  action === 'front' || action === 'back'
    ? moveDocumentElementTo(sceneId, ids, action, options)
    : stepDocumentElements(sceneId, ids, action);
