// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { KeyPosition } from '@src/types/key/keys';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type GeometryProps = {
  localDx?: number;
  onLocalDxChange?: (value: number) => void;
  onGeometryCommit?: (field: 'dx', value: number) => void;
  onGeometryPreview?: (field: 'dx', value: number) => void;
  onRotationCommit?: (value: number) => void;
};

const mocks = vi.hoisted(() => ({
  geometry: null as null | GeometryProps,
  commitGeometry: vi.fn(() => Promise.resolve(true)),
  preview: vi.fn(),
}));

// 위치·크기 부품은 옛 키·스탯 패널 그대로 - 받은 처리기·입력 중 값만 본다
vi.mock('../single/SingleGeometrySection', () => ({
  default: (props: GeometryProps) => {
    mocks.geometry = props;
    return null;
  },
}));
vi.mock(
  '@src/renderer/editor/runtime/operations/elementOps',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    commitElementGeometryById: mocks.commitGeometry,
  }),
);
vi.mock('@src/renderer/editor/runtime/gesture/editGestureController', () => ({
  editGestureController: {
    activeGestureId: () => null,
    preview: mocks.preview,
    settleCommit: vi.fn(),
    cancel: vi.fn(),
  },
}));
// 미리보기는 트리에 있는 요소에만
vi.mock(
  '@src/renderer/elementKinds/runtime/viewFields',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    currentFieldsOf: () => ({}),
  }),
);

const { KeyStatGeometry } = await import('./legacyKeyStatSections');
const { useKeyStore } = await import('@stores/data/useKeyStore');

const STABLE_ID = '63000000-0000-4000-8000-000000000001';

const elementOf = (kind: 'key' | 'stat', id: string) =>
  ({
    type: 'element',
    id,
    kind,
    frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
  } as ElementNode);
const positionAt = (dx: number) =>
  ({ id: STABLE_ID, dx, dy: 0, width: 60, height: 60 } as KeyPosition);

// 옛 키·스탯 패널의 위치 칸 연결 - 순번이 아니라 고른 요소 id로 쓴다
describe('키·스탯 위치·크기 섹션', () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = (element: ElementNode, position = positionAt(0)) =>
    act(() =>
      root.render(
        <KeyStatGeometry
          element={element}
          position={position}
          t={(key) => key}
        />,
      ),
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.geometry = null;
    useKeyStore.setState({ selectedKeyType: '4key' });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it.each(['key', 'stat'] as const)(
    '%s 위치 확정은 요소 id로 커밋한다',
    (kind) => {
      render(elementOf(kind, STABLE_ID));

      act(() => mocks.geometry?.onGeometryCommit?.('dx', 42));

      expect(mocks.commitGeometry).toHaveBeenCalledWith(
        kind,
        STABLE_ID,
        { dx: 42 },
        {},
      );
    },
  );

  it('키 위치 미리보기는 요소 id를 신원으로 보낸다', () => {
    render(elementOf('key', STABLE_ID));

    act(() => mocks.geometry?.onGeometryPreview?.('dx', 17));

    expect(mocks.preview).toHaveBeenCalledWith(
      '4key',
      [{ id: STABLE_ID, patch: { dx: 17 } }],
      { domain: 'keyPosition' },
    );
  });

  it.each(['key', 'stat'] as const)(
    '옛 모양 %s id는 위치·회전 처리기를 만들지 않는다',
    (kind) => {
      render(elementOf(kind, `${kind}-0`));

      expect(mocks.geometry?.onGeometryCommit).toBeUndefined();
      expect(mocks.geometry?.onGeometryPreview).toBeUndefined();
      expect(mocks.geometry?.onRotationCommit).toBeUndefined();
      expect(mocks.commitGeometry).not.toHaveBeenCalled();
    },
  );

  it('고친 값을 패널에 먼저 두고, 바탕 값이 바뀌면 바탕 값을 따른다', () => {
    const element = elementOf('key', STABLE_ID);
    const position = positionAt(0);
    render(element, position);

    act(() => mocks.geometry?.onLocalDxChange?.(42));
    expect(mocks.geometry?.localDx).toBe(42);

    render(element, positionAt(50));
    expect(mocks.geometry?.localDx).toBe(50);
  });
});
