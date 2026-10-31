import type { EditorElementTypeV1, EditorOpV1 } from '@src/types/editor';
import { TREE_EDITED_KINDS } from '@src/types/elementKinds';
import type { FramePatch } from '@src/types/generated/elementDocument';
import { useKeyStore } from '@stores/data/useKeyStore';
import { previewApi } from '@api/modules/editor/previewApi';
import { markGestureSessionsDiscarded } from '../gesture/gestureSessionLifecycle';
import { previewOverlay } from '../gesture/previewOverlay';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { treeRoutedOps } from './treeRoutedOps';
import { withResizeValues } from '@src/renderer/elementKinds/runtime/resizeValues';
import { legacyFieldPatch } from '@src/renderer/elementKinds/runtime/legacyFieldPatch';
import {
  legacyPatchOps,
  legacyPositionOf,
} from '@src/renderer/elementKinds/runtime/legacyPosition';
import { treeEditorDocument } from '@src/renderer/elementKinds/runtime/treeEditorDocument';
import {
  ElementEditHeldError,
  type ElementDocumentStore,
  type StagedEdit,
} from '@src/renderer/editor/document/elementDocumentStore';
import type { ElementDocumentCommitResult } from '@api/modules/editor/elementDocumentApi';
import type { Op } from '@src/types/generated/elementDocument';
import type { CanonicalEditorDocumentV1 } from '@src/types/editor';
import type { PropertyIntents } from '../intent/elementIntent';
import { reportElementOpSkipped } from '../intent/elementIntent';
import { trackEditorWrite } from '../lifecycle/editorWriteBarrier';
import type { EditorOpResultV1 } from '@src/types/editor';

export interface EditorSemanticCommitOutcome {
  document: CanonicalEditorDocumentV1;
  opResults: EditorOpResultV1[];
}

export interface EditorSemanticCommitMeta {
  gestureId?: string;
  onEnrolled?: () => void;
  preflight?: () => void;
}

export type EditorSemanticOpsGenerator = (
  base: CanonicalEditorDocumentV1,
) => readonly EditorOpV1[] | null;

// 지금 옛 칸 보기 - 트리 값(트리 낙관 적용 포함, 미리보기 제외)
const viewPositionOf = (
  _type: EditorElementTypeV1,
  id: string,
  scene: string,
  store: ElementDocumentStore,
) =>
  legacyPositionOf(store.getElement(scene, id)!) as Record<string, unknown> & {
    id: string;
  };

// 트리로 보낼 겉모습 칸 패치 - 옛 패널과 같은 칸 규칙으로 바뀌는 옛 칸을 구하고, 모두 트리에 자리가 있을 때만
const treeStylePatchOf = (
  op: EditorOpV1,
  scene: string,
  store: ElementDocumentStore,
): { fields: Record<string, unknown>; ops: Op[] } | null => {
  if (op.kind !== 'patchElement' || !TREE_EDITED_KINDS.has(op.elementType)) {
    return null;
  }
  const element = store.getElement(scene, op.id);
  if (!element) return null;
  const fields = legacyFieldPatch(
    op.elementType,
    viewPositionOf(op.elementType, op.id, scene, store),
    op.patch,
  );
  const { ops, uncovered } = legacyPatchOps(scene, element, fields);
  return uncovered.length === 0 && ops.length > 0 ? { fields, ops } : null;
};

// 요소가 있는 장면 - 지금 탭부터 (커밋 사이에 탭을 바꿔도 그 요소의 장면으로 보낸다)
const sceneOfElement = (store: ElementDocumentStore, id: string) => {
  const current = useKeyStore.getState().selectedKeyType;
  if (store.getElement(current, id)) return current;
  return store.getSceneIds().find((scene) => store.getElement(scene, id));
};

// 트리로 갈 몫 - 트리에 있는 옛 종류 요소의 연산
const routeForTree = (
  ops: readonly EditorOpV1[],
  store: ElementDocumentStore,
) =>
  treeRoutedOps(ops, {
    isTreeEdited: (type) => TREE_EDITED_KINDS.has(type),
    sceneOf: (id) => sceneOfElement(store, id),
    styleOps: (op, scene) => treeStylePatchOf(op, scene, store)?.ops ?? null,
  });

// 트리 변경 이벤트를 놓쳐도 종료·패널 붙이기 같은 쓰기 대기가 끝없이 멈추지 않게
const REFLECT_TIMEOUT_MS = 3000;

// 이 창의 트리 스토어가 그 revision의 변경을 받은 뒤 - 분리된 패널의 미리보기 취소가 반영보다 앞서지 않게
const whenTreeCaughtUp = (store: ElementDocumentStore, revision: number) =>
  new Promise<void>((resolve) => {
    if (store.getRevision() >= revision) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const timer = setTimeout(done, REFLECT_TIMEOUT_MS);
    const unsubscribe = store.subscribe(() => {
      if (store.getRevision() >= revision) done();
    });
  });

// 트리 편집 보내기 - 트리 스토어가 낙관 적용하고, 반영된 뒤 끝난다.
// 거부·실패는 오류로 올린다(호출자가 알린다) - 옛 경로로 다시 보내면 뒤에 줄 선 편집을 덮을 수 있다
const sendTreeEdit = async (
  store: ElementDocumentStore,
  treeOps: Op[],
  gestureId: string | undefined,
  // 크기가 바뀌면 함께 맞출 값(스프라이트 이동값 비례) - 크기 조절만. 옛 필드 패치는 맞추지 않았다
  resizeValues = true,
): Promise<void> => {
  let result: ElementDocumentCommitResult;
  try {
    result = await store.edit!(
      // 크기와 함께 맞출 값(스프라이트 이동값 등)도 같은 커밋에
      resizeValues ? withResizeValues(treeOps) : treeOps,
      gestureId ? { gestureId } : undefined,
    );
  } catch (error) {
    // 보류한 편집은 화면에 남고 스토어가 다시 보낸다 - 동작은 끝난 것으로 둬야 다시 확정해 겹쳐 쌓지 않는다
    if (error instanceof ElementEditHeldError) return;
    throw error;
  }
  if (result.status !== 'committed') {
    // 다시 해도 받지 않는 거절이면 이 동작의 미리보기를 버린다 (되돌리기 중은 다시 할 수 있다)
    if (gestureId && result.code !== 'HISTORY_IN_PROGRESS') {
      markGestureSessionsDiscarded([gestureId]);
      previewOverlay.endSessions([gestureId]);
      previewApi.cancel(gestureId).catch(() => {});
    }
    throw new Error(`[ElementDocument] edit rejected: ${result.code}`);
  }
  await whenTreeCaughtUp(store, result.revision);
};

/** 다른 통로(제스처 커밋)로 보내는 옛 모양 연산의 트리 몫을 화면에 먼저 얹는다 - 트리 몫이 없으면 null */
export const stageSemanticOps = (
  ops: readonly EditorOpV1[],
): StagedEdit | null => {
  const store = getElementDocumentStore();
  if (!store?.stage || ops.length === 0) return null;
  const { treeOps } = routeForTree(ops, store);
  return treeOps.length > 0 ? store.stage(withResizeValues(treeOps)) : null;
};

/** 트리로 옮긴 종류 요소 하나의 옛 칸 패치를 트리로 - 지금 장면 트리에 있고 칸이 모두 트리에 자리가 있을 때만.
 * 아니면 null (호출자가 옛 경로로). current는 대기 편집까지 얹은 지금 값 */
export const commitTreeLegacyFields = (
  type: EditorElementTypeV1,
  scene: string,
  id: string,
  makeFields: (
    current: Record<string, unknown>,
  ) => Record<string, unknown> | null,
  gestureId?: string,
): Promise<'committed' | 'skipped'> | null => {
  if (!TREE_EDITED_KINDS.has(type)) return null;
  const store = getElementDocumentStore();
  if (!store?.edit) return null;
  const element = store.getElement(scene, id);
  if (!element) return null;
  const fields = makeFields(viewPositionOf(type, id, scene, store));
  if (!fields) return Promise.resolve('skipped');
  const { ops, uncovered } = legacyPatchOps(scene, element, fields);
  if (uncovered.length > 0) return null;
  if (ops.length === 0) return Promise.resolve('committed');
  // 옛 필드 패치처럼 이동값은 그대로 (예: 기본 이미지에 상자를 맞춰도 자세 이동값은 비례하지 않는다)
  return sendTreeEdit(store, ops, gestureId, false).then(
    () => 'committed' as const,
  );
};

/** 트리로 옮긴 종류의 틀(회전 등)을 트리에 바로 쓴다 - 시맨틱 연산이 없는 값(스프라이트 회전)용.
 * 트리로 옮긴 종류가 아니거나 트리에 없으면 null (호출자가 옛 경로로) */
export const sendTreeEditedFrame = (
  type: string,
  id: string,
  frame: FramePatch,
  gestureId?: string,
): Promise<unknown> | null => {
  if (!TREE_EDITED_KINDS.has(type)) return null;
  const store = getElementDocumentStore();
  const scene = store ? sceneOfElement(store, id) : undefined;
  if (!store?.edit || !scene) return null;
  return store.edit(
    withResizeValues([{ op: 'setFrame', scene, id, frame }]),
    gestureId ? { gestureId } : undefined,
  );
};

/** 요소별 옛 칸 값(미리보기에 쌓인 값 등)을 트리 커밋 하나로 - 트리에 있는 요소만(그 요소의 장면으로).
 * 트리에 자리가 없는 칸은 빼고 알린다. 보낼 것이 없으면 false */
export const commitPropertyIntents = (
  intents: PropertyIntents,
  gestureId?: string,
): Promise<boolean> => {
  const store = getElementDocumentStore();
  if (!store?.edit) return Promise.resolve(false);
  const ops: Op[] = [];
  let skipped = false;
  for (const byId of intents.values()) {
    for (const [id, fields] of byId) {
      const scene = sceneOfElement(store, id);
      const element = scene ? store.getElement(scene, id) : undefined;
      if (!scene || !element) {
        skipped = true;
        continue;
      }
      const patch = legacyPatchOps(scene, element, fields);
      if (patch.uncovered.length > 0) skipped = true;
      ops.push(...patch.ops);
    }
  }
  if (skipped)
    reportElementOpSkipped('property intents outside the element tree');
  if (ops.length === 0) return Promise.resolve(false);
  const committed = sendTreeEdit(store, ops, gestureId).then(() => true);
  trackEditorWrite(committed).catch(() => undefined);
  return committed;
};

/** 편집 의도의 바탕 - 트리 문서의 옛 편집 문서 모양 (트리 낙관 반영 포함, 미리보기 없음) */
export const captureEditorDocument = (): CanonicalEditorDocumentV1 => {
  const store = getElementDocumentStore();
  return store
    ? treeEditorDocument(store)
    : treeEditorDocument({ getSceneIds: () => [], getScene: () => undefined });
};

/** 옛 편집 연산을 트리로 - 지금 장면 트리에 있는 옛 종류 요소의 위치·회전·숨김·이름·지우기·겉모습 칸.
 * 트리로 못 보내는 몫(다른 장면·트리에 없는 요소·트리에 자리가 없는 칸)은 적용하지 않고 targetMissing으로 알린다.
 * 트리 스토어가 낙관 반영하고, 반영된 뒤 끝난다. 거부·실패는 오류로 올린다(호출자가 알린다) */
export const commitSemanticOps = (
  ops: readonly EditorOpV1[],
  meta?: EditorSemanticCommitMeta,
): Promise<EditorSemanticCommitOutcome> => {
  const run = async (): Promise<EditorSemanticCommitOutcome> => {
    meta?.preflight?.();
    const store = getElementDocumentStore();
    const { treeOps, legacyIndexes } = store?.edit
      ? routeForTree(ops, store)
      : { treeOps: [], legacyIndexes: new Set(ops.map((_op, index) => index)) };
    if (legacyIndexes.size > 0) {
      reportElementOpSkipped('editor ops outside the element tree');
    }
    meta?.onEnrolled?.();
    if (store && treeOps.length > 0) {
      await sendTreeEdit(store, treeOps, meta?.gestureId);
    }
    return {
      document: captureEditorDocument(),
      opResults: ops.map((_op, index) =>
        legacyIndexes.has(index)
          ? { status: 'targetMissing' as const }
          : { status: 'applied' as const },
      ),
    };
  };
  const committed = run();
  // 기록·종료 경계가 이 쓰기를 기다린다
  trackEditorWrite(committed).catch(() => undefined);
  return committed;
};

/** 지금 바탕으로 연산을 만들어 커밋 - 만들 것이 없으면 null (바탕은 트리 낙관 반영까지 본다) */
export const commitGeneratedSemanticOps = (
  generate: EditorSemanticOpsGenerator,
  meta?: EditorSemanticCommitMeta,
): Promise<EditorSemanticCommitOutcome | null> => {
  try {
    const ops = generate(captureEditorDocument());
    return ops ? commitSemanticOps(ops, meta) : Promise.resolve(null);
  } catch (error) {
    return Promise.reject(error);
  }
};
