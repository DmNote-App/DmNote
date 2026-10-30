// 요소 트리 문서 스토어 - 창마다 하나
// - 편집 창(메인·분리 패널): 확정 문서 + 미확정 편집 목록. 편집은 화면에 먼저 반영하고(낙관 적용),
//   백엔드가 거부하면 그 편집만 빼고, 받아들인 편집은 그 리비전의 패치가 오면 뺀다
// - 오버레이·OBS: 백엔드 패치만 적용한다
import type {
  ChangeSet,
  Document,
  Op,
  Scene,
} from '@src/types/generated/elementDocument';
import type {
  ElementDocumentChangedEvent,
  ElementDocumentCommitResult,
  ElementDocumentGetResult,
} from '@api/modules/editor/elementDocumentApi';
import {
  applyDocumentPatch,
  sceneElements,
  type ElementNode,
} from './documentPatch';
import { applyLocalOps, touchedByOps } from './documentLocalOps';

export type ElementDocumentListener = (changes: ChangeSet) => void;

export interface ElementDocumentStore {
  getRevision(): number;
  // 장면이 바뀌기 전까지 같은 객체를 돌려준다 (useSyncExternalStore 스냅샷)
  getScene(sceneId: string): Scene | undefined;
  getElement(sceneId: string, id: string): ElementNode | undefined;
  subscribe(listener: ElementDocumentListener): () => void;
  // 편집 창만 - 오버레이·OBS는 undefined
  edit?: (
    ops: Op[],
    options?: { gestureId?: string },
  ) => Promise<ElementDocumentCommitResult>;
  // 오버레이·OBS만 - 문서를 통째로 다시 받아 온다 (OBS 재연결·놓친 패치)
  resync?: () => Promise<void>;
  dispose(): void;
}

// 백엔드와 주고받는 통로 - 테스트에서 바꿔 끼운다
export interface ElementDocumentTransport {
  get(): Promise<ElementDocumentGetResult>;
  commit(ops: Op[], gestureId?: string): Promise<ElementDocumentCommitResult>;
  onChanged(listener: (event: ElementDocumentChangedEvent) => void): () => void;
}

const isEmpty = (changes: ChangeSet) =>
  Object.keys(changes.scenes).length === 0;

// 장면을 통째로 바꾼 패치도 바뀌지 않은 요소는 이전 객체를 그대로 써서 React 메모가 깨지지 않게 한다
const shareUnchanged = (
  previous: Scene,
  next: Scene,
  changed: ReadonlySet<string>,
): Scene => {
  const kept = new Map<string, ElementNode>();
  for (const element of sceneElements(previous)) {
    if (!changed.has(element.id)) kept.set(element.id, element);
  }
  const share = (nodes: Scene['nodes']): Scene['nodes'] =>
    nodes.map((node) => {
      if (node.type === 'group') {
        return { ...node, children: share(node.children) };
      }
      return kept.get(node.id) ?? node;
    });
  return { ...next, nodes: share(next.nodes) };
};

class Listeners {
  private listeners = new Set<ElementDocumentListener>();

  add(listener: ElementDocumentListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(changes: ChangeSet) {
    if (isEmpty(changes)) return;
    for (const listener of [...this.listeners]) listener(changes);
  }
}

// 백엔드 패치 적용 - 장면을 통째로 바꾼 패치도 바뀌지 않은 요소는 이전 객체로 둔다
const applyIncoming = (
  document: Document,
  event: ElementDocumentChangedEvent,
): Document => {
  const next = applyDocumentPatch(document, event.patch);
  for (const [sceneId, scenePatch] of Object.entries(event.patch.scenes)) {
    const before = document.scenes[sceneId];
    const after = next.scenes[sceneId];
    if (scenePatch?.type !== 'replace' || !before || !after) continue;
    const changed = event.patch.changes.scenes[sceneId]?.changed ?? [];
    next.scenes[sceneId] = shareUnchanged(before, after, new Set(changed));
  }
  return next;
};

const readScene = (document: Document, sceneId: string) =>
  document.scenes[sceneId];

const readElement = (document: Document, sceneId: string, id: string) => {
  const scene = document.scenes[sceneId];
  return scene
    ? sceneElements(scene).find((element) => element.id === id)
    : undefined;
};

// 문서를 통째로 바꿨을 때 알림 - 앞뒤 문서의 모든 장면
const replacedChanges = (before: Document, after: Document): ChangeSet => ({
  scenes: Object.fromEntries(
    [...new Set([...Object.keys(before.scenes), ...Object.keys(after.scenes)])]
      .sort()
      .map((sceneId) => [
        sceneId,
        { changed: [], removed: [], structure: true },
      ]),
  ),
});

/** 오버레이·OBS - 패치만 적용, 놓쳤으면 통째로 다시 받아 온다 */
export const createMirrorDocumentStore = (
  initial: ElementDocumentGetResult,
  transport: Pick<ElementDocumentTransport, 'get' | 'onChanged'>,
): ElementDocumentStore => {
  let document: Document = initial.document;
  let revision = initial.revision;
  const listeners = new Listeners();
  const apply = (event: ElementDocumentChangedEvent) => {
    if (event.revision <= revision) return;
    document = applyIncoming(document, event);
    revision = event.revision;
    listeners.emit(event.patch.changes);
  };
  // 다시 받아 오는 동안 온 패치 - 받아 온 문서보다 새 것만 뒤에 적용한다
  let held: ElementDocumentChangedEvent[] | null = null;
  const unsubscribe = transport.onChanged((event) => {
    if (held) held.push(event);
    else apply(event);
  });
  let resyncing: Promise<void> | null = null;
  const resync = () => {
    resyncing ??= (async () => {
      held = [];
      try {
        const latest = await transport.get();
        const before = document;
        // 앱을 다시 켜면 리비전이 처음부터 시작한다 - 받아 온 리비전을 그대로 쓴다
        document = latest.document;
        revision = latest.revision;
        listeners.emit(replacedChanges(before, document));
      } finally {
        const pending = held;
        held = null;
        resyncing = null;
        for (const event of pending) apply(event);
      }
    })();
    return resyncing;
  };
  return {
    getRevision: () => revision,
    getScene: (sceneId) => readScene(document, sceneId),
    getElement: (sceneId, id) => readElement(document, sceneId, id),
    subscribe: (listener) => listeners.add(listener),
    resync,
    dispose: unsubscribe,
  };
};

interface PendingEdit {
  ops: Op[];
  // 백엔드가 받아들인 리비전 - 그 리비전의 패치가 오면 목록에서 빠진다
  acknowledged: number | null;
}

// 미확정 편집이 건드린 요소를 알림 모양으로
const localChanges = (edits: readonly PendingEdit[]): ChangeSet => {
  const changes: ChangeSet = { scenes: {} };
  for (const edit of edits) {
    for (const [sceneId, touched] of Object.entries(touchedByOps(edit.ops))) {
      const change = (changes.scenes[sceneId] ??= {
        changed: [],
        removed: [],
        structure: false,
      });
      change.changed.push(...touched.ids);
      change.structure ||= touched.structure;
    }
  }
  return changes;
};

const mergeChanges = (a: ChangeSet, b: ChangeSet): ChangeSet => {
  const scenes = { ...a.scenes };
  for (const [sceneId, change] of Object.entries(b.scenes)) {
    if (!change) continue;
    const previous = scenes[sceneId];
    scenes[sceneId] = previous
      ? {
          ...previous,
          changed: [...previous.changed, ...change.changed],
          removed: [...previous.removed, ...change.removed],
          structure: previous.structure || change.structure,
        }
      : change;
  }
  return { scenes };
};

/** 편집 창 - 확정 문서 + 미확정 편집 목록 */
export const createEditorDocumentStore = (
  initial: ElementDocumentGetResult,
  transport: ElementDocumentTransport,
): ElementDocumentStore => {
  let confirmed: Document = initial.document;
  let revision = initial.revision;
  let pending: PendingEdit[] = [];
  let view = confirmed;
  const listeners = new Listeners();
  // 커밋은 하나씩 보낸다 - 백엔드는 동시에 온 커밋의 순서를 지키지 않는다
  let queue: Promise<unknown> = Promise.resolve();

  const rebuild = () => {
    view = pending.reduce(
      (document, edit) => applyLocalOps(document, edit.ops),
      confirmed,
    );
  };
  // 확정 문서에 이미 들어간 편집을 뺀다 - 뺀 것이 있으면 true
  const settle = () => {
    const before = pending.length;
    pending = pending.filter(
      (edit) => edit.acknowledged === null || edit.acknowledged > revision,
    );
    return pending.length !== before;
  };
  const drop = (edit: PendingEdit) => {
    pending = pending.filter((other) => other !== edit);
    rebuild();
    listeners.emit(localChanges([edit]));
  };

  const unsubscribe = transport.onChanged((event) => {
    if (event.revision <= revision) return;
    const before = pending;
    confirmed = applyIncoming(confirmed, event);
    revision = event.revision;
    settle();
    rebuild();
    // 미확정 편집이 다시 얹히거나 빠진 요소도 함께 알린다
    listeners.emit(mergeChanges(event.patch.changes, localChanges(before)));
  });

  return {
    getRevision: () => revision,
    getScene: (sceneId) => readScene(view, sceneId),
    getElement: (sceneId, id) => readElement(view, sceneId, id),
    subscribe: (listener) => listeners.add(listener),
    edit: async (ops, options) => {
      const edit: PendingEdit = { ops, acknowledged: null };
      pending = [...pending, edit];
      rebuild();
      listeners.emit(localChanges([edit]));
      const sent = queue.then(() => transport.commit(ops, options?.gestureId));
      queue = sent.catch(() => undefined);
      let result: ElementDocumentCommitResult;
      try {
        result = await sent;
      } catch (error) {
        drop(edit);
        throw error;
      }
      if (result.status !== 'committed') {
        drop(edit);
        return result;
      }
      edit.acknowledged = result.revision;
      // 패치가 응답보다 먼저 왔으면 여기서 뺀다
      if (settle()) {
        rebuild();
        listeners.emit(localChanges([edit]));
      }
      return result;
    },
    dispose: unsubscribe,
  };
};
