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
import type { Document, JsonValue } from '@src/types/generated/elementDocument';

const KEY_ID = '00000000-0000-4000-8000-000000000501';
const KNOB_ID = '00000000-0000-4000-8000-000000000502';
const KEY_ID_A = '00000000-0000-4000-8000-000000000511';
const KEY_ID_B = '00000000-0000-4000-8000-000000000512';
const KEY_ID_C = '00000000-0000-4000-8000-000000000513';
const STAT_ID = '00000000-0000-4000-8000-000000000521';

// IPC 경계만 대역 - 트리 스토어·런타임은 실물 (전달기는 트리 지금 값 위에 미리보기를 얹는다)
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
const { loadElementDocumentStore } = await import(
  '@src/renderer/editor/document/elementDocumentRuntime'
);
const { fillKindDefaults } = await import(
  '@src/renderer/elementKinds/runtime/elementKindDefaults'
);
const { currentFieldsOf, viewFieldsById } = await import(
  '@src/renderer/elementKinds/runtime/viewFields'
);
const { BUILTIN_BUNDLE_DEFAULTS } = await import(
  '@src/types/generated/elementDocument'
);
const { useKeyStore } = await import('@stores/data/useKeyStore');
const { previewOverlay, previewPatchOf } = await import(
  '@src/renderer/editor/runtime/gesture/previewOverlay'
);
const { editGestureController } = await import(
  '@src/renderer/editor/runtime/gesture/editGestureController'
);
const {
  previewBatchPaint,
  previewBatchStyleProperty,
  previewSingleStyleProperty,
} = await import('./previewPatchForwarders');

type Fields = Record<string, JsonValue>;

// 트리 요소 - 기능 묶음 값은 기본값 위에 고친 칸만 얹는다
const nodeOf = (
  kind: string,
  id: string,
  index: number,
  bundles: Record<string, Fields> = {},
  extra: Partial<ElementNode> = {},
): ElementNode =>
  fillKindDefaults({
    type: 'element',
    id,
    kind,
    frame: { x: index * 70, y: 0, width: 60, height: 60, rotation: 0 },
    legacy: { index },
    bundles: Object.fromEntries(
      Object.entries(bundles).map(([name, fields]) => [
        name,
        { ...BUILTIN_BUNDLE_DEFAULTS[name], ...fields },
      ]),
    ),
    ...extra,
  } as unknown as ElementNode);

const keyNode = (
  id: string,
  index: number,
  bundles: Record<string, Fields> = {},
) => nodeOf('key', id, index, bundles, { input: { type: 'key', slot: '' } });

// 키 하나(글자색·배경·테두리·노트 위치를 고친) + 노브 하나
const baseKey = (surface: Fields = {}) =>
  keyNode(KEY_ID, 0, {
    surface: {
      backgroundColor: '#old-background',
      borderWidth: 1,
      ...surface,
    },
    font: { fontColor: '#old-idle' },
    note: { noteOffsetX: 42 },
  });
const knobNode = nodeOf('knob', KNOB_ID, 1, {}, {
  input: { type: 'axis', axisId: 'HIDA:test' },
  values: { sensitivity: 1, reverse: false },
} as Partial<ElementNode>);

const documentOf = (nodes: ElementNode[]): Document => ({
  formatVersion: 1,
  kindVersions: {},
  scenes: { '4key': { nodes } },
});
const setNodes = (nodes: ElementNode[]) =>
  ipc.backend!.replace(() => documentOf(nodes));

// 화면에 보일 값 - 트리 지금 값 위에 요소별 미리보기 patch
const composedKey = () =>
  viewFieldsById('4key', KEY_ID) as Record<string, unknown>;
const composedKnob = () =>
  viewFieldsById('4key', KNOB_ID) as Record<string, unknown>;

// 태그 patch가 원본 그대로 스프레드되면 위치 객체에 property/value
// 리터럴 키가 생기고 실제 필드는 바뀌지 않는다 - 그 오염을 여기서 고정한다
const expectNoWirePollution = (position: Record<string, unknown>) => {
  expect(Object.keys(position)).not.toContain('property');
  expect(Object.keys(position)).not.toContain('value');
};

describe('preview patch forwarders (forwarder → overlay 실경로)', () => {
  beforeAll(async () => {
    ipc.backend = createFakeElementDocumentBackend(documentOf([]));
    await loadElementDocumentStore();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    previewOverlay.clearAll();
    useKeyStore.setState({ selectedKeyType: '4key' });
    setNodes([baseKey(), knobNode]);
  });

  afterEach(() => {
    editGestureController.cancel();
    previewOverlay.clearAll();
  });

  it('single style 태그 patch는 위치 조각으로 투영되고 wire 키를 남기지 않는다', () => {
    previewSingleStyleProperty('key', KEY_ID, {
      property: 'borderWidth',
      value: 12.5,
    });

    const composed = composedKey();
    expect(composed.borderWidth).toBe(12.5);
    expectNoWirePollution(composed);
    // 트리 지금 값은 불가침
    expect(currentFieldsOf('4key', KEY_ID)?.borderWidth).toBe(1);
  });

  it('single style nullable leaf의 null은 undefined 위치 조각으로 투영된다', () => {
    previewSingleStyleProperty('key', KEY_ID, {
      property: 'noteOffsetX',
      value: null,
    });

    const composed = composedKey();
    expect(composed.noteOffsetX).toBeUndefined();
    expectNoWirePollution(composed);
  });

  it('batch style 태그 patch는 타입별 도메인 전부에 깨끗하게 투영된다', () => {
    previewBatchStyleProperty(
      [
        { elementType: 'key', id: KEY_ID },
        { elementType: 'knob', id: KNOB_ID },
      ],
      '4key',
      { property: 'fontSize', value: 31.5 },
    );

    const key = composedKey();
    const knob = composedKnob();
    expect(key.fontSize).toBe(31.5);
    expect(knob.fontSize).toBe(31.5);
    expectNoWirePollution(key);
    expectNoWirePollution(knob);
  });

  it('batch shadow leaf는 대상별 현재 스펙에 얹혀 전체 스펙으로 투영된다', () => {
    setNodes([
      baseKey({
        shadow: {
          enabled: true,
          color: '#123456',
          offsetX: 1,
          offsetY: 2,
          blur: 3,
        },
      }),
      knobNode,
    ]);

    previewBatchStyleProperty(
      [
        { elementType: 'key', id: KEY_ID },
        { elementType: 'knob', id: KNOB_ID },
      ],
      '4key',
      { property: 'shadow', value: { leaf: 'offsetX', value: 7 } },
    );

    // 키는 자기 색·blur를 유지한 채 offsetX만 바뀐다
    const key = composedKey();
    expect(key.shadow).toEqual({
      enabled: true,
      color: '#123456',
      offsetX: 7,
      offsetY: 2,
      blur: 3,
    });
    // 저장된 그림자가 없는 노브는 기본 스펙 위에 얹힌다
    const knob = composedKnob();
    expect((knob.shadow as KeyRecord).offsetX).toBe(7);
    expect((knob.shadow as KeyRecord).enabled).toBeDefined();
    expectNoWirePollution(key);
    expectNoWirePollution(knob);
  });

  it('batch activeShadow leaf는 통계를 건너뛴다', () => {
    setNodes([baseKey(), knobNode, nodeOf('stat', STAT_ID, 2)]);

    previewBatchStyleProperty(
      [
        { elementType: 'key', id: KEY_ID },
        { elementType: 'stat', id: STAT_ID },
      ],
      '4key',
      { property: 'activeShadow', value: { leaf: 'blur', value: 9 } },
    );

    expect((composedKey().activeShadow as KeyRecord).blur).toBe(9);
    // 통계에는 눌림 그림자 미리보기를 얹지 않는다
    expect(previewPatchOf('statPosition', '4key', STAT_ID)).toBeNull();
  });

  it('batch font paint는 commit eager와 같은 투영으로 active fallback까지 포함한다', () => {
    previewBatchPaint([{ elementType: 'key', id: KEY_ID }], '4key', {
      property: 'fontPaint',
      value: { color: '#new-idle', gradient: null },
    });

    const composed = composedKey();
    expect(composed.fontColor).toBe('#new-idle');
    // idle만 바꿀 때 비어 있던 active는 기존 idle로 보존 (commit eager와 동일)
    expect(composed.activeFontColor).toBe('#old-idle');
    expectNoWirePollution(composed);
  });

  it('batch active font paint는 active 조각만 투영된다', () => {
    previewBatchPaint([{ elementType: 'key', id: KEY_ID }], '4key', {
      property: 'activeFontPaint',
      value: { color: '#new-active', gradient: null },
    });

    const composed = composedKey();
    expect(composed.activeFontColor).toBe('#new-active');
    expect(composed.fontColor).toBe('#old-idle');
    expectNoWirePollution(composed);
  });

  it('batch paint는 commit과 같은 projection으로 idle fallback까지 투영한다', () => {
    previewBatchPaint([{ elementType: 'key', id: KEY_ID }], '4key', {
      property: 'backgroundPaint',
      value: { color: '#new-background', gradient: null },
    });

    const composed = composedKey();
    expect(composed.backgroundColor).toBe('#new-background');
    expect(composed.backgroundGradient).toBeUndefined();
    expect(composed.activeBackgroundColor).toBe('#old-background');
    expectNoWirePollution(composed);
  });

  it('배치 프리뷰 중 비대상 삭제로 index가 밀려도 요소별 patch가 제 요소에 누적된다', () => {
    // [C, A, B] - A·B만 선택, idle 색이 달라 active fallback이 요소별 상이값
    const keyA = keyNode(KEY_ID_A, 1, { font: { fontColor: '#a-idle' } });
    const keyB = keyNode(KEY_ID_B, 2, { font: { fontColor: '#b-idle' } });
    setNodes([
      keyNode(KEY_ID_C, 0, { font: { fontColor: '#c-idle' } }),
      keyA,
      keyB,
    ]);
    const targets = [
      { elementType: 'key' as const, id: KEY_ID_A },
      { elementType: 'key' as const, id: KEY_ID_B },
    ];

    previewBatchPaint(targets, '4key', {
      property: 'fontPaint',
      value: { color: '#new-1', gradient: null },
    });

    // 게스처와 미배타인 격리 커밋(다른 창)이 비선택 C를 삭제 - A·B 순번이 당겨진다
    setNodes([keyA, keyB]);

    // 드래그 계속 - forwarder가 live index를 재해석해 전달하는 두 번째 이벤트
    previewBatchPaint(targets, '4key', {
      property: 'fontPaint',
      value: { color: '#new-2', gradient: null },
    });

    const rendered = [KEY_ID_A, KEY_ID_B].map((id) =>
      viewFieldsById('4key', id),
    );
    // 요소별 상이값(active fallback)이 제 요소에 유지 - B의 patch가 A를 덮지 않는다
    expect(rendered[0]).toMatchObject({
      id: KEY_ID_A,
      fontColor: '#new-2',
      activeFontColor: '#a-idle',
    });
    expect(rendered[1]).toMatchObject({
      id: KEY_ID_B,
      fontColor: '#new-2',
      activeFontColor: '#b-idle',
    });
  });
});

type KeyRecord = Record<string, unknown>;
