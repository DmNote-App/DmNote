import { useEffect, useState } from 'react';

import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import type { Frame } from '@src/types/generated/elementDocument';
import { sendPluginTreeEdit } from '@plugins/runtime/displayElement/pluginTreeGeometry';
import {
  capturePluginElementGeometry,
  restorePluginElementGeometry,
  updatePluginElement,
  type PluginElementGeometrySnapshot,
  type PluginElementUpdatePatch,
} from '@plugins/runtime/displayElement/pluginElementActions';
import { useDocumentFramePreviewStore } from '@stores/grid/useDocumentFramePreviewStore';

export type PluginGeometryField = 'x' | 'y' | 'width' | 'height';

export interface PluginGeometryTarget {
  fullId: string;
  pluginId: string;
}

interface PluginGeometrySession {
  fullId: string;
  sceneId: string;
  gestureId: string;
  // 트리에 노드가 있는 인스턴스 - 시작 틀 (미리보기는 트리 편집기의 틀 미리보기)
  frame: Frame | null;
  // 트리에 없는 런타임 요소 - 취소할 때 되돌릴 값
  snapshot: PluginElementGeometrySnapshot | null;
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

// 트리 선택(저장된 인스턴스)·옛 선택(런타임 요소) 어느 쪽이든
const isSelectedPluginElement = (fullId: string): boolean =>
  useDocumentSelectionStore.getState().isSelected(fullId);

// 속성 패널 숫자 입력(X/Y/W/H)의 플러그인 요소 게스처. 인스턴스는 캔버스 끌기와 같이 트리 틀 미리보기로 보이고
// 확정은 트리 틀 연산 한 번, 트리에 없는 런타임 요소는 런타임 스토어만 고친다
export const createPluginGeometryGestureController = () => {
  let session: PluginGeometrySession | null = null;

  const previewFrame = (current: PluginGeometrySession) =>
    useDocumentFramePreviewStore.getState().frames[current.fullId] ??
    current.frame;

  const cancel = () => {
    if (!session) return;
    const current = session;
    session = null;
    if (current.frame) {
      useDocumentFramePreviewStore.getState().clear(current.fullId);
    } else if (current.snapshot) {
      restorePluginElementGeometry(current.fullId, current.snapshot);
    }
  };

  const ensureSession = (target: PluginGeometryTarget): boolean => {
    if (session?.fullId === target.fullId) return true;
    if (session) cancel();
    // 선택이 바뀐 뒤 도착한 지각 preview(언마운트 직전 after-paint 발행)는
    // 새 세션을 열지 않는다
    if (!isSelectedPluginElement(target.fullId)) return false;
    const sceneId = useKeyStore.getState().selectedKeyType;
    const node = getElementDocumentStore()?.getElement(sceneId, target.fullId);
    const snapshot = node ? null : capturePluginElementGeometry(target.fullId);
    if (!node && !snapshot) return false;
    session = {
      fullId: target.fullId,
      sceneId,
      gestureId: crypto.randomUUID(),
      frame: node?.frame ?? null,
      snapshot,
    };
    return true;
  };

  const apply = (
    current: PluginGeometrySession,
    field: PluginGeometryField,
    value: number,
  ) => {
    const frame = previewFrame(current);
    if (frame) {
      useDocumentFramePreviewStore
        .getState()
        .set(current.fullId, { ...frame, [field]: value });
      return;
    }
    updatePluginElement(current.fullId, geometryPatch(field, value));
  };

  const preview = (
    target: PluginGeometryTarget,
    field: PluginGeometryField,
    value: number,
  ) => {
    if (!ensureSession(target) || !session) return;
    apply(session, field, value);
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
    apply(current, field, value);
    if (!current.frame) return;
    const last = useDocumentFramePreviewStore.getState().frames[current.fullId];
    if (!last) return;
    const { x, y, width, height } = last;
    void sendPluginTreeEdit(
      [
        {
          op: 'setFrame',
          scene: current.sceneId,
          id: current.fullId,
          frame: { x, y, width, height },
        },
      ],
      current.gestureId,
    )
      .catch((error: unknown) =>
        console.error('[Plugin] Failed to save geometry', error),
      )
      .finally(() =>
        useDocumentFramePreviewStore.getState().clear(current.fullId),
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
