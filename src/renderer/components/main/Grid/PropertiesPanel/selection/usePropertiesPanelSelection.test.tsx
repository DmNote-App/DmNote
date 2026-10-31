// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const KNOB = '00000000-0000-4000-8000-0000000000k1';

const tree = vi.hoisted(() => ({
  element: {
    type: 'element',
    id: '00000000-0000-4000-8000-0000000000k1',
    kind: 'knob',
    frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
    // 트리로 보낸 편집이 낙관 반영된 값
    values: { sensitivity: 3, reverse: false },
  },
}));

const scene = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  useElementDocumentScene: () =>
    (scene.value ??= { nodes: [tree.element] }) as never,
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) =>
      id === tree.element.id ? tree.element : undefined,
  }),
}));

import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useKnobItemStore } from '@src/renderer/__tests__/legacyStores/useKnobItemStore';
import { previewOverlay } from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { usePropertiesPanelSelection } from './usePropertiesPanelSelection';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('속성 패널 단일 요소 값', () => {
  it('트리 편집기가 맡는 요소는 트리 값 + 편집 미리보기를 읽는다 (옛 배열은 순번만)', () => {
    useKeyStore.setState({ selectedKeyType: '4key' });
    useKnobItemStore.setState({
      positions: {
        '4key': [
          {
            id: KNOB,
            dx: 0,
            dy: 0,
            width: 60,
            height: 60,
            sensitivity: 1,
            reverse: false,
          },
        ],
      } as never,
    });
    useDocumentSelectionStore.setState({
      selectedElements: [{ type: 'knob', id: KNOB, index: 0 }],
    });
    const onRender =
      vi.fn<(value: ReturnType<typeof usePropertiesPanelSelection>) => void>();
    const Probe = () => {
      onRender(usePropertiesPanelSelection());
      return null;
    };
    const latest = () => onRender.mock.lastCall![0];
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe />));
    expect(latest().singleKnobPosition?.sensitivity).toBe(3);

    act(() => {
      previewOverlay.applyLocalPatchByIds(
        '11111111-1111-4111-8111-111111111111',
        '4key',
        [KNOB],
        { sensitivity: 4 },
        'knobPosition',
      );
    });
    expect(latest().singleKnobPosition?.sensitivity).toBe(4);
    act(() => {
      previewOverlay.clearAll();
      root.unmount();
    });
  });
});
