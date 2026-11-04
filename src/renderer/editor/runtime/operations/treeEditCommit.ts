// 트리 편집 커밋 입구 - 부르는 순간 지금 값으로 연산을 만들어 트리 스토어가 낙관 적용하고, 이 창에 반영된 뒤 끝난다.
// 거부·실패는 오류로 올린다(호출자가 알린다) - 다른 경로로 다시 보내면 뒤에 줄 선 편집을 덮을 수 있다
import { previewApi } from '@api/modules/editor/previewApi';
import type { ElementDocumentCommitResult } from '@api/modules/editor/elementDocumentApi';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  ElementEditHeldError,
  type ElementDocumentStore,
} from '@src/renderer/editor/document/elementDocumentStore';
import {
  fieldPatchOps,
  panelFieldViewOf,
  type PanelFieldView,
} from '@src/renderer/elementKinds/runtime/fieldView';
import { propertyPatchOps } from '@src/renderer/elementKinds/runtime/propertyPatchOps';
import { withResizeValues } from '@src/renderer/elementKinds/runtime/resizeValues';
import type { EditorElementPropertyPatchV1 } from '@src/types/editor';
import { TREE_EDITED_KINDS } from '@src/types/elementKinds';
import type { FramePatch, Op } from '@src/types/generated/elementDocument';
import { useKeyStore } from '@stores/data/useKeyStore';
import { markGestureSessionsDiscarded } from '../gesture/gestureSessionLifecycle';
import { previewOverlay } from '../gesture/previewOverlay';
import {
  reportElementOpSkipped,
  type PropertyIntents,
} from '../intent/elementIntent';
import { trackEditorWrite } from '../lifecycle/editorWriteBarrier';

export type TreeCommitStatus = 'applied' | 'targetMissing';

export interface TreeCommitTarget {
  elementType: string;
  id: string;
}

export interface TreeCommitOptions {
  gestureId?: string;
  preflight?: () => void;
}

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

// 다시 해도 받지 않는 실패 - 이 동작의 미리보기를 버린다
const discardGesture = (gestureId: string) => {
  markGestureSessionsDiscarded([gestureId]);
  previewOverlay.endSessions([gestureId]);
  previewApi.cancel(gestureId).catch(() => {});
};

/** 트리 편집 보내기 - 트리 스토어가 낙관 적용하고, 반영된 뒤 끝난다. 보류한 편집은 끝난 것으로 둔다 */
export const sendTreeEdit = async (
  store: ElementDocumentStore,
  treeOps: Op[],
  gestureId: string | undefined,
  // 크기가 바뀌면 함께 맞출 값(스프라이트 이동값 비례) - 크기 조절만. 칸 패치는 맞추지 않는다
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
    // 되돌린 실패 - 거절과 같이 이 동작을 버려 다음 정산이 같은 실패(안내)를 되풀이하지 않게
    if (gestureId) discardGesture(gestureId);
    throw error;
  }
  if (result.status !== 'committed') {
    // 다시 해도 받지 않는 거절이면 이 동작의 미리보기를 버린다 (되돌리기 중은 다시 할 수 있다)
    if (gestureId && result.code !== 'HISTORY_IN_PROGRESS') {
      discardGesture(gestureId);
    }
    throw new Error(`[ElementDocument] edit rejected: ${result.code}`);
  }
  await whenTreeCaughtUp(store, result.revision);
};

/** 요소가 있는 장면 - 지금 탭부터 (커밋 사이에 탭을 바꿔도 그 요소의 장면으로 보낸다) */
export const sceneOfElement = (store: ElementDocumentStore, id: string) => {
  const current = useKeyStore.getState().selectedKeyType;
  if (store.getElement(current, id)) return current;
  return store.getSceneIds().find((scene) => store.getElement(scene, id));
};

// 대상마다 트리 연산을 만들어 커밋 하나로 - 트리에 있는 옛 종류 요소만, 연산을 못 만들면 그 대상은 targetMissing
const commitPerTarget = <T extends TreeCommitTarget>(
  targets: readonly T[],
  opsOf: (scene: string, element: ElementNode, target: T) => Op[] | null,
  options: TreeCommitOptions,
): Promise<TreeCommitStatus[]> => {
  const run = async () => {
    options.preflight?.();
    const store = getElementDocumentStore();
    const treeOps: Op[] = [];
    const statuses = targets.map((target): TreeCommitStatus => {
      const scene =
        store?.edit && TREE_EDITED_KINDS.has(target.elementType)
          ? sceneOfElement(store, target.id)
          : undefined;
      const element = scene ? store!.getElement(scene, target.id) : undefined;
      const ops = scene && element ? opsOf(scene, element, target) : null;
      if (!ops) return 'targetMissing';
      treeOps.push(...ops);
      return 'applied';
    });
    if (statuses.includes('targetMissing')) {
      reportElementOpSkipped('editor ops outside the element tree');
    }
    if (store && treeOps.length > 0) {
      await sendTreeEdit(store, treeOps, options.gestureId);
    }
    return statuses;
  };
  const committed = run();
  // 기록·종료 경계가 이 쓰기를 기다린다
  trackEditorWrite(committed).catch(() => undefined);
  return committed;
};

/** 같은 속성 패치를 대상마다 - 트리 커밋 하나. 칸 규칙은 propertyPatchOps (바뀌는 칸이 없거나
 * 트리에 자리가 없는 칸이 섞인 대상은 고치지 않고 targetMissing) */
export const commitPropertyPatch = (
  targets: readonly TreeCommitTarget[],
  patch: EditorElementPropertyPatchV1,
  options: TreeCommitOptions = {},
): Promise<TreeCommitStatus[]> =>
  commitPerTarget(
    targets,
    (scene, element) => propertyPatchOps(scene, element, patch),
    options,
  );

/** 틀(위치·크기·회전)을 대상마다 - 트리 커밋 하나. 크기가 바뀌면 함께 맞출 값(스프라이트 자세 이동값 비례)도 같은 커밋에 */
export const commitFrames = (
  targets: readonly (TreeCommitTarget & { frame: FramePatch })[],
  options: TreeCommitOptions = {},
): Promise<TreeCommitStatus[]> =>
  commitPerTarget(
    targets,
    (scene, element, { frame }) => [
      { op: 'setFrame', scene, id: element.id, frame },
    ],
    options,
  );

/** 요소 하나의 칸 패치 - 지금 칸 보기(대기 편집 포함)로 칸을 만들어 트리로. 트리에 없거나 트리에 자리가 없는
 * 칸이 섞이면 null(부르는 쪽이 정한다), 만들 칸이 없으면 skipped. resizeValues - 크기와 함께 맞출 값을 비례할지 */
export const commitFieldPatch = (
  target: TreeCommitTarget & { scene: string },
  makeFields: (current: PanelFieldView) => Record<string, unknown> | null,
  options: { gestureId?: string; resizeValues: boolean },
): Promise<'committed' | 'skipped'> | null => {
  if (!TREE_EDITED_KINDS.has(target.elementType)) return null;
  const store = getElementDocumentStore();
  if (!store?.edit) return null;
  const element = store.getElement(target.scene, target.id);
  if (!element) return null;
  const fields = makeFields(panelFieldViewOf(element));
  if (!fields) return Promise.resolve('skipped');
  const { ops, unowned } = fieldPatchOps(target.scene, element, fields);
  if (unowned.length > 0) return null;
  if (ops.length === 0) return Promise.resolve('committed');
  return sendTreeEdit(store, ops, options.gestureId, options.resizeValues).then(
    () => 'committed' as const,
  );
};

/** 요소별 칸 값(미리보기에 쌓인 값 등)을 트리 커밋 하나로 - 트리에 있는 요소만(그 요소의 장면으로).
 * 트리에 자리가 없는 칸은 빼고 알린다. 보낼 것이 없으면 false */
export const commitPreviewIntents = (
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
      const patch = fieldPatchOps(scene, element, fields);
      if (patch.unowned.length > 0) skipped = true;
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
