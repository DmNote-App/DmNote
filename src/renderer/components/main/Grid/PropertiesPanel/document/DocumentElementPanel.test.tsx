import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DocumentElementPanel from './DocumentElementPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  element: null as unknown,
  setValues: vi.fn(() => Promise.resolve(null)),
  setBundle: vi.fn(() => Promise.resolve(null)),
  monitors: [
    {
      id: 'main',
      name: 'Main',
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      primary: true,
    },
  ],
}));

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  useDocumentElement: () => mocks.element,
}));

vi.mock('../../document/documentEditActions', () => ({
  setDocumentValues: mocks.setValues,
  setDocumentBundle: mocks.setBundle,
  setDocumentFrame: vi.fn(() => Promise.resolve(null)),
  setDocumentCommon: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@src/renderer/elementKinds/runtime/pointerInput', () => ({
  loadPointerMonitors: () => Promise.resolve(mocks.monitors),
  pointerInputSource: { subscribe: () => () => undefined },
}));

vi.mock('@hooks/useLenis', () => ({
  useLenis: () => ({ scrollContainerRef: vi.fn() }),
}));

const tracker = (values: Record<string, unknown>) => ({
  type: 'element',
  id: 'tracker-1',
  kind: 'cursorTracker',
  frame: { x: 0, y: 0, width: 160, height: 120, rotation: 0 },
  values: {
    mode: 'motion',
    sensitivity: 1,
    returnMs: 150,
    aspect: 'locked',
    monitor: null,
    trailMs: 250,
    dotSize: 10,
    dotColor: '#FFFFFF',
    trailColor: 'rgba(255, 255, 255, 0.5)',
    trailWidth: 3,
    ...values,
  },
  bundles: { surface: {} },
});

const t = (key: string) => key;

describe('트리 문서 종류 속성 패널', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.setValues.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = () =>
    act(() => {
      root.render(
        <DocumentElementPanel
          sceneId="4key"
          elementId="tracker-1"
          panelElement={null}
          setPanelElement={vi.fn()}
          t={t}
        />,
      );
    });

  it('모드에 따라 보이는 칸이 바뀌고 섹션 순서는 정의를 따른다', () => {
    mocks.element = tracker({ mode: 'motion' });
    render();
    const text = container.textContent ?? '';
    expect(text).toContain('elementKinds.cursorTracker.sensitivity');
    expect(text).not.toContain('elementKinds.cursorTracker.aspect');
    // 모드 칸이 위치·크기보다 위에 온다
    expect(text.indexOf('elementKinds.cursorTracker.mode')).toBeLessThan(
      text.indexOf('propertiesPanel.position'),
    );

    mocks.element = tracker({ mode: 'position' });
    render();
    const positionText = container.textContent ?? '';
    expect(positionText).toContain('elementKinds.cursorTracker.aspect');
    expect(positionText).not.toContain(
      'elementKinds.cursorTracker.sensitivity',
    );
  });

  it('이름이 없으면 종류 이름을 제목으로 쓴다', () => {
    mocks.element = tracker({});
    render();
    expect(container.textContent).toContain('elementKinds.cursorTracker.name');
  });
});
