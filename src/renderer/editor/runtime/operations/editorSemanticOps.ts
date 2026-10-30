import { enqueueEditorCompatibilityOperation } from '../lifecycle/editorCompatibilityQueue';

import type { EditorOpV1 } from '@src/types/editor';
import { TREE_EDITED_KINDS } from '@src/types/elementKinds';
import type { FramePatch } from '@src/types/generated/elementDocument';
import { useKeyStore } from '@stores/data/useKeyStore';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  captureEditorDocument,
  editorCoordinator,
} from '../coordinator/editorStateCoordinator';
import { treeRoutedOps } from './treeRoutedOps';
import { withResizeValues } from '@src/renderer/elementKinds/runtime/resizeValues';
import { legacyFieldPatch } from '@src/renderer/elementKinds/runtime/legacyFieldPatch';
import {
  legacyPatchOps,
  legacyPositionOf,
} from '@src/renderer/elementKinds/runtime/legacyPosition';
import { readAuthorityPositions } from '../../model/elementStores';
import {
  addPendingTreeEdit,
  composePendingTreeEdits,
} from '../gesture/pendingTreeEdits';
import { PREVIEW_DOMAIN_BY_ELEMENT_TYPE } from '@src/types/preview';
import type { ElementDocumentStore } from '@src/renderer/editor/document/elementDocumentStore';
import type { Op } from '@src/types/generated/elementDocument';
import type { PropertyIntents } from '../intent/elementIntent';
import type {
  EditorSemanticCommitMeta,
  EditorSemanticCommitOutcome,
  EditorSemanticOpsGenerator,
} from '../coordinator/editorCoordinator';

type PatchElementOp = Extract<EditorOpV1, { kind: 'patchElement' }>;

// 지금 옛 칸 보기 - canonical에 대기 중인 트리 편집을 얹은 값(미리보기 제외). 옛 컬렉션에 아직 없으면 트리 값
const viewPositionOf = (
  op: PatchElementOp,
  scene: string,
  store: ElementDocumentStore,
) => {
  const positions = composePendingTreeEdits(
    PREVIEW_DOMAIN_BY_ELEMENT_TYPE[op.elementType],
    readAuthorityPositions(op.elementType) as unknown as Record<
      string,
      { id: string }[]
    >,
  )[scene];
  const element = store.getElement(scene, op.id)!;
  return (positions?.find(({ id }) => id === op.id) ??
    legacyPositionOf(element)) as Record<string, unknown> & { id: string };
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
    viewPositionOf(op, scene, store),
    op.patch,
  );
  const { ops, uncovered } = legacyPatchOps(scene, element, fields);
  return uncovered.length === 0 && ops.length > 0 ? { fields, ops } : null;
};

// 트리로 갈 몫 - 커밋 나누기와 옛 스토어 먼저 쓰기 거르기가 같은 판정을 쓴다
const routeForTree = (
  ops: readonly EditorOpV1[],
  scene: string,
  store: ElementDocumentStore,
) =>
  treeRoutedOps(ops, {
    scene,
    isTreeEdited: (type) => TREE_EDITED_KINDS.has(type),
    inScene: (id) => store.getElement(scene, id) !== undefined,
    styleOps: (op) => treeStylePatchOf(op, scene, store)?.ops ?? null,
  });

// 트리로 가는 옛 칸 패치 - 그 몫은 대기 중인 트리 편집이 얹는다
const treeRoutedPatches = (
  ops: readonly EditorOpV1[],
  legacyIndexes: ReadonlySet<number>,
) =>
  ops.filter(
    (op, index): op is PatchElementOp =>
      op.kind === 'patchElement' && !legacyIndexes.has(index),
  );

/** 옛 스토어에 먼저 쓸 의도에서 트리로 갈 옛 칸 패치의 요소를 뺀다 - 그 몫은 대기 중인 트리 편집이 얹는다
 * (옛 스토어에 쓰면 코디네이터가 옛 편집으로 보고 다시 커밋하거나 되감기 소유가 틀어진다) */
export const withoutTreeRoutedIntents = (
  intents: PropertyIntents,
  ops: readonly EditorOpV1[],
): PropertyIntents => {
  const store = getElementDocumentStore();
  if (TREE_EDITED_KINDS.size === 0 || !store?.edit) return intents;
  const scene = useKeyStore.getState().selectedKeyType;
  const { legacyIndexes } = routeForTree(ops, scene, store);
  const routed = new Set(
    treeRoutedPatches(ops, legacyIndexes).map(({ id }) => id),
  );
  if (routed.size === 0) return intents;
  return new Map(
    [...intents].map(([type, byId]) => [
      type,
      new Map([...byId].filter(([id]) => !routed.has(id))),
    ]),
  );
};

// 트리 변경 이벤트를 놓쳐도 종료·패널 붙이기 같은 쓰기 대기가 끝없이 멈추지 않게
const REFLECT_TIMEOUT_MS = 3000;

// 트리 스토어가 그 revision의 변경을 받고(백엔드는 옛 편집 이벤트를 먼저 보낸다) 코디네이터가 그 이벤트를
// 스토어에 반영한 뒤 - 대기 중인 트리 편집을 내려도 옛 스토어가 같은 값을 보여 준다
const whenLegacyCaughtUp = (store: ElementDocumentStore, revision: number) =>
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
  }).then(() => editorCoordinator.whenEventsApplied());

// 트리로 옮긴 옛 종류의 위치·회전·숨김·이름·지우기·겉모습 칸은 트리에 쓴다 (낙관 반영 - 편집 화면이 트리에서 그린다)
const splitForTree = (ops: readonly EditorOpV1[]) => {
  if (TREE_EDITED_KINDS.size === 0) return null;
  const store = getElementDocumentStore();
  if (!store?.edit) return null;
  const scene = useKeyStore.getState().selectedKeyType;
  const { treeOps, legacyIndexes } = routeForTree(ops, scene, store);
  if (treeOps.length === 0) return null;
  const pending = treeRoutedPatches(ops, legacyIndexes).map((op) => ({
    op,
    fields: legacyFieldPatch(
      op.elementType,
      viewPositionOf(op, scene, store),
      op.patch,
    ),
  }));
  // 옛 스토어가 같은 값을 받을 때까지 - 옛 편집 커밋처럼 반영된 뒤 끝난다.
  // 거부·실패는 오류로 올린다(호출자가 알린다) - 옛 경로로 다시 보내면 뒤에 줄 선 편집을 덮을 수 있다
  const send = async (gestureId: string | undefined): Promise<void> => {
    // 옛 스토어를 읽는 곳도 확인 전까지 보낸 값을 보도록
    const releases = pending.map(({ op, fields }) =>
      addPendingTreeEdit(
        PREVIEW_DOMAIN_BY_ELEMENT_TYPE[op.elementType],
        scene,
        op.id,
        fields,
      ),
    );
    try {
      const result = await store.edit!(
        // 크기와 함께 맞출 값(스프라이트 이동값 등)도 같은 커밋에
        withResizeValues(treeOps),
        gestureId ? { gestureId } : undefined,
      );
      if (result.status !== 'committed') {
        throw new Error(`[ElementDocument] edit rejected: ${result.code}`);
      }
      await whenLegacyCaughtUp(store, result.revision);
    } finally {
      releases.forEach((release) => release());
    }
  };
  return {
    send,
    legacyIndexes,
    legacyOps: ops.filter((_op, index) => legacyIndexes.has(index)),
  };
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
  const scene = useKeyStore.getState().selectedKeyType;
  if (!store?.edit || !store.getElement(scene, id)) return null;
  return store.edit(
    withResizeValues([{ op: 'setFrame', scene, id, frame }]),
    gestureId ? { gestureId } : undefined,
  );
};

const treeRoutedOutcome = (
  ops: readonly EditorOpV1[],
  legacyIndexes: ReadonlySet<number>,
  legacy: EditorSemanticCommitOutcome | null,
): EditorSemanticCommitOutcome => {
  let legacyCursor = 0;
  return {
    document: legacy?.document ?? captureEditorDocument(),
    opResults: ops.map((_op, index) =>
      legacyIndexes.has(index)
        ? legacy?.opResults[legacyCursor++] ?? { status: 'targetMissing' }
        : { status: 'applied' },
    ),
  };
};

export const commitSemanticOps = (
  ops: readonly EditorOpV1[],
  meta?: EditorSemanticCommitMeta,
): Promise<EditorSemanticCommitOutcome> => {
  const split = splitForTree(ops);
  if (!split) return commitSemanticOpsDirect(ops, meta);
  // 트리 몫도 반영된 뒤 끝난다 - 미리보기 정리(분리된 패널의 취소 등)가 반영보다 앞서지 않게
  if (split.legacyOps.length === 0) {
    return split
      .send(meta?.gestureId)
      .then(() => treeRoutedOutcome(ops, split.legacyIndexes, null));
  }
  // 트리 몫과 옛 몫이 같은 동작 id - 되돌리기 한 번
  const gestureId = meta?.gestureId ?? crypto.randomUUID();
  const tree = split.send(gestureId);
  // 옛 몫이 먼저 실패해도 트리 몫 오류가 처리되지 않은 채 남지 않게 (기다리면 그대로 올라온다)
  tree.catch(() => undefined);
  return commitSemanticOpsDirect(split.legacyOps, { ...meta, gestureId }).then(
    async (legacy) => {
      await tree;
      return treeRoutedOutcome(ops, split.legacyIndexes, legacy);
    },
  );
};

const commitSemanticOpsDirect = (
  ops: readonly EditorOpV1[],
  meta?: EditorSemanticCommitMeta,
): Promise<EditorSemanticCommitOutcome> => {
  let enrolled = false;
  const run = enqueueEditorCompatibilityOperation(() =>
    editorCoordinator.commitSemanticOpsInternal(ops, {
      ...meta,
      onEnrolled: () => {
        enrolled = true;
        meta?.onEnrolled?.();
      },
    }),
  );
  if (!meta?.gestureId) return run;
  return run.catch((error) => {
    if (!enrolled) {
      editorCoordinator.discardSemanticGesture(meta.gestureId!);
    }
    throw error;
  });
};

export const commitGeneratedSemanticOps = (
  generate: EditorSemanticOpsGenerator,
  meta?: EditorSemanticCommitMeta,
): Promise<EditorSemanticCommitOutcome | null> => {
  let enrolled = false;
  const slotMeta: EditorSemanticCommitMeta = {
    ...meta,
    onEnrolled: () => {
      enrolled = true;
      meta?.onEnrolled?.();
    },
  };
  // 직렬 슬롯 안에서 최신 base로 만든 연산의 트리로 옮긴 옛 종류 몫은 트리로 보내고 옛 몫만 커밋한다.
  // 트리 쓰기는 처음 만들 때 한 번만 (다시 시도는 옛 몫만). 동작 id는 연산을 만든 뒤 읽힌다
  let routed: {
    ops: readonly EditorOpV1[];
    legacyIndexes: Set<number>;
  } | null = null;
  let sentToTree = false;
  const routedGenerate: EditorSemanticOpsGenerator = (base) => {
    const ops = generate(base);
    const split = ops ? splitForTree(ops) : null;
    routed = ops && split ? { ops, legacyIndexes: split.legacyIndexes } : null;
    if (!ops || !split) return ops;
    if (split.legacyOps.length > 0) {
      slotMeta.gestureId ??= crypto.randomUUID();
    }
    if (!sentToTree) {
      sentToTree = true;
      // 직렬 슬롯 안 - 트리 반영을 기다리지 않는다
      split
        .send(slotMeta.gestureId)
        .catch((error) =>
          console.error('[ElementDocument] edit failed', error),
        );
    }
    return split.legacyOps.length > 0 ? split.legacyOps : null;
  };
  const run = enqueueEditorCompatibilityOperation(() =>
    editorCoordinator.commitGeneratedSemanticOpsInternal(
      routedGenerate,
      slotMeta,
    ),
  ).then((result) => {
    const tree = routed;
    return tree
      ? treeRoutedOutcome(tree.ops, tree.legacyIndexes, result)
      : result;
  });
  const discard = () => {
    if (!enrolled && slotMeta.gestureId) {
      editorCoordinator.discardSemanticGesture(slotMeta.gestureId);
    }
  };
  return run
    .then((result) => {
      if (!result) discard();
      return result;
    })
    .catch((error) => {
      discard();
      throw error;
    });
};
