import {
  commitMixedGestureIntent,
  commitMixedGestureTransaction,
  type MixedIntentGeneration,
} from '@plugins/runtime/displayElement/gestureTransaction';

import { isElementIntentAbort, reportElementOpSkipped } from './elementIntent';
import { commitSemanticOps } from '../operations/editorSemanticOps';

import { EDITOR_OPS_VERSION } from '@src/types/editor';

import type { CanonicalEditorDocumentV1, EditorOpV1 } from '@src/types/editor';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';

import type { ElementIntentReceipt } from './elementIntent';

export const runMixedElementOpsIntent = async (options: {
  gestureId: string;
  pluginIds: readonly string[];
  ops: readonly EditorOpV1[];
  receipt: ElementIntentReceipt | null;
}): Promise<void> => {
  let enrolled = false;
  try {
    const onEnrolled = () => {
      enrolled = true;
    };
    if (options.pluginIds.length === 0) {
      await commitSemanticOps(options.ops, {
        gestureId: options.gestureId,
        onEnrolled,
      });
    } else {
      await commitMixedGestureTransaction(
        options.gestureId,
        options.ops.length > 0
          ? { opsVersion: EDITOR_OPS_VERSION, ops: options.ops }
          : () => null,
        options.pluginIds,
        { onEnrolled },
      );
    }
  } catch (error) {
    if (!enrolled) options.receipt?.rollback();
    throw error;
  }
};

// destructive(삭제·paste) 혼합 러너: 슬롯 정합 projection 위에서 3상태
// generator를 실행하고, 전체 중단(sentinel)·prepare 실패의 receipt 복원을
// staged 해제 전에 완료한다. targetLost 대신 sentinel을 쓰는 이유:
// null 반환은 plugin 변경만 커밋하는 슬라이스 A 의미론이라 destructive의
// 부분 성공(plugin만 삭제·추가)을 만든다 - 전체 중단이 안전하다
export const runMixedGestureElementIntent = async (options: {
  gestureId: string;
  initialPluginIds: readonly string[];
  pluginScope: (
    elements: readonly PluginDisplayElementInternal[],
  ) => readonly string[];
  // eager는 호출 직전 이미 적용됨 - receipt만 전달
  receipt: ElementIntentReceipt | null;
  generate: (context: {
    base: CanonicalEditorDocumentV1;
    pluginProjection: readonly PluginDisplayElementInternal[];
  }) => MixedIntentGeneration;
  skipContext: string;
  expectedAuthorityGeneration?: number;
  optimisticOps?: readonly EditorOpV1[];
}): Promise<{ committed: boolean; satisfied: boolean }> => {
  let enrolled = false;
  let lastKind: MixedIntentGeneration['kind'] | null = null;
  let rolledBack = false;
  const rollbackOnce = () => {
    if (rolledBack) return;
    rolledBack = true;
    options.receipt?.rollback();
  };
  try {
    await commitMixedGestureIntent({
      gestureId: options.gestureId,
      initialPluginIds: options.initialPluginIds,
      pluginScope: options.pluginScope,
      generate: (context) => {
        const generation = options.generate(context);
        lastKind = generation.kind;
        return generation;
      },
      onEnrolled: () => {
        enrolled = true;
      },
      onFailureBeforeSettle: (error) => {
        // 편입 전 실패·전체 중단만 이 러너가 소유 - staged 해제가
        // stagedSavePending 재저장을 예약하기 전에 동기 복원
        if (!enrolled || isElementIntentAbort(error)) rollbackOnce();
      },
      expectedAuthorityGeneration: options.expectedAuthorityGeneration,
      optimisticOps: options.optimisticOps,
    });
    if (lastKind === 'satisfied') {
      return { committed: false, satisfied: true };
    }
    return { committed: true, satisfied: true };
  } catch (error) {
    if (isElementIntentAbort(error)) {
      rollbackOnce();
      reportElementOpSkipped(options.skipContext);
      return { committed: false, satisfied: false };
    }
    if (!enrolled) rollbackOnce();
    throw error;
  }
};
