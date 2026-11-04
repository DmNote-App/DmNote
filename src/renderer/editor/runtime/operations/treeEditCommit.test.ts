// @vitest-environment jsdom
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
const { previewApi } = await import('@api/modules/editor/previewApi');
const { registerGestureSession, releaseGestureSession } = await import(
  '../gesture/gestureSessionLifecycle'
);
const { drainEditorWrites } = await import('../lifecycle/editorWriteBarrier');
const { useKeyStore } = await import('@stores/data/useKeyStore');
const {
  commitFieldPatch,
  commitFieldPatches,
  commitFrames,
  commitPreviewIntents,
  commitPropertyPatch,
} = await import('./treeEditCommit');

const KEY_A = '00000000-0000-4000-8000-000000000a01';
const KEY_B = '00000000-0000-4000-8000-000000000a02';
const SPRITE = '00000000-0000-4000-8000-000000000a03';
const OTHER_TAB_KEY = '00000000-0000-4000-8000-000000000a04';
const TRACKER = '00000000-0000-4000-8000-000000000a05';
const PLUGIN = 'timer::00000000-0000-4000-8000-000000000a06';

const key = (id: string, slot: string): ElementNode =>
  fillKindDefaults({
    type: 'element',
    id,
    kind: 'key',
    frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
    input: { type: 'key', slot },
  } as ElementNode);

const sprite = (): ElementNode =>
  fillKindDefaults({
    type: 'element',
    id: SPRITE,
    kind: 'sprite',
    frame: { x: 100, y: 0, width: 200, height: 200, rotation: 0 },
    values: { idleTransform: { x: 0, y: 40, rotation: 0, scale: 1 } },
  } as ElementNode);

// 트리에만 있는 내장 종류
const tracker = (): ElementNode =>
  fillKindDefaults({
    type: 'element',
    id: TRACKER,
    kind: 'cursorTracker',
    frame: { x: 400, y: 0, width: 120, height: 120, rotation: 0 },
    bundles: { surface: { borderWidth: 1 } },
  } as ElementNode);

// 플러그인 요소 - 플러그인 저장소가 맡는다
const plugin = (): ElementNode =>
  ({
    type: 'element',
    id: PLUGIN,
    kind: 'plugin:timer',
    frame: { x: 600, y: 0, width: 80, height: 40, rotation: 0 },
  } as ElementNode);

const documentOf = (): Document => ({
  formatVersion: 1,
  kindVersions: {},
  scenes: {
    '4key': {
      nodes: [
        key(KEY_A, 'KeyA'),
        key(KEY_B, 'KeyB'),
        sprite(),
        tracker(),
        plugin(),
      ],
    },
    custom: { nodes: [key(OTHER_TAB_KEY, 'KeyC')] },
  },
});

const store = () => getElementDocumentStore()!;
const valuesOf = (scene: string, id: string) =>
  store().getElement(scene, id)?.values as Record<string, unknown>;
const committedOps = (call = 0) =>
  ipc.backend!.commit.mock.calls[call]?.[0] as Op[];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('트리 편집 커밋 입구', () => {
  beforeAll(async () => {
    // 트리 쓰기는 편집 창에서만 열린다
    window.__dmn_window_type = 'main';
    ipc.backend = createFakeElementDocumentBackend(documentOf());
    await loadElementDocumentStore();
  });

  beforeEach(() => {
    useKeyStore.setState({ selectedKeyType: '4key' });
    ipc.backend!.release();
    ipc.backend!.replace(() => documentOf());
    ipc.backend!.commit.mockClear();
    vi.mocked(previewApi.cancel).mockClear();
  });

  afterEach(() => {
    ipc.backend!.release();
  });

  describe('속성 패치', () => {
    it('응답 전에 화면에 먼저 보이고, 대상 전부를 커밋 하나로 보낸다', async () => {
      ipc.backend!.hold();
      const pending = commitPropertyPatch(
        [
          { elementType: 'key', id: KEY_A },
          { elementType: 'key', id: KEY_B },
        ],
        { property: 'displayText', value: 'Z' },
        { gestureId: 'gesture-1' },
      );

      expect(valuesOf('4key', KEY_A).displayText).toBe('Z');
      expect(valuesOf('4key', KEY_B).displayText).toBe('Z');
      await flush();
      expect(ipc.backend!.heldCount()).toBe(1);
      expect(ipc.backend!.commit).toHaveBeenCalledTimes(1);
      expect(ipc.backend!.commit.mock.calls[0][1]).toBe('gesture-1');
      expect(committedOps()).toEqual([
        {
          op: 'setValues',
          scene: '4key',
          id: KEY_A,
          values: { displayText: 'Z' },
        },
        {
          op: 'setValues',
          scene: '4key',
          id: KEY_B,
          values: { displayText: 'Z' },
        },
      ]);

      ipc.backend!.release();
      await expect(pending).resolves.toEqual(['applied', 'applied']);
      expect(ipc.backend!.document().scenes['4key']!.nodes[0]).toMatchObject({
        values: { displayText: 'Z' },
      });
    });

    it('기록·종료 경계가 커밋이 끝나기를 기다린다', async () => {
      ipc.backend!.hold();
      void commitPropertyPatch([{ elementType: 'key', id: KEY_A }], {
        property: 'displayText',
        value: 'Y',
      });
      let drained = false;
      void drainEditorWrites().then(() => {
        drained = true;
      });
      await flush();
      expect(drained).toBe(false);

      ipc.backend!.release();
      await vi.waitFor(() => expect(drained).toBe(true));
    });

    it('요소가 다른 탭에 있으면 그 탭으로 보낸다', async () => {
      await commitPropertyPatch([{ elementType: 'key', id: OTHER_TAB_KEY }], {
        property: 'displayText',
        value: 'C',
      });
      expect(committedOps()[0]).toMatchObject({
        scene: 'custom',
        id: OTHER_TAB_KEY,
      });
    });

    it('트리에 없거나 바뀌는 칸이 없거나 자리가 없는 칸이면 그 대상은 고치지 않는다', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const current = valuesOf('4key', KEY_A).displayText;
      await expect(
        commitPropertyPatch(
          [
            { elementType: 'key', id: 'missing' },
            { elementType: 'key', id: KEY_A },
          ],
          { property: 'displayText', value: current as string },
        ),
      ).resolves.toEqual(['targetMissing', 'targetMissing']);
      await expect(
        commitPropertyPatch([{ elementType: 'sprite', id: SPRITE }], {
          property: 'displayText',
          value: 'Q',
        }),
      ).resolves.toEqual(['targetMissing']);
      expect(ipc.backend!.commit).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('숨김·이름·회전은 칸 규칙 없이 공통 정보·틀로 (값이 같아도 보낸다)', async () => {
      await commitPropertyPatch([{ elementType: 'key', id: KEY_A }], {
        property: 'hidden',
        value: false,
      });
      await commitPropertyPatch([{ elementType: 'key', id: KEY_A }], {
        property: 'rotation',
        value: 15,
      });
      expect(committedOps(0)).toEqual([
        { op: 'setCommon', scene: '4key', id: KEY_A, hidden: false },
      ]);
      expect(committedOps(1)).toEqual([
        { op: 'setFrame', scene: '4key', id: KEY_A, frame: { rotation: 15 } },
      ]);
    });

    it('미리 막는 검사(preflight)가 던지면 보내지 않는다', async () => {
      await expect(
        commitPropertyPatch(
          [{ elementType: 'key', id: KEY_A }],
          { property: 'displayText', value: 'P' },
          {
            preflight: () => {
              throw new Error('stale');
            },
          },
        ),
      ).rejects.toThrow('stale');
      expect(ipc.backend!.commit).not.toHaveBeenCalled();
    });

    it('다시 해도 받지 않는 거절은 오류로 올리고 이 동작의 미리보기를 버린다', async () => {
      const lifecycle = registerGestureSession('gesture-rejected');
      ipc.backend!.commit.mockImplementationOnce(async () => ({
        status: 'rejected',
        revision: 1,
        code: 'VIOLATION',
        violations: [],
      }));

      await expect(
        commitPropertyPatch(
          [{ elementType: 'key', id: KEY_A }],
          { property: 'displayText', value: 'R' },
          { gestureId: 'gesture-rejected' },
        ),
      ).rejects.toThrow('VIOLATION');
      expect(lifecycle.discarded).toBe(true);
      expect(previewApi.cancel).toHaveBeenCalledWith('gesture-rejected');
      // 되돌린 편집은 화면에서도 빠진다
      expect(valuesOf('4key', KEY_A).displayText).not.toBe('R');
      releaseGestureSession(lifecycle);
    });

    it('이 창이 그 revision을 받은 뒤에 끝난다', async () => {
      const backend = ipc.backend!;
      // 응답이 변경 이벤트보다 먼저 온다
      backend.commit.mockImplementationOnce(async () => ({
        status: 'committed',
        revision: store().getRevision() + 1,
        changes: { scenes: {} },
      }));
      let done = false;
      const pending = commitPropertyPatch([{ elementType: 'key', id: KEY_A }], {
        property: 'displayText',
        value: 'W',
      }).then(() => {
        done = true;
      });
      await flush();
      expect(done).toBe(false);

      backend.replace((document) => ({ ...document }));
      await pending;
      expect(done).toBe(true);
    });
  });

  describe('틀', () => {
    it('대상 전부의 틀을 커밋 하나로 - 크기가 바뀌면 스프라이트 이동값도 같은 커밋에서 비례한다', async () => {
      await expect(
        commitFrames(
          [
            { elementType: 'key', id: KEY_A, frame: { x: 30 } },
            {
              elementType: 'sprite',
              id: SPRITE,
              frame: { width: 100, height: 100 },
            },
          ],
          { gestureId: 'gesture-frames' },
        ),
      ).resolves.toEqual(['applied', 'applied']);
      expect(ipc.backend!.commit).toHaveBeenCalledTimes(1);
      expect(committedOps()).toEqual([
        { op: 'setFrame', scene: '4key', id: KEY_A, frame: { x: 30 } },
        {
          op: 'setFrame',
          scene: '4key',
          id: SPRITE,
          frame: { width: 100, height: 100 },
        },
        expect.objectContaining({ op: 'setValues', id: SPRITE }),
      ]);
      expect(
        (valuesOf('4key', SPRITE).idleTransform as { y: number }).y,
      ).toBeCloseTo(20);
    });
  });

  describe('트리에만 있는 내장 종류', () => {
    it('속성 패치·틀도 같은 커밋 입구로 쓴다 - 플러그인 요소는 쓰지 않는다', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(
        commitPropertyPatch(
          [
            { elementType: 'cursorTracker', id: TRACKER },
            { elementType: 'plugin:timer', id: PLUGIN },
          ],
          { property: 'borderWidth', value: 4 },
        ),
      ).resolves.toEqual(['applied', 'targetMissing']);
      expect(committedOps()).toEqual([
        {
          op: 'setBundle',
          scene: '4key',
          id: TRACKER,
          bundle: 'surface',
          fields: { borderWidth: 4 },
        },
      ]);

      await expect(
        commitFrames([
          { elementType: 'cursorTracker', id: TRACKER, frame: { x: 10 } },
        ]),
      ).resolves.toEqual(['applied']);
      expect(committedOps(1)).toEqual([
        { op: 'setFrame', scene: '4key', id: TRACKER, frame: { x: 10 } },
      ]);
      warn.mockRestore();
    });
  });

  describe('칸 패치', () => {
    it('지금 칸 보기로 칸을 만들고, 크기를 맞춰도 이동값은 비례하지 않는다', async () => {
      const makeFields = vi.fn(() => ({
        baseImage: 'wide.png',
        width: 200,
        height: 50,
      }));
      await expect(
        commitFieldPatch(
          { elementType: 'sprite', id: SPRITE, scene: '4key' },
          makeFields,
          { resizeValues: false },
        ),
      ).resolves.toBe('committed');
      expect(makeFields).toHaveBeenCalledWith(
        expect.objectContaining({
          id: SPRITE,
          width: 200,
          idleTransform: { x: 0, y: 40, rotation: 0, scale: 1 },
        }),
      );
      expect(committedOps()).toEqual([
        {
          op: 'setFrame',
          scene: '4key',
          id: SPRITE,
          frame: { width: 200, height: 50 },
        },
        {
          op: 'setValues',
          scene: '4key',
          id: SPRITE,
          values: { baseImage: 'wide.png' },
        },
      ]);
    });

    it('만들 칸이 없으면 skipped, 트리에 없거나 자리가 없는 칸이면 null', async () => {
      await expect(
        commitFieldPatch(
          { elementType: 'sprite', id: SPRITE, scene: '4key' },
          () => null,
          { resizeValues: false },
        ),
      ).resolves.toBe('skipped');
      expect(
        commitFieldPatch(
          { elementType: 'sprite', id: 'missing', scene: '4key' },
          () => ({ baseImage: 'a.png' }),
          { resizeValues: false },
        ),
      ).toBeNull();
      expect(
        commitFieldPatch(
          { elementType: 'sprite', id: SPRITE, scene: '4key' },
          () => ({ groupId: 'g' }),
          { resizeValues: false },
        ),
      ).toBeNull();
      expect(ipc.backend!.commit).not.toHaveBeenCalled();
    });
  });

  describe('여러 대상의 칸 패치', () => {
    it('대상마다 지금 칸 보기로 칸을 만들어 커밋 하나로 - 만들 칸이 없는 대상은 그대로', async () => {
      const makeFields = vi.fn(
        (_current: Record<string, unknown>, target: { id: string }) =>
          target.id === KEY_B
            ? null
            : target.id === SPRITE
            ? { baseImage: 'wide.png', width: 200, height: 50 }
            : { displayText: 'A' },
      );
      await expect(
        commitFieldPatches(
          [
            { elementType: 'key', id: KEY_A },
            { elementType: 'key', id: KEY_B },
            { elementType: 'sprite', id: SPRITE },
          ],
          makeFields,
          { gestureId: 'gesture-fields', resizeValues: false },
        ),
      ).resolves.toEqual(['applied', 'applied', 'applied']);
      expect(ipc.backend!.commit).toHaveBeenCalledTimes(1);
      expect(ipc.backend!.commit.mock.calls[0][1]).toBe('gesture-fields');
      expect(makeFields).toHaveBeenCalledWith(
        expect.objectContaining({ id: SPRITE, width: 200 }),
        { elementType: 'sprite', id: SPRITE },
      );
      // 칸 패치는 크기를 맞춰도 이동값을 비례하지 않는다
      expect(committedOps()).toEqual([
        {
          op: 'setValues',
          scene: '4key',
          id: KEY_A,
          values: { displayText: 'A' },
        },
        {
          op: 'setFrame',
          scene: '4key',
          id: SPRITE,
          frame: { width: 200, height: 50 },
        },
        {
          op: 'setValues',
          scene: '4key',
          id: SPRITE,
          values: { baseImage: 'wide.png' },
        },
      ]);
    });

    it('트리에 없거나 자리가 없는 칸이 섞인 대상은 targetMissing - 나머지는 커밋한다', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(
        commitFieldPatches(
          [
            { elementType: 'sprite', id: 'missing' },
            { elementType: 'key', id: KEY_A },
            { elementType: 'sprite', id: SPRITE },
          ],
          (_current, target) =>
            target.id === SPRITE ? { groupId: 'g' } : { displayText: 'A' },
          { resizeValues: false },
        ),
      ).resolves.toEqual(['targetMissing', 'applied', 'targetMissing']);
      expect(committedOps()).toEqual([
        {
          op: 'setValues',
          scene: '4key',
          id: KEY_A,
          values: { displayText: 'A' },
        },
      ]);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('미리보기 의도', () => {
    it('요소별 칸 값을 커밋 하나로 - 트리에 없는 요소·자리가 없는 칸은 빼고 알린다', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(
        commitPreviewIntents(
          new Map([
            [
              'key',
              new Map<string, Record<string, unknown>>([
                [KEY_A, { displayText: 'I', dx: 5, zIndex: 3 }],
                ['missing', { displayText: 'X' }],
              ]),
            ],
          ]),
          'gesture-intents',
        ),
      ).resolves.toBe(true);
      expect(ipc.backend!.commit.mock.calls[0][1]).toBe('gesture-intents');
      expect(committedOps()).toEqual([
        { op: 'setFrame', scene: '4key', id: KEY_A, frame: { x: 5 } },
        {
          op: 'setValues',
          scene: '4key',
          id: KEY_A,
          values: { displayText: 'I' },
        },
      ]);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});

describe('보류한 편집', () => {
  it('일시 실패로 보류하면 화면에 남기고 끝난 것으로 둔다 (미리보기를 버리지 않는다)', async () => {
    vi.useFakeTimers();
    const lifecycle = registerGestureSession('gesture-held');
    try {
      ipc.backend!.replace(() => documentOf());
      // 처음 보내기와 다시 보내기 두 번이 모두 일시 실패
      for (let attempt = 0; attempt < 3; attempt += 1) {
        ipc.backend!.commit.mockImplementationOnce(async () => ({
          status: 'rejected',
          revision: 1,
          code: 'HISTORY_IN_PROGRESS',
          violations: [],
        }));
      }
      const pending = commitPropertyPatch(
        [{ elementType: 'key', id: KEY_A }],
        { property: 'displayText', value: 'H' },
        { gestureId: 'gesture-held' },
      );
      await vi.advanceTimersByTimeAsync(2000);
      await expect(pending).resolves.toEqual(['applied']);
      expect(valuesOf('4key', KEY_A).displayText).toBe('H');
      expect(lifecycle.discarded).toBe(false);
    } finally {
      store().discardHeld!();
      releaseGestureSession(lifecycle);
      vi.useRealTimers();
    }
  });
});
