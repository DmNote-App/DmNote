// 요소 트리 문서 스토어 - 창마다 하나
// - 편집 창(메인·분리 패널): WASM 엔진 세션. 편집은 화면에 먼저 반영하고(미확정 목록),
//   백엔드가 거부하면 그 편집만 뺀다
// - 오버레이·OBS: 엔진 없이 백엔드 패치만 적용한다
import type {
  ChangeSet,
  Document,
  Op,
  Scene,
  Violation,
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

export type ElementDocumentListener = (changes: ChangeSet) => void;

export type ElementDocumentEditResult =
  | ElementDocumentCommitResult
  | { status: 'invalid'; violations: Violation[] };

export interface ElementDocumentStore {
  getRevision(): number;
  // 장면이 바뀌기 전까지 같은 객체를 돌려준다 (useSyncExternalStore 스냅샷)
  getScene(sceneId: string): Scene | undefined;
  getElement(sceneId: string, id: string): ElementNode | undefined;
  subscribe(listener: ElementDocumentListener): () => void;
  // 편집 창만 - 오버레이·OBS는 undefined
  edit?: (ops: Op[]) => Promise<ElementDocumentEditResult>;
  dispose(): void;
}

// 백엔드와 주고받는 통로 - 테스트에서 바꿔 끼운다
export interface ElementDocumentTransport {
  get(): Promise<ElementDocumentGetResult>;
  commit(ops: Op[]): Promise<ElementDocumentCommitResult>;
  onChanged(listener: (event: ElementDocumentChangedEvent) => void): () => void;
}

// 편집 창 엔진 - WASM EditorDocumentSession과 같은 모양
export interface EditorDocumentEngine {
  push(edit: string): string;
  acknowledge(editId: string, revision: number): string;
  reject(editId: string): string;
  applyRemote(patch: string, revision: number): string;
  reset(document: string, revision: number): string;
  scene(sceneId: string): string | undefined;
  revision(): number;
  free(): void;
}

const isEmpty = (changes: ChangeSet) =>
  Object.keys(changes.scenes).length === 0;

// 바뀌지 않은 요소는 이전 객체를 그대로 써서 React 메모가 깨지지 않게 한다
const shareUnchanged = (
  previous: Scene | undefined,
  next: Scene,
  changed: ReadonlySet<string>,
): Scene => {
  if (!previous) return next;
  const kept = new Map<string, ElementNode>();
  for (const element of sceneElements(previous)) {
    if (!changed.has(element.id)) kept.set(element.id, element);
  }
  const share = (nodes: Scene['nodes']): Scene['nodes'] =>
    nodes.map((node) => {
      if (node.type === 'group') {
        return { ...node, children: share(node.children) };
      }
      const previousElement = kept.get(node.id);
      return previousElement ?? node;
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

/** 오버레이·OBS - 패치만 적용 */
export const createMirrorDocumentStore = (
  initial: ElementDocumentGetResult,
  transport: Pick<ElementDocumentTransport, 'onChanged'>,
): ElementDocumentStore => {
  let document: Document = initial.document;
  let revision = initial.revision;
  const listeners = new Listeners();
  const unsubscribe = transport.onChanged((event) => {
    if (event.revision <= revision) return;
    document = applyDocumentPatch(document, event.patch);
    revision = event.revision;
    listeners.emit(event.patch.changes);
  });
  return {
    getRevision: () => revision,
    getScene: (sceneId) => document.scenes[sceneId],
    getElement: (sceneId, id) => {
      const scene = document.scenes[sceneId];
      return scene
        ? sceneElements(scene).find((element) => element.id === id)
        : undefined;
    },
    subscribe: (listener) => listeners.add(listener),
    dispose: unsubscribe,
  };
};

const parseViolations = (error: unknown): Violation[] => {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const parsed: unknown = JSON.parse(message);
    if (Array.isArray(parsed)) return parsed as Violation[];
  } catch {
    // 규칙 위반이 아닌 오류
  }
  return [{ code: 'VALUE_TYPE_MISMATCH', path: message }];
};

/** 편집 창 - 확정 문서 + 미확정 편집 목록 */
export const createEditorDocumentStore = (
  initial: ElementDocumentGetResult,
  transport: ElementDocumentTransport,
  createEngine: (document: string, revision: number) => EditorDocumentEngine,
): ElementDocumentStore => {
  const engine = createEngine(
    JSON.stringify(initial.document),
    initial.revision,
  );
  const listeners = new Listeners();
  const scenes = new Map<string, Scene | undefined>();

  const sceneFromEngine = (sceneId: string): Scene | undefined => {
    const json = engine.scene(sceneId);
    return json === undefined ? undefined : (JSON.parse(json) as Scene);
  };

  const absorb = (json: string) => {
    const changes = JSON.parse(json) as ChangeSet;
    for (const [sceneId, change] of Object.entries(changes.scenes)) {
      if (!change || !scenes.has(sceneId)) continue;
      const next = sceneFromEngine(sceneId);
      scenes.set(
        sceneId,
        next && change.changed
          ? shareUnchanged(scenes.get(sceneId), next, new Set(change.changed))
          : next,
      );
    }
    listeners.emit(changes);
  };

  let editSequence = 0;
  const unsubscribe = transport.onChanged((event) => {
    if (event.revision <= engine.revision()) return;
    absorb(engine.applyRemote(JSON.stringify(event.patch), event.revision));
  });

  return {
    getRevision: () => engine.revision(),
    getScene: (sceneId) => {
      if (!scenes.has(sceneId)) scenes.set(sceneId, sceneFromEngine(sceneId));
      return scenes.get(sceneId);
    },
    getElement(sceneId, id) {
      const scene = this.getScene(sceneId);
      return scene
        ? sceneElements(scene).find((element) => element.id === id)
        : undefined;
    },
    subscribe: (listener) => listeners.add(listener),
    edit: async (ops) => {
      editSequence += 1;
      const id = `edit-${editSequence}-${Date.now()}`;
      try {
        absorb(engine.push(JSON.stringify({ id, ops })));
      } catch (error) {
        return { status: 'invalid', violations: parseViolations(error) };
      }
      let result: ElementDocumentCommitResult;
      try {
        result = await transport.commit(ops);
      } catch (error) {
        absorb(engine.reject(id));
        throw error;
      }
      absorb(
        result.status === 'committed'
          ? engine.acknowledge(id, result.revision)
          : engine.reject(id),
      );
      return result;
    },
    dispose: () => {
      unsubscribe();
      engine.free();
    },
  };
};
