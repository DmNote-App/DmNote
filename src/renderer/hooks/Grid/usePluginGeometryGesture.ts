import { useEffect, useState } from 'react';

import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import {
  applyPluginElementEdit,
  commitPluginFrames,
} from '@plugins/runtime/displayElement/pluginTreeGeometry';
import {
  capturePluginElementGeometry,
  restorePluginElementGeometry,
  updatePluginElement,
  type PluginElementGeometrySnapshot,
  type PluginElementUpdatePatch,
} from '@plugins/runtime/displayElement/pluginElementActions';

export type PluginGeometryField = 'x' | 'y' | 'width' | 'height';

export interface PluginGeometryTarget {
  fullId: string;
  pluginId: string;
}

interface PluginGeometrySession {
  fullId: string;
  sceneId: string;
  gestureId: string;
  snapshot: PluginElementGeometrySnapshot;
}

const geometryPatch = (
  field: PluginGeometryField,
  value: number,
): PluginElementUpdatePatch => {
  switch (field) {
    case 'x':
      return { position: { x: value } };
    case 'y':
      return { position: { y: value } };
    case 'width':
      return { measuredSize: { width: value } };
    case 'height':
      return { measuredSize: { height: value } };
  }
};

const isSelectedPluginElement = (fullId: string): boolean =>
  useGridSelectionStore
    .getState()
    .selectedElements.some(
      (element) => element.type === 'plugin' && element.id === fullId,
    );

// 속성 패널 숫자 입력(X/Y/W/H)의 플러그인 요소 게스처. 값의 원본이 프론트
// 스토어라 preview_broker를 타지 않는다 - 미리보기는 스토어만 바꾸고(자동 저장 없이),
// 확정은 트리 노드 틀 커밋 한 번(캔버스 끌기와 같은 저장)
export const createPluginGeometryGestureController = () => {
  let session: PluginGeometrySession | null = null;

  const edit = (current: PluginGeometrySession, change: () => void) =>
    applyPluginElementEdit(current.sceneId, new Set([current.fullId]), change);

  const cancel = () => {
    if (!session) return;
    const current = session;
    session = null;
    edit(current, () =>
      restorePluginElementGeometry(current.fullId, current.snapshot),
    );
  };

  const ensureSession = (target: PluginGeometryTarget): boolean => {
    if (session?.fullId === target.fullId) return true;
    if (session) cancel();
    // 선택이 바뀐 뒤 도착한 지각 preview(언마운트 직전 after-paint 발행)는
    // 새 세션을 열지 않는다
    if (!isSelectedPluginElement(target.fullId)) return false;
    const snapshot = capturePluginElementGeometry(target.fullId);
    if (!snapshot) return false;
    session = {
      fullId: target.fullId,
      sceneId: useKeyStore.getState().selectedKeyType,
      gestureId: crypto.randomUUID(),
      snapshot,
    };
    return true;
  };

  const preview = (
    target: PluginGeometryTarget,
    field: PluginGeometryField,
    value: number,
  ) => {
    if (!ensureSession(target) || !session) return;
    edit(session, () =>
      updatePluginElement(target.fullId, geometryPatch(field, value)),
    );
  };

  // preview 없이 온 확정(짧은 타이핑 후 blur)도 같은 세션 경계로 저장한다
  const commit = (
    target: PluginGeometryTarget,
    field: PluginGeometryField,
    value: number,
  ) => {
    if (!ensureSession(target) || !session) return;
    const current = session;
    session = null;
    edit(current, () =>
      updatePluginElement(target.fullId, geometryPatch(field, value)),
    );
    commitPluginFrames(
      current.sceneId,
      [current.fullId],
      current.gestureId,
    ).catch((error: unknown) =>
      console.error('[Plugin] Failed to save geometry', error),
    );
  };

  return { preview, commit, cancel };
};

export const usePluginGeometryGesture = (
  target: PluginGeometryTarget | null,
) => {
  const [controller] = useState(createPluginGeometryGestureController);
  const fullId = target?.fullId ?? null;

  // 대상 전환·언마운트는 취소 경계 - 옛 대상의 미확정 값을 남기지 않는다
  useEffect(() => () => controller.cancel(), [controller, fullId]);

  return {
    preview: (field: PluginGeometryField, value: number) => {
      if (target) controller.preview(target, field, value);
    },
    commit: (field: PluginGeometryField, value: number) => {
      if (target) controller.commit(target, field, value);
    },
    cancel: controller.cancel,
  };
};
