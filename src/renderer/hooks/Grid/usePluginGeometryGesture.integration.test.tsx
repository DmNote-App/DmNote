/**
 * 플러그인 기하 게스처 × 트리 틀 미리보기·커밋 통합 계약 (트리에 노드가 있는 인스턴스)
 * - preview는 트리 틀 미리보기만 바꾸고(플러그인 요소가 따라 그린다) 저장하지 않는다
 * - commit은 마지막 틀을 같은 동작 id의 트리 틀 커밋 한 번으로 보내고 미리보기를 지운다
 * - cancel은 미리보기만 지운다
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { useDocumentFramePreviewStore } from '@stores/grid/useDocumentFramePreviewStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import { drainEditorWrites } from '@src/renderer/editor/runtime/lifecycle/editorWriteBarrier';

import { createPluginGeometryGestureController } from './usePluginGeometryGesture';

const FRAME = { x: 30, y: 40, width: 200, height: 150, rotation: 0 };

const tree = vi.hoisted(() => ({
  edit: vi.fn(async (_ops: unknown[], _options?: { gestureId?: string }) => ({
    status: 'committed',
  })),
}));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) =>
      id === FULL_ID
        ? { id, kind: 'plugin:plugin-int', frame: FRAME }
        : undefined,
    edit: tree.edit,
  }),
}));
vi.mock('@utils/plugin/bridgeMessages', () => ({
  sendBridgeMessageBestEffort: vi.fn(),
}));

const PLUGIN_ID = 'plugin-int';
const FULL_ID = 'plugin-int::element';
const target = { fullId: FULL_ID, pluginId: PLUGIN_ID };
const preview = () => useDocumentFramePreviewStore.getState().frames[FULL_ID];

describe('usePluginGeometryGesture 트리 틀 미리보기·커밋 통합', () => {
  beforeEach(() => {
    tree.edit.mockClear();
    useDocumentFramePreviewStore.getState().clear(FULL_ID);
    useKeyStore.setState({ selectedKeyType: '4key' });
    useDocumentSelectionStore
      .getState()
      .replaceSelection('4key', [], [{ type: 'plugin', id: FULL_ID }]);
  });

  it('preview는 틀 미리보기만, commit은 마지막 틀을 트리 커밋 한 번으로 보내고 미리보기를 지운다', async () => {
    const gesture = createPluginGeometryGestureController();

    gesture.preview(target, 'x', 35);
    gesture.preview(target, 'x', 41);
    gesture.preview(target, 'width', 120);
    expect(preview()).toEqual({ ...FRAME, x: 41, width: 120 });
    expect(tree.edit).not.toHaveBeenCalled();

    gesture.commit(target, 'width', 130);

    expect(tree.edit).toHaveBeenCalledOnce();
    const [ops, options] = tree.edit.mock.calls[0];
    expect(ops).toEqual([
      {
        op: 'setFrame',
        scene: '4key',
        id: FULL_ID,
        frame: { x: 41, y: 40, width: 130, height: 150 },
      },
    ]);
    expect(typeof options?.gestureId).toBe('string');
    await expect(drainEditorWrites()).resolves.toBe(true);
    expect(preview()).toBeUndefined();
  });

  it('cancel은 미리보기만 지우고 저장하지 않는다', async () => {
    const gesture = createPluginGeometryGestureController();

    gesture.preview(target, 'y', 77);
    gesture.cancel();

    expect(tree.edit).not.toHaveBeenCalled();
    expect(preview()).toBeUndefined();
    await expect(drainEditorWrites()).resolves.toBe(true);
  });
});
