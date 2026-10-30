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

/** 옛 스토어에 먼저 쓸 의도에서 트리로 갈 겉모습 패치의 요소를 뺀다 - 그 몫은 대기 중인 트리 편집이 얹는다
 * (옛 스토어에 쓰면 코디네이터가 옛 편집으로 보고 다시 커밋하거나 되감기 소유가 틀어진다) */
export const withoutTreeRoutedIntents = (
  intents: PropertyIntents,
  ops: readonly EditorOpV1[],
): PropertyIntents => {
  const store = getElementDocumentStore();
  if (TREE_EDITED_KINDS.size === 0 || !store?.edit) return intents;
  const scene = useKeyStore.getState().selectedKeyType;
  const routed = new Set(
    ops.flatMap((op) =>
      op.kind === 'patchElement' && treeStylePatchOf(op, scene, store)
        ? [op.id]
        : [],
    ),
  );
  if (routed.size === 0) return intents;
  return new Map(
    [...intents].map(([type, byId]) => [
      type,
      new Map([...byId].filter(([id]) => !routed.has(id))),
    ]),
  );
};

// 트리 스토어가 그 revision의 변경을 받고(백엔드는 옛 편집 이벤트를 먼저 보낸다) 코디네이터가 그 이벤트를
// 스토어에 반영한 뒤 - 대기 중인 트리 편집을 내려도 옛 스토어가 같은 값을 보여 준다
const whenLegacyCaughtUp = (store: ElementDocumentStore, revision: number) =>
  new Promise<void>((resolve) => {
    if (store.getRevision() >= revision) {
      resolve();
      return;
    }
    const unsubscribe = store.subscribe(() => {
      if (store.getRevision() < revision) return;
      unsubscribe();
      resolve();
    });
  }).then(() => editorCoordinator.whenEventsApplied());

// 트리로 옮긴 옛 종류의 위치·회전·숨김·이름·지우기·겉모습 칸은 트리에 쓴다 (낙관 반영 - 편집 화면이 트리에서 그린다)
const splitForTree = (ops: readonly EditorOpV1[]) => {
  if (TREE_EDITED_KINDS.size === 0) return null;
  const store = getElementDocumentStore();
  if (!store?.edit) return null;
  const scene = useKeyStore.getState().selectedKeyType;
  const styled: { op: PatchElementOp; fields: Record<string, unknown> }[] = [];
  const { treeOps, legacyIndexes } = treeRoutedOps(ops, {
    scene,
    isTreeEdited: (type) => TREE_EDITED_KINDS.has(type),
    inScene: (id) => store.getElement(scene, id) !== undefined,
    styleOps: (op) => {
      const style = treeStylePatchOf(op, scene, store);
      if (style)
        styled.push({ op: op as PatchElementOp, fields: style.fields });
      return style?.ops ?? null;
    },
  });
  if (treeOps.length === 0) return null;
  const send = (gestureId: string | undefined) => {
    // 옛 스토어를 읽는 곳도 확인 전까지 보낸 값을 보도록
    const releases = styled.map(({ op, fields }) =>
      addPendingTreeEdit(
        PREVIEW_DOMAIN_BY_ELEMENT_TYPE[op.elementType],
        scene,
        op.id,
        fields,
      ),
    );
    const release = () => releases.forEach((done) => done());
    void store
      // 크기와 함께 맞출 값(스프라이트 이동값 등)도 같은 커밋에
      .edit(withResizeValues(treeOps), gestureId ? { gestureId } : undefined)
      .then(async (result) => {
        if (result.status === 'committed') {
          await whenLegacyCaughtUp(store, result.revision);
          release();
          return;
        }
        release();
        // 트리가 받지 않은 겉모습 칸은 옛 경로로 다시 보낸다 - 편집을 잃지 않게
        if (styled.length > 0) {
          await commitSemanticOpsDirect(
            styled.map(({ op }) => op),
            gestureId ? { gestureId } : undefined,
          );
        }
      })
      .catch((error) => {
        release();
        console.error('[ElementDocument] edit failed', error);
      });
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
  if (split.legacyOps.length === 0) {
    split.send(meta?.gestureId);
    return Promise.resolve(treeRoutedOutcome(ops, split.legacyIndexes, null));
  }
  // 트리 몫과 옛 몫이 같은 동작 id - 되돌리기 한 번
  const gestureId = meta?.gestureId ?? crypto.randomUUID();
  split.send(gestureId);
  return commitSemanticOpsDirect(split.legacyOps, { ...meta, gestureId }).then(
    (legacy) => treeRoutedOutcome(ops, split.legacyIndexes, legacy),
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
      split.send(slotMeta.gestureId);
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
