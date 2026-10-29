// 트리 문서 편집 동작 - 백엔드에 커밋하고 반영된 결과를 돌려준다
import type { ElementDocumentCommitResult } from '@api/modules/editor/elementDocumentApi';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import { elementKindData } from '@src/renderer/elementKinds/defineElementKind';
import type {
  FramePatch,
  JsonValue,
  Op,
} from '@src/types/generated/elementDocument';

const report = (result: ElementDocumentCommitResult) => {
  if (result.status === 'committed') return;
  console.error('[ElementDocument] edit was not applied', result);
};

export const editDocument = async (
  ops: Op[],
): Promise<ElementDocumentCommitResult | null> => {
  const store = getElementDocumentStore();
  if (!store?.edit) return null;
  try {
    const result = await store.edit(ops);
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

export const removeDocumentElements = (sceneId: string, ids: string[]) =>
  editDocument([{ op: 'remove', scene: sceneId, ids }]);

export const setDocumentFrame = (
  sceneId: string,
  id: string,
  frame: FramePatch,
) => editDocument([{ op: 'setFrame', scene: sceneId, id, frame }]);

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

/** 같은 장면에 복제 - 오른쪽 아래로 조금 비켜 놓는다 */
export const duplicateDocumentElement = (sceneId: string, id: string) => {
  const element = getElementDocumentStore()?.getElement(sceneId, id);
  if (!element) return Promise.resolve(null);
  const copyId = newId();
  return editDocument([
    {
      op: 'insert',
      scene: sceneId,
      parent: null,
      index: null,
      node: {
        ...element,
        id: copyId,
        frame: {
          ...element.frame,
          x: element.frame.x + 20,
          y: element.frame.y + 20,
        },
      },
    },
  ]).then((result) => (result?.status === 'committed' ? copyId : null));
};

/** 겹치는 순서 - 맨 위(목록 끝) 또는 맨 아래(목록 앞) */
export const moveDocumentElementTo = (
  sceneId: string,
  id: string,
  place: 'front' | 'back',
) =>
  editDocument([
    {
      op: 'move',
      scene: sceneId,
      ids: [id],
      parent: null,
      index: place === 'front' ? null : 0,
    },
  ]);
