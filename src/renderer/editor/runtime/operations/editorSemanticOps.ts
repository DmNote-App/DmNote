import { enqueueEditorCompatibilityOperation } from '../lifecycle/editorCompatibilityQueue';

import type { EditorOpV1 } from '@src/types/editor';
import { TREE_EDITED_KINDS } from '@src/types/elementKinds';
import { useKeyStore } from '@stores/data/useKeyStore';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  captureEditorDocument,
  editorCoordinator,
} from '../coordinator/editorStateCoordinator';
import { treeRoutedOps } from './treeRoutedOps';
import type {
  EditorSemanticCommitMeta,
  EditorSemanticCommitOutcome,
  EditorSemanticOpsGenerator,
} from '../coordinator/editorCoordinator';

// 트리로 옮긴 옛 종류의 위치·회전·숨김·이름·지우기는 트리에 쓴다 (낙관 반영 - 편집 화면이 트리에서 그린다)
const splitForTree = (ops: readonly EditorOpV1[]) => {
  if (TREE_EDITED_KINDS.size === 0) return null;
  const store = getElementDocumentStore();
  if (!store?.edit) return null;
  const scene = useKeyStore.getState().selectedKeyType;
  const { treeOps, legacyIndexes } = treeRoutedOps(ops, {
    scene,
    isTreeEdited: (type) => TREE_EDITED_KINDS.has(type),
    inScene: (id) => store.getElement(scene, id) !== undefined,
  });
  if (treeOps.length === 0) return null;
  const send = (gestureId: string | undefined) =>
    void store
      .edit(treeOps, gestureId ? { gestureId } : undefined)
      .catch((error) => console.error('[ElementDocument] edit failed', error));
  return {
    send,
    legacyIndexes,
    legacyOps: ops.filter((_op, index) => legacyIndexes.has(index)),
  };
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
