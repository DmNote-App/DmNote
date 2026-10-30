// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { useKeyStore } from '@stores/data/useKeyStore';
import { slotDisplayName } from '@utils/keySlot';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import KeyEditorFace from './KeyEditorFace';

vi.mock('@components/main/Grid/document/treeEditedSelection', () => ({
  usePanelSelection: () => [],
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('편집 화면 키 얼굴', () => {
  it('옛 모양 보기에 아직 없는 키(트리로 막 붙여넣음)는 트리 입력의 슬롯으로 이름을 그린다', () => {
    useKeyStore.setState({
      selectedKeyType: '4key',
      canonicalPositions: { '4key': [] },
      keyMappings: { '4key': [] },
    });
    const element = {
      type: 'element',
      id: 'pasted',
      kind: 'key',
      frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
      input: { type: 'key', slot: 'KeyZ' },
    } as unknown as ElementNode;
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <KeyEditorFace
          element={element}
          values={{}}
          bundles={{}}
          live={false}
          inputs={{} as never}
        />,
      ),
    );
    expect(container.textContent).toContain(slotDisplayName('KeyZ'));
    act(() => root.unmount());
  });
});
