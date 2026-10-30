import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useKeyStore } from '@stores/data/useKeyStore';
import { useSpriteStore } from '@stores/data/useSpriteStore';
import { useSelectionDrag } from '@hooks/Grid/drag/useSelectionDrag';
import { useDraggable } from '@hooks/Grid/drag/useDraggable';
import { useGridResize } from '@hooks/Grid/resize/useGridResize';
import { useScrubDrag } from '@hooks/ui/useScrubDrag';
import { createPluginGeometryGestureController } from '@hooks/Grid/usePluginGeometryGesture';
import { releaseDragSession } from '@hooks/Grid/drag/dragSession';
import {
  beginMixedGestureTransaction,
  cancelUncommittedMixedGestureTransaction,
} from '@plugins/runtime/displayElement/gestureTransaction';
import {
  getStagedPluginInstancesGestureId,
  isPluginInstancesGestureStaged,
} from '@plugins/runtime/displayElement/instancesCommitQueue';
import { useCommittedApplyStore } from '@stores/data/useCommittedApplyStore';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { flushFocusedEditor } from './lifecycle/lifecycleEditorFlush';
import { drainEditorWrites } from './lifecycle/editorWriteBarrier';
import {
  acquireHistoryEditorFlushLock,
  resetHistoryEditorFlushLock,
} from './lifecycle/historyEditorFlushLock';

const PLUGIN_ID = 'history-lock-plugin';
const GESTURE_ID = 'history-lock-gesture';
const ELEMENT_ID = 'history-lock-element';

interface HarnessProps {
  cleanup: (reason?: boolean | 'history') => void;
}

const SelectionHarness = ({ cleanup }: HarnessProps) => {
  const { handlePointerDown } = useSelectionDrag({
    enabled: true,
    zoom: 1,
    startX: 0,
    startY: 0,
    elementId: 'history-lock-element',
    elementWidth: 60,
    elementHeight: 60,
    selectedElements: [{ id: 'history-lock-element', type: 'plugin' }],
    getOtherElements: () => [],
    onMultiDragStart: () => {
      beginMixedGestureTransaction(GESTURE_ID, [PLUGIN_ID]);
      return (commit = true) => {
        cancelUncommittedMixedGestureTransaction(GESTURE_ID, {
          discardPendingSave: !commit,
        });
        cleanup(commit);
      };
    },
    onMultiDrag: () => {},
  });
  return (
    <div data-testid="history-lock-drag" onPointerDown={handlePointerDown} />
  );
};

const DraggableHarness = ({ cleanup }: HarnessProps) => {
  const { ref } = useDraggable({
    elementId: ELEMENT_ID,
    onDragStart: () => {
      beginMixedGestureTransaction(GESTURE_ID, [PLUGIN_ID]);
      return (commit = true) => {
        cancelUncommittedMixedGestureTransaction(GESTURE_ID, {
          discardPendingSave: !commit,
        });
        cleanup(commit);
      };
    },
  });
  return <div data-testid="history-lock-drag" ref={ref} />;
};

const ResizeHarness = () => {
  const resize = useGridResize({
    selectedElements: [{ id: ELEMENT_ID, type: 'plugin' }],
    selectedKeyType: '4key',
  });
  return (
    <div
      data-testid="history-lock-drag"
      data-preview={resize.previewBounds !== null}
      onPointerDown={() => resize.handleResizeStart()}
      onPointerMove={() =>
        resize.handleResize({ x: 0, y: 0, width: 90, height: 80 })
      }
    />
  );
};

const ScrubHarness = ({ cleanup }: HarnessProps) => {
  const [controller] = useState(createPluginGeometryGestureController);
  const target = { fullId: ELEMENT_ID, pluginId: PLUGIN_ID };
  const scrub = useScrubDrag({
    enabled: true,
    resolveBase: () => 0,
    step: 1,
    quantize: (value) => value,
    onMove: (value) => controller.preview(target, 'x', value),
    onCommit: (value) => controller.commit(target, 'x', value),
    onCancel: (reason) => {
      controller.cancel();
      cleanup(reason);
    },
  });
  return <div data-testid="history-lock-drag" {...scrub.handlers} />;
};

describe('history handshake settles active mixed selection drag', () => {
  let host: HTMLDivElement;
  let root: Root;
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    resetHistoryEditorFlushLock();
    releaseDragSession();
    useGridSelectionStore.setState({
      selectedElements: [{ id: ELEMENT_ID, type: 'plugin' }],
    });
    usePluginDisplayElementStore.setState({
      elements: [
        {
          id: ELEMENT_ID,
          fullId: ELEMENT_ID,
          pluginId: PLUGIN_ID,
          definitionId: PLUGIN_ID,
          html: '',
          position: { x: 0, y: 0 },
          measuredSize: { width: 60, height: 60 },
        },
      ],
    });
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    act(() => root.unmount());
    const staged = getStagedPluginInstancesGestureId(PLUGIN_ID);
    if (staged)
      cancelUncommittedMixedGestureTransaction(staged, {
        discardPendingSave: true,
      });
    await vi.runOnlyPendingTimersAsync();
    await drainEditorWrites();
    host.remove();
    resetHistoryEditorFlushLock();
    releaseDragSession();
    useGridSelectionStore.setState({ selectedElements: [] });
    usePluginDisplayElementStore.setState({ elements: [] });
    useKeyStore.getState().setKeyMappingsAndPositions({}, {});
    useSpriteStore.getState().setPositions({});
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(['selection', 'draggable', 'resize', 'scrub'] as const)(
    '%s: blur와 pointer 종료 없이 lock 취득만으로 staged를 닫아 flush가 ACK 단계에 도달한다',
    async (kind) => {
      const cleanup = vi.fn();
      const Harness =
        kind === 'selection'
          ? SelectionHarness
          : kind === 'draggable'
          ? DraggableHarness
          : kind === 'resize'
          ? ResizeHarness
          : ScrubHarness;
      act(() => root.render(<Harness cleanup={cleanup} />));
      const target = host.querySelector('[data-testid="history-lock-drag"]')!;
      const pointer = (type: string, clientX: number) =>
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          isPrimary: true,
          button: 0,
          clientX,
          clientY: 0,
        });
      act(() => {
        target.dispatchEvent(pointer('pointerdown', 0));
        target.dispatchEvent(pointer('pointermove', 20));
        frames.splice(0).forEach((callback) => callback(0));
      });
      expect(isPluginInstancesGestureStaged(PLUGIN_ID)).toBe(true);
      const historyTick = useCommittedApplyStore.getState().historyTick;

      act(() => {
        acquireHistoryEditorFlushLock('history-handshake');
      });
      const acknowledge = vi.fn();
      const flushing = flushFocusedEditor().then((committed) => {
        if (committed) acknowledge();
        return committed;
      });
      await vi.runOnlyPendingTimersAsync();

      expect(useCommittedApplyStore.getState().historyTick).toBe(historyTick);
      expect(acknowledge).toHaveBeenCalledOnce();
      if (kind === 'resize')
        expect(target.getAttribute('data-preview')).toBe('false');
      else
        expect(cleanup).toHaveBeenCalledWith(
          kind === 'scrub' ? 'history' : false,
        );
      expect(isPluginInstancesGestureStaged(PLUGIN_ID)).toBe(false);
      await expect(flushing).resolves.toBe(true);
    },
  );
});
