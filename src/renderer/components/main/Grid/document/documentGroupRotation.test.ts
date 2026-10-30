import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Frame } from '@src/types/generated/elementDocument';

const mocks = vi.hoisted(() => ({
  edit: vi.fn((_ops: unknown[], _options?: unknown) => Promise.resolve(null)),
}));

vi.mock('./documentEditActions', () => ({ editDocument: mocks.edit }));

import {
  documentRotationEntries,
  documentSelectionFrame,
  startDocumentGroupRotation,
} from './documentGroupRotation';
import { useDocumentFramePreviewStore } from './useDocumentFramePreviewStore';

const box = (x: number, y: number, rotation = 0): Frame => ({
  x,
  y,
  width: 20,
  height: 20,
  rotation,
});

describe('트리 요소 묶음 회전', () => {
  beforeEach(() => {
    mocks.edit.mockClear();
    useDocumentFramePreviewStore.setState({ frames: {} });
  });

  it('선택틀은 회전한 꼭짓점을 감싸고 기준 회전은 첫 요소 회전이다', () => {
    const frame = documentSelectionFrame([
      { id: 'a', frame: box(0, 0, 15) },
      { id: 'b', frame: box(80, 0) },
    ]);
    expect(frame?.rotation).toBe(15);
    expect(frame?.bounds.x).toBeLessThan(0);
    expect(frame?.bounds.x + frame!.bounds.width).toBe(100);
  });

  it('선택틀 중심을 축으로 돌려 미리 보이고 한 커밋으로 보낸다', async () => {
    const entries = [
      { id: 'a', frame: box(0, 0) },
      { id: 'b', frame: box(80, 0) },
    ];
    const frame = documentSelectionFrame(entries)!;
    const session = startDocumentGroupRotation('4key', entries, frame);
    session.preview(frame.rotation + 180);
    const frames = useDocumentFramePreviewStore.getState().frames;
    expect(frames.a.x).toBeCloseTo(80);
    expect(frames.b.x).toBeCloseTo(0);
    expect(frames.a.rotation).toBe(180);
    await session.commit(frame.rotation + 90, 'rotate-gesture');
    expect(mocks.edit).toHaveBeenCalledTimes(1);
    expect(mocks.edit.mock.calls[0][1]).toEqual({
      gestureId: 'rotate-gesture',
    });
    const ops = mocks.edit.mock.calls[0][0] as Array<{
      id: string;
      frame: Frame;
    }>;
    expect(ops.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(ops[0].frame.x).toBeCloseTo(40);
    expect(ops[0].frame.y).toBeCloseTo(-40);
    expect(ops[0].frame.rotation).toBe(90);
    expect(useDocumentFramePreviewStore.getState().frames).toEqual({});
  });

  it('취소하면 미리보기만 지운다', () => {
    const entries = [{ id: 'a', frame: box(0, 0) }];
    const session = startDocumentGroupRotation(
      '4key',
      entries,
      documentSelectionFrame(entries)!,
    );
    session.preview(30);
    session.cancel();
    expect(useDocumentFramePreviewStore.getState().frames).toEqual({});
    expect(mocks.edit).not.toHaveBeenCalled();
  });
});

describe('묶음 회전 대상', () => {
  const element = (id: string, kind: string, frame: Frame) => ({
    type: 'element' as const,
    id,
    kind,
    frame,
  });

  it('고른 요소의 틀을 장면 순서와 무관하게 고른 순서로, 그룹 안 요소도 찾는다', () => {
    const scene = {
      nodes: [
        element('a', 'key', box(0, 0)),
        {
          type: 'group' as const,
          id: 'g',
          name: 'G',
          children: [element('b', 'stat', box(40, 0, 15))],
        },
      ],
    };
    expect(documentRotationEntries(scene, ['b', 'a', 'missing'])).toEqual({
      entries: [
        { id: 'b', frame: box(40, 0, 15) },
        { id: 'a', frame: box(0, 0) },
      ],
      rotatable: true,
    });
  });

  it('회전 못 하는 종류가 섞이면 돌릴 수 없다', () => {
    const scene = {
      nodes: [
        element('a', 'key', box(0, 0)),
        element('p', 'plugin:demo', box(10, 10)),
      ],
    };
    expect(documentRotationEntries(scene, ['a', 'p']).rotatable).toBe(false);
    expect(documentRotationEntries(undefined, ['a'])).toEqual({
      entries: [],
      rotatable: false,
    });
  });
});
