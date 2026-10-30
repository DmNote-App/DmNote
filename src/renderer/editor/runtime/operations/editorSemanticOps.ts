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
const routeToTree = (
  ops: readonly EditorOpV1[],
  gestureId: string | undefined,
): Set<number> | null => {
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
  void store
    .edit(treeOps, gestureId ? { gestureId } : undefined)
    .catch((error) => console.error('[ElementDocument] edit failed', error));
  return legacyIndexes;
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
  const legacyIndexes = routeToTree(ops, meta?.gestureId);
  if (legacyIndexes) {
    const legacyOps = ops.filter((_op, index) => legacyIndexes.has(index));
    if (legacyOps.length === 0) {
      return Promise.resolve(treeRoutedOutcome(ops, legacyIndexes, null));
    }
    return commitSemanticOpsDirect(legacyOps, meta).then((legacy) =>
      treeRoutedOutcome(ops, legacyIndexes, legacy),
    );
  }
  return commitSemanticOpsDirect(ops, meta);
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
  // 트리로 옮긴 옛 종류가 섞였으면 지금 문서로 한 번 만들어 그 몫을 트리로 먼저 보낸다
  if (TREE_EDITED_KINDS.size > 0 && getElementDocumentStore()?.edit) {
    const ops = generate(captureEditorDocument());
    const legacyIndexes = ops ? routeToTree(ops, meta?.gestureId) : null;
    if (ops && legacyIndexes) {
      const legacyOps = ops.filter((_op, index) => legacyIndexes.has(index));
      if (legacyOps.length === 0) {
        return Promise.resolve(treeRoutedOutcome(ops, legacyIndexes, null));
      }
      return commitSemanticOpsDirect(legacyOps, meta).then((legacy) =>
        treeRoutedOutcome(ops, legacyIndexes, legacy),
      );
    }
  }
  let enrolled = false;
  const run = enqueueEditorCompatibilityOperation(() =>
    editorCoordinator.commitGeneratedSemanticOpsInternal(generate, {
      ...meta,
      onEnrolled: () => {
        enrolled = true;
        meta?.onEnrolled?.();
      },
    }),
  );
  if (!meta?.gestureId) return run;
  return run
    .then((result) => {
      if (!result && !enrolled) {
        editorCoordinator.discardSemanticGesture(meta.gestureId!);
      }
      return result;
    })
    .catch((error) => {
      if (!enrolled) {
        editorCoordinator.discardSemanticGesture(meta.gestureId!);
      }
      throw error;
    });
};
