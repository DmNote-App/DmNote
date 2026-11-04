import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Scene } from '@src/types/generated/elementDocument';

// 사용자 CSS 공개 약속 - 커서 트래커 문서(docs/content/*/custom-css/cursor-tracker-styling)의
// 선택자가 편집 화면·오버레이에서 실제로 붙는다

const scene: Scene = {
  nodes: [
    {
      type: 'element',
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'cursorTracker',
      frame: { x: 10, y: 20, width: 120, height: 120, rotation: 0 },
    },
  ],
};

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  loadElementDocumentStore: () => Promise.resolve(),
  useElementDocumentScene: () => scene,
  subscribeElementDocument: () => () => {},
  getElementDocumentStore: () => ({
    getScene: () => scene,
    getElement: () => scene.nodes[0],
  }),
}));
vi.mock('@contexts/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ko' } }),
}));

import DocumentGridLayer from '@components/main/Grid/document/DocumentGridLayer';
import DocumentElementsLayer from '@src/renderer/elementKinds/runtime/DocumentElementsLayer';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('커서 트래커 사용자 CSS 선택자', () => {
  let container: HTMLDivElement;

  beforeAll(() => {
    // jsdom은 캔버스 그리기가 없다 - 그리기는 컨텍스트가 없으면 건너뛴다
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as unknown as HTMLCanvasElement['getContext'];
  });

  afterEach(() => {
    container.remove();
  });

  const render = (node: React.ReactNode) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(node));
    return root;
  };

  const expectSelectors = () => {
    const box = container.querySelector('[data-element-kind="cursorTracker"]');
    expect(box).not.toBeNull();
    expect(box!.querySelector('[data-cursor-tracker-canvas]')).not.toBeNull();
  };

  it('오버레이·OBS - 상자와 캔버스', () => {
    // 옛 종류 요소 아래·위 자리 모두 - 커서 트래커가 앉는 자리는 장면이 정한다
    const root = render(
      <>
        <DocumentElementsLayer
          sceneId="4key"
          placement="bottom"
          live
          inputs={{}}
        />
        <DocumentElementsLayer
          sceneId="4key"
          placement="stacked"
          live
          inputs={{}}
        />
      </>,
    );
    expectSelectors();
    act(() => root.unmount());
  });

  it('편집 화면 - 상자와 캔버스', () => {
    const root = render(
      <>
        {(['bottom', 'stacked'] as const).map((placement) => (
          <DocumentGridLayer
            key={placement}
            sceneId="4key"
            activeTool="move"
            placement={placement}
            zoom={1}
            onElementContextMenu={() => undefined}
          />
        ))}
      </>,
    );
    expectSelectors();
    act(() => root.unmount());
  });
});
