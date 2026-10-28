import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  EditorDocumentSession,
  initSync,
} from '@src/renderer/wasm/elementDocument/elementDocument.js';
import { BUILTIN_ELEMENT_KINDS } from '@src/renderer/elementKinds/builtinKinds';
import { elementKindData } from '@src/renderer/elementKinds/defineElementKind';
import type { Document, Op } from '@src/types/generated/elementDocument';
import type {
  ElementDocumentChangedEvent,
  ElementDocumentCommitResult,
} from '@api/modules/editor/elementDocumentApi';
import {
  createEditorDocumentStore,
  createMirrorDocumentStore,
  type ElementDocumentTransport,
} from './elementDocumentStore';

beforeAll(() => {
  initSync({
    module: readFileSync(
      join(__dirname, '../../wasm/elementDocument/elementDocument_bg.wasm'),
    ),
  });
});

const kinds = JSON.stringify(BUILTIN_ELEMENT_KINDS.map(elementKindData));

const document = (): Document => ({
  formatVersion: 1,
  kindVersions: { key: 1, stat: 1, graph: 1, knob: 1, sprite: 1 },
  scenes: {
    '4key': {
      nodes: [
        {
          type: 'element',
          id: 'k1',
          kind: 'key',
          frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
          values: { displayText: null, count: 0 },
        },
        {
          type: 'element',
          id: 'k2',
          kind: 'key',
          frame: { x: 70, y: 0, width: 60, height: 60, rotation: 0 },
          values: { displayText: null, count: 0 },
        },
      ],
    },
  },
});

const nudge = (id: string, x: number): Op[] => [
  { op: 'setFrame', scene: '4key', id, frame: { x } },
];

const harness = (
  commit: (ops: Op[]) => Promise<ElementDocumentCommitResult>,
) => {
  let emit: (event: ElementDocumentChangedEvent) => void = () => undefined;
  const transport: ElementDocumentTransport = {
    get: async () => ({ revision: 1, document: document() }),
    commit,
    onChanged: (listener) => {
      emit = listener;
      return () => undefined;
    },
  };
  const store = createEditorDocumentStore(
    { revision: 1, document: document() },
    transport,
    (json, revision) => new EditorDocumentSession(kinds, json, revision),
  );
  return { store, emit: (event: ElementDocumentChangedEvent) => emit(event) };
};

describe('편집 창 요소 문서 스토어 (WASM)', () => {
  it('편집은 화면에 먼저 반영하고 거부되면 되돌린다', async () => {
    let resolve: (result: ElementDocumentCommitResult) => void = () =>
      undefined;
    const { store } = harness(
      () =>
        new Promise((next) => {
          resolve = next;
        }),
    );
    const before = store.getScene('4key');
    const untouched = store.getElement('4key', 'k2');
    const listener = vi.fn();
    store.subscribe(listener);
    const pending = store.edit!(nudge('k1', 25));
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(25);
    expect(store.getScene('4key')).not.toBe(before);
    // 바뀌지 않은 요소는 같은 객체
    expect(store.getElement('4key', 'k2')).toBe(untouched);
    resolve({
      status: 'rejected',
      revision: 1,
      code: 'VIOLATION',
      violations: [],
    });
    await pending;
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('규칙에 어긋난 편집은 보내지 않고 위반을 돌려준다', async () => {
    const commit = vi.fn();
    const { store } = harness(commit);
    const result = await store.edit!([
      { op: 'setFrame', scene: '4key', id: 'k1', frame: { width: -1 } },
    ]);
    expect(result).toEqual({
      status: 'invalid',
      violations: [{ code: 'INVALID_FRAME', path: 'ops[0].frame' }],
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it('응답 뒤 패치가 오기 전까지 화면을 지키고 패치로 확정한다', async () => {
    const { store, emit } = harness(async () => ({
      status: 'committed',
      revision: 2,
      changes: { scenes: {} },
    }));
    await store.edit!(nudge('k1', 40));
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(40);
    const after = document();
    const k1 = after.scenes['4key']!.nodes[0];
    if (k1.type === 'element') k1.frame.x = 40;
    emit({
      revision: 2,
      patch: {
        kindVersions: after.kindVersions,
        scenes: { '4key': { type: 'nodes', nodes: [k1] } },
        changes: {
          scenes: {
            '4key': { changed: ['k1'], removed: [], structure: false },
          },
        },
      },
    });
    expect(store.getRevision()).toBe(2);
    expect(store.getElement('4key', 'k1')?.frame.x).toBe(40);
  });
});

describe('오버레이 요소 문서 스토어', () => {
  it('이미 본 리비전의 패치는 무시한다', () => {
    let emit: (event: ElementDocumentChangedEvent) => void = () => undefined;
    const store = createMirrorDocumentStore(
      { revision: 3, document: document() },
      {
        onChanged: (listener) => {
          emit = listener;
          return () => undefined;
        },
      },
    );
    const patch = {
      kindVersions: {},
      scenes: { '4key': { type: 'delete' as const } },
      changes: {
        scenes: {
          '4key': { changed: [], removed: [], structure: false, deleted: true },
        },
      },
    };
    emit({ revision: 3, patch });
    expect(store.getScene('4key')).toBeDefined();
    emit({ revision: 4, patch });
    expect(store.getScene('4key')).toBeUndefined();
  });
});
