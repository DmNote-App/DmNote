import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import type { CanvasRotationSession } from '../handles/CanvasRotateHandle';

/** 옛 종류 회전 제스처와 트리 요소 회전을 하나로 - 옛 종류가 받아들인 미리보기만 함께 그리고,
 * 커밋은 옛 종류 회전과 같은 동작 id로 (되돌리기 한 번) */
export const combineRotationSessions = (
  legacy: CanvasRotationSession,
  document: {
    preview: (rotation: number) => boolean;
    commit: (rotation: number, gestureId?: string) => unknown;
    cancel: () => void;
  },
): CanvasRotationSession => ({
  preview: (rotation) => {
    const applied = legacy.preview(rotation);
    if (applied) document.preview(rotation);
    return applied;
  },
  commit: (rotation) => {
    const gestureId = editGestureController.activeGestureId() ?? undefined;
    void document.commit(rotation, gestureId);
    legacy.commit(rotation);
  },
  cancel: () => {
    legacy.cancel();
    document.cancel();
  },
});
