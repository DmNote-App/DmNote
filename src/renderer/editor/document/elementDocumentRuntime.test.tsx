import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  emit: null as null | ((event: unknown) => void),
}));

vi.mock('@api/modules/editor/elementDocumentApi', () => ({
  elementDocumentApi: {
    get: () =>
      Promise.resolve({
        revision: 1,
        document: {
          formatVersion: 1,
          kindVersions: {},
          scenes: { tab: { nodes: [] } },
        },
      }),
    commit: vi.fn(),
    onChanged: (listener: (event: unknown) => void) => {
      mocks.emit = listener;
      return Object.assign(() => undefined, { ready: Promise.resolve() });
    },
  },
}));

import {
  loadElementDocumentStore,
  useElementDocumentScene,
} from './elementDocumentRuntime';

const Probe = ({ seen }: { seen: (count: number) => void }) => {
  const scene = useElementDocumentScene('tab');
  seen(scene?.nodes.length ?? -1);
  return null;
};

describe('창별 요소 문서 스토어 구독', () => {
  it('스토어보다 먼저 마운트한 컴포넌트도 이후 변경을 받는다', async () => {
    window.__dmn_window_type = 'overlay';
    const seen: number[] = [];
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe seen={(count) => seen.push(count)} />));
    expect(seen.at(-1)).toBe(-1);
    await act(async () => {
      await loadElementDocumentStore();
    });
    expect(seen.at(-1)).toBe(0);
    act(() =>
      mocks.emit?.({
        revision: 2,
        patch: {
          kindVersions: {},
          scenes: {
            tab: {
              type: 'replace',
              scene: {
                nodes: [
                  {
                    type: 'element',
                    id: 't',
                    kind: 'cursorTracker',
                    frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
                  },
                ],
              },
            },
          },
          changes: {
            scenes: { tab: { changed: ['t'], removed: [], structure: true } },
          },
        },
      }),
    );
    expect(seen.at(-1)).toBe(1);
    act(() => root.unmount());
  });
});
