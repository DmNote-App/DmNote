import { afterEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  edit: vi.fn(),
  cancel: vi.fn(async () => {}),
  publish: vi.fn(async () => {}),
  subscribe: vi.fn(async () => 1),
}));

const KEY_ID = '00000000-0000-4000-8000-000000000602';
const keyElement = {
  type: 'element',
  id: KEY_ID,
  kind: 'key',
  frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
  input: { type: 'key', slot: 'A' },
  legacy: {},
};

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) =>
      id === KEY_ID ? keyElement : undefined,
    getScene: () => ({ nodes: [keyElement] }),
    getSceneIds: () => ['4key'],
    getRevision: () => 0,
    subscribe: () => () => {},
    edit: runtime.edit,
  }),
}));

vi.mock('@api/modules/editor/previewApi', () => ({
  previewApi: {
    cancel: runtime.cancel,
    publish: runtime.publish,
    subscribe: runtime.subscribe,
  },
}));

import { useKeyStore } from '@stores/data/useKeyStore';
import { editGestureController } from './editGestureController';
import { patchPaintById } from '../operations/elementOps';
import { previewOverlay } from './previewOverlay';

describe('paint gesture discard integration', () => {
  afterEach(() => {
    editGestureController.cancel();
    previewOverlay.clearAll();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('트리가 다시 받지 않을 거절을 하면 커밋 동작 id의 미리보기를 버린다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    useKeyStore.setState({ selectedKeyType: '4key' });
    runtime.edit.mockResolvedValue({
      status: 'rejected',
      revision: 0,
      code: 'VIOLATION',
      violations: [],
    });

    editGestureController.preview(
      '4key',
      [{ id: KEY_ID, patch: { backgroundColor: '#222222' } }],
      { domain: 'keyPosition' },
    );
    const gestureId = editGestureController.activeGestureId();
    expect(gestureId).not.toBeNull();

    const persisted = patchPaintById(
      'key',
      KEY_ID,
      {
        property: 'backgroundPaint',
        value: { color: '#333333', gradient: null },
      },
      { gestureId: gestureId! },
    );
    editGestureController.settleCommit(persisted);
    await expect(persisted).rejects.toThrow('VIOLATION');
    await vi.waitFor(() =>
      expect(editGestureController.activeGestureId()).toBeNull(),
    );
    expect(runtime.cancel).toHaveBeenCalledWith(gestureId);
  });
});
