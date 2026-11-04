// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { FakeElementDocumentBackend } from '@src/renderer/__tests__/fakeElementDocumentBackend';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { Document, Op } from '@src/types/generated/elementDocument';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  picked: null as null | { path: string; width: number; height: number },
}));
vi.mock('@utils/media/pickValidatedImage', () => ({
  pickValidatedImage: async () => mocks.picked,
}));
// 선택 부품은 고른 값·선택지만 본다
vi.mock('@components/main/common/dropdown/Dropdown', () => ({
  default: ({
    value,
    onChange,
    options,
  }: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

// IPC 경계만 대역 - 트리 스토어·런타임은 실물 (편집 창)
const ipc = vi.hoisted(() => ({
  backend: null as FakeElementDocumentBackend | null,
}));
vi.mock('@api/modules/editor/elementDocumentApi', () => ({
  elementDocumentApi: new Proxy(
    {},
    {
      get: (_target, name: string) =>
        name === 'registerKind' || name === 'unregisterKind'
          ? async () => undefined
          : (ipc.backend!.api as Record<string, unknown>)[name],
    },
  ),
}));
vi.mock('@api/modules/editor/previewApi', () => ({
  previewApi: {
    subscribe: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
  },
}));

const { createFakeElementDocumentBackend } = await import(
  '@src/renderer/__tests__/fakeElementDocumentBackend'
);
const { getElementDocumentStore, loadElementDocumentStore } = await import(
  '@src/renderer/editor/document/elementDocumentRuntime'
);
const { fillKindDefaults } = await import(
  '@src/renderer/elementKinds/runtime/elementKindDefaults'
);
const { useKeyStore } = await import('@stores/data/useKeyStore');
const { default: SpriteBatchSection, SpriteBatchImageSection } = await import(
  './SpriteBatchSection'
);

const SPRITE_A = '63000000-0000-4000-8000-000000000001';
const SPRITE_B = '63000000-0000-4000-8000-000000000002';

const spriteNode = (
  id: string,
  frame: { x: number; width: number; height: number },
  values: Record<string, unknown>,
): ElementNode =>
  fillKindDefaults({
    type: 'element',
    id,
    kind: 'sprite',
    frame: { y: 0, rotation: 0, ...frame },
    values,
  } as ElementNode);

// A - 이미지 있음·누름 유지, B - 이미지 없음·단발 재생·기준점 X가 다르다
const documentOf = (): Document => ({
  formatVersion: 1,
  kindVersions: {},
  scenes: {
    '4key': {
      nodes: [
        spriteNode(
          SPRITE_A,
          { x: 0, width: 200, height: 100 },
          {
            baseImage: 'a.png',
            referenceNaturalSize: { source: 'a.png', width: 200, height: 100 },
            activation: 'whileHeld',
            pressDurationMs: 200,
            transitionMs: 100,
          },
        ),
        spriteNode(
          SPRITE_B,
          { x: 300, width: 100, height: 100 },
          {
            pivot: { x: 0.25, y: 0.5 },
            activation: 'onPress',
            pressDurationMs: 300,
            transitionMs: 0,
          },
        ),
      ],
    },
  },
});

const store = () => getElementDocumentStore()!;
const valuesOf = (id: string) =>
  store().getElement('4key', id)?.values as Record<string, unknown>;
const frameOf = (id: string) => store().getElement('4key', id)!.frame;
// 커밋에 실린 요소 id (연산 순서)
const committedIds = () =>
  ipc.backend!.commit.mock.calls.flatMap(([ops]) =>
    (ops as Op[]).map((op) => ('id' in op ? op.id : null)),
  );
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const setInputValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

// 칸 이름으로 행의 입력을 찾는다
const rowInput = (host: HTMLElement, label: string) => {
  const row = [...host.querySelectorAll('p, span, label')].find(
    (node) => node.textContent === label,
  )?.parentElement;
  return row?.querySelector('input') ?? null;
};

describe('스프라이트 여럿 일괄 섹션', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    // 트리 쓰기는 편집 창에서만 열린다
    window.__dmn_window_type = 'main';
    ipc.backend = createFakeElementDocumentBackend(documentOf());
    await loadElementDocumentStore();
  });

  beforeEach(() => {
    useKeyStore.setState({ selectedKeyType: '4key' });
    ipc.backend!.replace(() => documentOf());
    ipc.backend!.commit.mockClear();
    mocks.picked = null;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root.render(
        <>
          <SpriteBatchImageSection
            sceneId="4key"
            elementIds={[SPRITE_A, SPRITE_B]}
            panelElement={null}
            t={(key) => key}
          />
          <SpriteBatchSection
            sceneId="4key"
            elementIds={[SPRITE_A, SPRITE_B]}
            panelElement={null}
            t={(key) => key}
          />
        </>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('값이 다르면 Mixed - 재생 시간은 단발 재생, 전환 시간은 누름 유지 스프라이트의 값', () => {
    const pivotX = host.querySelector<HTMLInputElement>(
      'input[aria-label="propertiesPanel.spritePivot X"]',
    )!;
    const pivotY = host.querySelector<HTMLInputElement>(
      'input[aria-label="propertiesPanel.spritePivot Y"]',
    )!;
    expect(pivotX.value).toBe('');
    expect(pivotX.placeholder).toBe('Mixed');
    expect(pivotY.value).toBe('50%');
    expect(rowInput(host, 'propertiesPanel.spritePressDuration')?.value).toBe(
      '300ms',
    );
    expect(rowInput(host, 'propertiesPanel.spriteTransition')?.value).toBe(
      '100ms',
    );
    // 기본 이미지·반응 방식이 다르다
    expect(host.textContent?.match(/Mixed/g)).toHaveLength(2);
  });

  it('기준점 축은 스프라이트마다 제 기준점에서 그 축만 바꿔 커밋 하나로', async () => {
    const pivotX = host.querySelector<HTMLInputElement>(
      'input[aria-label="propertiesPanel.spritePivot X"]',
    )!;
    await act(async () => {
      pivotX.focus();
      setInputValue(pivotX, '40');
      pivotX.blur();
      await flush();
    });

    expect(ipc.backend!.commit).toHaveBeenCalledTimes(1);
    expect(valuesOf(SPRITE_A).pivot).toEqual({ x: 0.4, y: 0.5 });
    expect(valuesOf(SPRITE_B).pivot).toEqual({ x: 0.4, y: 0.5 });
  });

  it('시간 칸은 그 반응 방식의 스프라이트에만 쓴다', async () => {
    const press = rowInput(host, 'propertiesPanel.spritePressDuration')!;
    await act(async () => {
      press.focus();
      setInputValue(press, '500');
      press.blur();
      await flush();
    });

    expect(valuesOf(SPRITE_B).pressDurationMs).toBe(500);
    expect(valuesOf(SPRITE_A).pressDurationMs).toBe(200);
    expect(committedIds()).toEqual([SPRITE_B]);
  });

  it('기본 이미지는 모두에 - 상자는 스프라이트마다 제 기준점으로 이미지 비율에 맞춘다', async () => {
    mocks.picked = { path: 'new.png', width: 100, height: 50 };
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="propertiesPanel.spriteImageSelect"]',
        )!
        .click();
      await flush();
    });

    for (const id of [SPRITE_A, SPRITE_B]) {
      expect(valuesOf(id)).toMatchObject({
        baseImage: 'new.png',
        referenceNaturalSize: { source: 'new.png', width: 100, height: 50 },
      });
    }
    // A는 이미 2:1, B는 기준점 Y 0.5라 위아래로 같이 줄어든다
    expect(frameOf(SPRITE_A)).toMatchObject({ x: 0, y: 0, width: 200 });
    expect(frameOf(SPRITE_B)).toMatchObject({
      x: 300,
      y: 25,
      width: 100,
      height: 50,
    });
    expect(ipc.backend!.commit).toHaveBeenCalledTimes(1);
  });

  it('기본 이미지 초기화는 이미지가 있는 스프라이트만 - 기준 크기는 남긴다', async () => {
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="imagePicker.reset"]',
        )!
        .click();
      await flush();
    });

    expect(valuesOf(SPRITE_A)).toMatchObject({
      baseImage: null,
      referenceNaturalSize: { source: null, width: 200, height: 100 },
    });
    expect(committedIds()).toEqual([SPRITE_A]);
  });

  it('반응 방식·가속 곡선은 고른 스프라이트 모두에 (이미 그 값이면 그대로)', async () => {
    const [activation, easing] = host.querySelectorAll('select');
    await act(async () => {
      activation.value = 'onPress';
      activation.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    expect(valuesOf(SPRITE_A).activation).toBe('onPress');
    expect(committedIds()).toEqual([SPRITE_A]);

    ipc.backend!.commit.mockClear();
    await act(async () => {
      easing.value = 'cubic-bezier(0, 0, 1, 1)';
      easing.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    expect(valuesOf(SPRITE_A).transitionEasing).toBe(
      'cubic-bezier(0, 0, 1, 1)',
    );
    expect(valuesOf(SPRITE_B).transitionEasing).toBe(
      'cubic-bezier(0, 0, 1, 1)',
    );
  });
});
