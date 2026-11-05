import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Op } from '@src/types/generated/elementDocument';
import DocumentBatchPanel from './DocumentBatchPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  scene: null as unknown,
  edit: vi.fn((_ops: Op[]) => Promise.resolve(null)),
}));

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  useElementDocumentScene: () => mocks.scene,
}));

vi.mock('../../document/documentEditActions', () => ({
  editDocument: mocks.edit,
}));

// 모니터 고르기는 화면 위치 모드 칸 - 번역 문맥 없이 자리만
vi.mock('@src/renderer/elementKinds/cursorTracker/MonitorSelect', () => ({
  default: () => null,
}));

vi.mock('@src/renderer/elementKinds/runtime/pointerInput', () => ({
  loadPointerMonitors: () => Promise.resolve([]),
  pointerInputSource: { subscribe: () => () => undefined },
}));

const tracker = (id: string, x: number, values: Record<string, unknown>) => ({
  type: 'element',
  id,
  kind: 'cursorTracker',
  frame: { x, y: 0, width: 120, height: 120, rotation: 0 },
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
  bundles: { surface: { borderWidth: 1 } },
});

const t = (key: string) => key;

describe('트리 요소 여러 개 속성 패널', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.edit.mockClear();
    mocks.scene = {
      nodes: [
        tracker('a', 0, { sensitivity: 1 }),
        tracker('b', 300, { sensitivity: 2 }),
      ],
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = () =>
    act(() => {
      root.render(
        <DocumentBatchPanel
          sceneId="4key"
          elementIds={['a', 'b']}
          panelElement={null}
          setPanelElement={vi.fn()}
          t={t}
        />,
      );
    });

  it('같은 종류면 선언 칸을 보이고 다른 값은 섞임으로 보인다', () => {
    render();
    const text = container.textContent ?? '';
    expect(text).toContain('elementKinds.cursorTracker.sensitivity');
    // 감도는 1과 2로 다르다
    expect(container.querySelectorAll('input').length).toBeGreaterThan(0);
  });

  it('보일 조건이 있는 칸은 그 칸이 보이는 요소에만 쓴다', async () => {
    mocks.scene = {
      nodes: [
        tracker('a', 0, { mode: 'motion', sensitivity: 1 }),
        tracker('b', 300, { mode: 'position', sensitivity: 2 }),
      ],
    };
    render();
    const label = [...container.querySelectorAll('p, span')].find(
      (node) => node.textContent === 'elementKinds.cursorTracker.sensitivity',
    );
    const input = label?.parentElement?.querySelector('input');
    expect(input).toBeTruthy();
    // 섞인 값도 보이는 요소(움직임 모드)로만 - 감도 1
    expect(input!.value).toBe('1×');
    await act(async () => {
      input!.focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set?.call(input, '3');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.blur();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.edit).toHaveBeenCalledTimes(1);
    expect(mocks.edit.mock.calls[0][0]).toEqual([
      { op: 'setValues', scene: '4key', id: 'a', values: { sensitivity: 3 } },
    ]);
  });

  it('정렬은 고른 요소 모두의 위치를 한 커밋으로 바꾼다', () => {
    render();
    const left = container.querySelector<HTMLButtonElement>(
      'button[aria-label="propertiesPanel.alignLeft"], button[title="propertiesPanel.alignLeft"]',
    );
    expect(left).not.toBeNull();
    act(() => left!.click());
    expect(mocks.edit).toHaveBeenCalledTimes(1);
    expect(mocks.edit.mock.calls[0][0]).toEqual([
      { op: 'setFrame', scene: '4key', id: 'b', frame: { x: 0 } },
    ]);
  });
});
