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
  // 장면(탭) id 목록 - 문서 순서
  getSceneIds(): string[];
  getElement(sceneId: string, id: string): ElementNode | undefined;
  subscribe(listener: ElementDocumentListener): () => void;
  // 편집 창만 - 오버레이·OBS는 undefined
  // onDropped - 영구 실패로 편집을 버릴 때(보류했다 다시 보낸 뒤 포함) 다른 스토어에 먼저 얹은 값을 되돌린다.
  // after - 화면에는 바로 얹고, 보내기는 이것이 끝난 뒤(다른 통로의 앞선 저장이 먼저 닿게)
  edit?: (
    ops: Op[],
    options?: {
      gestureId?: string;
      onDropped?: () => void;
      // 백엔드가 받아들였을 때(보류했다 다시 보낸 뒤 포함)
      onCommitted?: () => void;
      after?: Promise<unknown>;
      // false - 화면에 먼저 얹지 않고 패치로 받는다 (자리를 백엔드 규칙이 정하는 연산 - 규칙을 TS에 두지 않는다)
      local?: false;
    },
  ) => Promise<ElementDocumentCommitResult>;
  // 편집 창만 - 이어 붙이는 편집. 마지막 편집이 같은 열쇠·동작 id로 아직 나가지 않았으면 거기에 연산을 붙인다.
  // 화면에는 바로 얹고, quietMs 동안 조용하거나 다른 편집·flushCoalesced가 오면 커밋 하나로 보낸다
  editCoalesced?: (
    ops: Op[],
    options: { key: string; quietMs: number; gestureId?: string },
  ) => Promise<ElementDocumentCommitResult>;
  flushCoalesced?: () => void;
  // 편집 창만 - 일시 실패로 보류한 편집(화면에는 남는다). 다시 보내기는 보류한 차례대로
  getHeldCount?: () => number;
  subscribeHeld?: (listener: () => void) => () => void;
  retryHeld?: () => Promise<boolean>;
  // 보류하게 만든 마지막 실패 (충돌이면 편집 충돌 안내)
  getHeldFailure?: () => CommitFailure | null;
  // 보류한 편집을 모두 버린다 (외부 변경 수용) - 화면에서 빼고 onDropped를 부른다
  discardHeld?: () => void;
  // 편집 창만 - 되돌린 영구 실패 알림
  onRejected?: (listener: (failure: CommitFailure) => void) => () => void;
  // 오버레이·OBS만 - 문서를 통째로 다시 받아 온다 (OBS 재연결·놓친 패치)
  resync?: () => Promise<void>;
  dispose(): void;
}

export type CommitFailure =
  | { result: Extract<ElementDocumentCommitResult, { status: 'rejected' }> }
  | { error: unknown };

/** 보내지 못해 보류한 편집 - 화면에는 남고 다시 보내기를 기다린다 */
export class ElementEditHeldError extends Error {
  constructor() {
    super('[ElementDocument] edit held after transient failure');
  }
}

export interface EditorDocumentStoreOptions {
  // 일시 실패면 쉬었다가 다시 보낸다 - 없으면 모든 실패를 영구로 본다
  isTransient?: (failure: CommitFailure) => boolean;
  retryDelaysMs?: readonly number[];
}

const DEFAULT_RETRY_DELAYS_MS = [300, 1000] as const;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

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
    getSceneIds: () => Object.keys(document.scenes),
    getElement: (sceneId, id) => readElement(document, sceneId, id),
    subscribe: (listener) => listeners.add(listener),
    resync,
    dispose: unsubscribe,
  };
};

interface PendingEdit {
  ops: Op[];
  gestureId?: string;
  onDropped?: () => void;
  onCommitted?: () => void;
  // 백엔드가 받아들인 리비전 - 그 리비전의 패치가 오면 목록에서 빠진다
  acknowledged: number | null;
  // false - 화면에 얹지 않는 편집 (패치로 받는다)
  local?: false;
}

// 이어 붙이는 중인 편집 - 닫히면(release) 보낸다
interface OpenCoalesced {
  edit: PendingEdit;
  sent: Promise<ElementDocumentCommitResult>;
  release: () => void;
  timer: ReturnType<typeof setTimeout>;
  // 이어 붙이기 시작한 때 - 쉬지 않고 이어 써도 이만큼 지나면 보낸다
  openedAt: number;
}

// 쉬지 않고 이어 쓰는 편집도 이 배수(조용히 기다리는 시간의)가 지나면 보낸다
const MAX_COALESCE_QUIET_MULTIPLE = 5;

// 연산이 건드리는 요소·그룹 id
const targetsOf = (op: Op): readonly string[] => {
  switch (op.op) {
    case 'insert':
      return [op.node.id];
    case 'remove':
    case 'move':
      return op.ids;
    case 'group':
      return [op.id, ...op.ids];
    case 'addScene':
    case 'removeScene':
      return [];
    default:
      return [op.id];
  }
};

// 같은 요소 고치기를 합친다 - 사이에 그 요소를 건드린 연산이 없을 때만 (빠르게 이어지는 쓰기가 연산을 쌓지 않게)
const mergeInto = (earlier: Op, op: Op): Op | null => {
  if (earlier.op !== op.op || earlier.scene !== op.scene) return null;
  if (earlier.op === 'setFrame' && op.op === 'setFrame' && earlier.id === op.id)
    return { ...earlier, frame: { ...earlier.frame, ...op.frame } };
  if (
    earlier.op === 'setValues' &&
    op.op === 'setValues' &&
    earlier.id === op.id
  )
    return { ...earlier, values: { ...earlier.values, ...op.values } };
  if (
    earlier.op === 'setCommon' &&
    op.op === 'setCommon' &&
    earlier.id === op.id
  )
    return { ...earlier, ...op };
  return null;
};

const appendOps = (ops: readonly Op[], next: readonly Op[]): Op[] => {
  const merged = [...ops];
  for (const op of next) {
    const targets = targetsOf(op);
    let at = -1;
    for (let index = merged.length - 1; index >= 0; index -= 1) {
      const earlier = merged[index];
      if (!targetsOf(earlier).some((id) => targets.includes(id))) continue;
      at = index;
      break;
    }
    const combined = at >= 0 ? mergeInto(merged[at], op) : null;
    if (combined) merged[at] = combined;
    else merged.push(op);
  }
  return merged;
};

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
  options: EditorDocumentStoreOptions = {},
): ElementDocumentStore => {
  const isTransient = options.isTransient ?? (() => false);
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  let confirmed: Document = initial.document;
  let revision = initial.revision;
  let pending: PendingEdit[] = [];
  let view = confirmed;
  const listeners = new Listeners();
  // 커밋은 하나씩 보낸다 - 백엔드는 동시에 온 커밋의 순서를 지키지 않는다
  let queue: Promise<unknown> = Promise.resolve();
  // 일시 실패로 보류한 편집 - 뒤 편집도 차례를 지키려고 그 뒤에 보류한다
  let held: PendingEdit[] = [];
  const heldListeners = new Set<() => void>();
  const rejectedListeners = new Set<(failure: CommitFailure) => void>();
  let heldFailure: CommitFailure | null = null;
  // 열쇠(플러그인)마다 이어 붙이는 편집 - 열쇠가 다르면 서로 다른 요소라 순서를 바꿔 붙여도 같다
  const open = new Map<string, OpenCoalesced>();
  const closeOne = (key: string) => {
    const current = open.get(key);
    if (!current) return;
    open.delete(key);
    clearTimeout(current.timer);
    current.release();
  };
  // 이어 붙이기를 모두 닫는다 - 더 붙이지 않고 지금 보낸다
  const closeCoalesced = () => {
    for (const key of [...open.keys()]) closeOne(key);
  };
  const setHeld = (next: PendingEdit[], failure?: CommitFailure) => {
    held = next;
    if (failure) heldFailure = failure;
    if (held.length === 0) heldFailure = null;
    for (const listener of [...heldListeners]) listener();
  };

  const rebuild = () => {
    view = pending.reduce(
      (document, edit) =>
        edit.local === false ? document : applyLocalOps(document, edit.ops),
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
    if (edit.local !== false) listeners.emit(localChanges([edit]));
  };
  // 보내기 - 일시 실패는 쉬었다 다시, 다 써도 안 되면 보류(화면에 남김), 영구 실패는 되돌린다
  const send = async (
    edit: PendingEdit,
  ): Promise<ElementDocumentCommitResult> => {
    for (let attempt = 0; ; attempt += 1) {
      let failure: CommitFailure;
      try {
        const result = await transport.commit(edit.ops, edit.gestureId);
        if (result.status === 'committed') {
          edit.acknowledged = result.revision;
          // 패치가 응답보다 먼저 왔으면 여기서 뺀다
          if (settle()) {
            rebuild();
            if (edit.local !== false) listeners.emit(localChanges([edit]));
          }
          edit.onCommitted?.();
          return result;
        }
        failure = { result };
      } catch (error) {
        failure = { error };
      }
      if (isTransient(failure)) {
        if (attempt < retryDelays.length) {
          await wait(retryDelays[attempt]);
          continue;
        }
        setHeld([...held, edit], failure);
        throw new ElementEditHeldError();
      }
      drop(edit);
      edit.onDropped?.();
      for (const listener of [...rejectedListeners]) listener(failure);
      if ('error' in failure) throw failure.error;
      return failure.result;
    }
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
    getSceneIds: () => Object.keys(view.scenes),
    getElement: (sceneId, id) => readElement(view, sceneId, id),
    subscribe: (listener) => listeners.add(listener),
    edit: (ops, editOptions) => {
      // 뒤에 온 편집 - 이어 붙이던 편집은 지금 보내 차례를 지킨다
      closeCoalesced();
      const edit: PendingEdit = {
        ops,
        acknowledged: null,
        gestureId: editOptions?.gestureId,
        onDropped: editOptions?.onDropped,
        onCommitted: editOptions?.onCommitted,
        local: editOptions?.local,
      };
      pending = [...pending, edit];
      if (edit.local !== false) {
        rebuild();
        listeners.emit(localChanges([edit]));
      }
      const after = editOptions?.after?.catch(() => undefined);
      const start = after ? queue.then(() => after) : queue;
      const sent = start.then(() => {
        if (held.length > 0) {
          setHeld([...held, edit]);
          throw new ElementEditHeldError();
        }
        return send(edit);
      });
      queue = sent.catch(() => undefined);
      return sent;
    },
    editCoalesced: (ops, { key, quietMs, gestureId }) => {
      const current = open.get(key);
      if (
        current &&
        current.edit.gestureId === gestureId &&
        Date.now() - current.openedAt < quietMs * MAX_COALESCE_QUIET_MULTIPLE
      ) {
        current.edit.ops = appendOps(current.edit.ops, ops);
        rebuild();
        listeners.emit(localChanges([{ ...current.edit, ops }]));
        clearTimeout(current.timer);
        current.timer = setTimeout(() => closeOne(key), quietMs);
        return current.sent;
      }
      closeOne(key);
      const edit: PendingEdit = { ops, acknowledged: null, gestureId };
      pending = [...pending, edit];
      rebuild();
      listeners.emit(localChanges([edit]));
      let release!: () => void;
      const quiet = new Promise<void>((resolve) => (release = resolve));
      const sent = queue
        .then(() => quiet)
        .then(() => {
          if (held.length > 0) {
            setHeld([...held, edit]);
            throw new ElementEditHeldError();
          }
          return send(edit);
        });
      queue = sent.catch(() => undefined);
      open.set(key, {
        edit,
        sent,
        release,
        timer: setTimeout(() => closeOne(key), quietMs),
        openedAt: Date.now(),
      });
      return sent;
    },
    flushCoalesced: closeCoalesced,
    getHeldCount: () => held.length,
    getHeldFailure: () => heldFailure,
    discardHeld: () => {
      const batch = held;
      setHeld([]);
      for (const edit of batch) {
        drop(edit);
        edit.onDropped?.();
      }
    },
    subscribeHeld: (listener) => {
      heldListeners.add(listener);
      return () => heldListeners.delete(listener);
    },
    retryHeld: () => {
      const run = queue.then(async () => {
        const batch = held;
        setHeld([]);
        for (const edit of batch) {
          if (held.length > 0) {
            setHeld([...held, edit]);
            continue;
          }
          await send(edit).catch(() => undefined);
        }
        return held.length === 0;
      });
      queue = run.catch(() => undefined);
      return run;
    },
    onRejected: (listener) => {
      rejectedListeners.add(listener);
      return () => rejectedListeners.delete(listener);
    },
    dispose: unsubscribe,
  };
};
