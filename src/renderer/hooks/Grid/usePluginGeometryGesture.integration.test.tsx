/**
 * 플러그인 기하 게스처 × 실물 트리 틀 저장 통합 계약
 * - preview 동안 스토어 변경은 인스턴스 자동 저장을 부르지 않는다 (트리에 노드가 있는 요소)
 * - commit은 바뀐 틀만 같은 동작 id의 트리 커밋 한 번으로, cancel은 저장 없이 복원
 * - 끝난 뒤 쓰기 대기가 남지 않는다
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { isInstanceSaveSuppressed } from '@plugins/runtime/displayElement/instanceSaveSuppression';
import { drainEditorWrites } from '@src/renderer/editor/runtime/lifecycle/editorWriteBarrier';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';

import { createPluginGeometryGestureController } from './usePluginGeometryGesture';

const tree = vi.hoisted(() => ({
  edit: vi.fn(async (_ops: unknown[], _options?: { gestureId?: string }) => ({
    status: 'committed',
  })),
}));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) =>
      id === FULL_ID
        ? { frame: { x: 30, y: 40, width: 200, height: 150, rotation: 0 } }
        : undefined,
    edit: tree.edit,
  }),
}));
vi.mock('@plugins/runtime/displayElement/instancesUndoSync', () => ({
  applyCanonicalPluginInstances: vi.fn(async () => {}),
}));
vi.mock('@utils/plugin/bridgeMessages', () => ({
  sendBridgeMessageBestEffort: vi.fn(),
}));

const PLUGIN_ID = 'plugin-int';
const FULL_ID = 'plugin-int::element';

const pluginElement = (): PluginDisplayElementInternal => ({
  id: 'element',
  fullId: FULL_ID,
  pluginId: PLUGIN_ID,
  definitionId: PLUGIN_ID,
  html: '<div />',
  position: { x: 30, y: 40 },
  estimatedSize: { width: 200, height: 150 },
  tabId: '4key',
});

const target = { fullId: FULL_ID, pluginId: PLUGIN_ID };

describe('usePluginGeometryGesture 트리 틀 저장 통합', () => {
  // defineElement의 스토어 구독을 흉내 - 막힌 변경은 자동 저장을 예약하지 않는다
  let scheduledSaves: number;
  let unsubscribe: () => void;

  beforeEach(() => {
    scheduledSaves = 0;
    tree.edit.mockClear();
    useKeyStore.setState({ selectedKeyType: '4key' });
    usePluginDisplayElementStore.setState({ elements: [pluginElement()] });
    useGridSelectionStore
      .getState()
      .setSelectedElements([{ type: 'plugin', id: FULL_ID }]);
    unsubscribe = usePluginDisplayElementStore.subscribe(() => {
      if (!isInstanceSaveSuppressed()) scheduledSaves += 1;
    });
  });

  afterEach(() => unsubscribe());

  it('preview 중에는 저장 예약이 없고 commit은 바뀐 틀을 트리 커밋 한 번으로 보낸다', async () => {
    const gesture = createPluginGeometryGestureController();

    gesture.preview(target, 'x', 35);
    gesture.preview(target, 'x', 41);
    gesture.preview(target, 'width', 120);
    expect(scheduledSaves).toBe(0);
    expect(tree.edit).not.toHaveBeenCalled();

    gesture.commit(target, 'width', 130);

    expect(scheduledSaves).toBe(0);
    expect(tree.edit).toHaveBeenCalledOnce();
    const [ops, options] = tree.edit.mock.calls[0];
    expect(ops).toEqual([
      {
        op: 'setFrame',
        scene: '4key',
        id: FULL_ID,
        frame: { x: 41, width: 130 },
      },
    ]);
    expect(typeof options?.gestureId).toBe('string');
    await expect(drainEditorWrites()).resolves.toBe(true);
  });

  it('cancel은 저장 없이 스냅샷을 복원한다', async () => {
    const gesture = createPluginGeometryGestureController();

    gesture.preview(target, 'y', 77);
    gesture.cancel();

    expect(scheduledSaves).toBe(0);
    expect(tree.edit).not.toHaveBeenCalled();
    const element = usePluginDisplayElementStore
      .getState()
      .elements.find((candidate) => candidate.fullId === FULL_ID);
    expect(element?.position).toEqual({ x: 30, y: 40 });
    expect(element?.measuredSize).toBeUndefined();
    await expect(drainEditorWrites()).resolves.toBe(true);
  });
});
