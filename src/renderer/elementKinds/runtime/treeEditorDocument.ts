// 트리 문서 → 옛 편집 문서 모양 - 편집 의도(위치·겉모습 칸 생성기)가 지금 값을 읽는 바탕.
// 미리보기 없음, 옛 칸은 트리에 기록된 값 그대로(겹침값·숨김), 그룹 숨김을 요소에 옮기지 않는다
import type { Node, Scene } from '@src/types/generated/elementDocument';
import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  isItemElementType,
  type CanonicalEditorDocumentV1,
  type EditorElementPositionField,
} from '@src/types/editor';
import type { KeySlot } from '@src/types/key/keys';
import type { LayerGroupDef } from '@src/types/layerGroups';
import { isTreeOnlyGroup } from '@src/renderer/editor/document/documentPatch';
import { treeKeySlot } from '@src/renderer/editor/runtime/operations/keySlotOps';
import { legacyPositionOf } from './legacyPosition';

type Positions = Array<{ id: string } & Record<string, unknown>>;

export type SceneEditorArrays = {
  keys: KeySlot[];
  layerGroups: LayerGroupDef[];
} & Record<EditorElementPositionField, Positions>;

const cache = new WeakMap<Scene, SceneEditorArrays>();

/** 장면 하나 - 트리 순서(아래→위). 장면이 같으면 같은 객체 */
export const sceneEditorArrays = (scene: Scene): SceneEditorArrays => {
  const cached = cache.get(scene);
  if (cached) return cached;
  const arrays: SceneEditorArrays = {
    keys: [],
    layerGroups: [],
    keyPositions: [],
    statPositions: [],
    graphPositions: [],
    knobPositions: [],
    spritePositions: [],
  };
  const visit = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      if (node.type === 'group') {
        // 옛 모양에 드는 그룹(옛 종류·플러그인 요소를 품은 그룹)만 옛 그룹 목록에
        if (!isTreeOnlyGroup(node)) {
          arrays.layerGroups.push({ id: node.id, name: node.name });
        }
        visit(node.children);
        continue;
      }
      if (node.kind !== 'key' && !isItemElementType(node.kind)) continue;
      const position = legacyPositionOf(node) as Positions[number];
      if (node.kind === 'key') arrays.keys.push(treeKeySlot(node) ?? '');
      arrays[EDITOR_ELEMENT_POSITION_FIELDS[node.kind]].push(position);
    }
  };
  visit(scene.nodes);
  cache.set(scene, arrays);
  return arrays;
};

interface SceneSource {
  getSceneIds(): string[];
  getScene(sceneId: string): Scene | undefined;
}

/** 모든 장면을 옛 편집 문서 하나로 (장면 객체가 같으면 장면 몫은 다시 만들지 않는다) */
export const treeEditorDocument = (
  store: SceneSource,
): CanonicalEditorDocumentV1 => {
  const document = {
    schemaVersion: 1,
    keys: {},
    keyPositions: {},
    statPositions: {},
    graphPositions: {},
    knobPositions: {},
    spritePositions: {},
    layerGroups: {},
  } as unknown as Record<string, Record<string, unknown>>;
  for (const sceneId of store.getSceneIds()) {
    const scene = store.getScene(sceneId);
    if (!scene) continue;
    const arrays = sceneEditorArrays(scene);
    for (const field of Object.keys(arrays) as Array<keyof SceneEditorArrays>) {
      document[field][sceneId] = arrays[field];
    }
  }
  return document as unknown as CanonicalEditorDocumentV1;
};
