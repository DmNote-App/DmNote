// 실제 트리 스토어·런타임 아래에 붙이는 가짜 백엔드 - 커밋은 창의 로컬 연산 적용으로 다음 문서를 만들어
// 패치를 보내고 응답한다. hold()로 커밋을 붙잡아 응답 전 상태(낙관 반영·대기 중 편집)를 본다
//   const backend = vi.hoisted(() => ({ current: null as FakeElementDocumentBackend | null }));
//   vi.mock('@api/modules/editor/elementDocumentApi', () => ({
//     elementDocumentApi: new Proxy({}, { get: (_t, name) => backend.current!.api[name] }),
//   }));
import { vi } from 'vitest';

import { applyLocalOps } from '@src/renderer/editor/document/documentLocalOps';
import { sceneElements } from '@src/renderer/editor/document/documentPatch';
import type {
  ElementDocumentChangedEvent,
  ElementDocumentCommitResult,
} from '@api/modules/editor/elementDocumentApi';
import type { Document, Op } from '@src/types/generated/elementDocument';

export type FakeElementDocumentBackend = ReturnType<
  typeof createFakeElementDocumentBackend
>;

export const createFakeElementDocumentBackend = (initial: Document) => {
  let document = initial;
  let revision = 1;
  let held = false;
  const waiting: Array<() => void> = [];
  const listeners = new Set<(event: ElementDocumentChangedEvent) => void>();

  // 다음 문서로 바꾸고 바뀐 장면을 통째 교체 패치로 보낸다
  const publish = (next: Document) => {
    const scenes = Object.keys(next.scenes).filter(
      (sceneId) => next.scenes[sceneId] !== document.scenes[sceneId],
    );
    document = next;
    revision += 1;
    const changes = {
      scenes: Object.fromEntries(
        scenes.map((sceneId) => [
          sceneId,
          {
            changed: sceneElements(next.scenes[sceneId]!).map(({ id }) => id),
            removed: [],
            structure: true,
          },
        ]),
      ),
    };
    const event: ElementDocumentChangedEvent = {
      revision,
      patch: {
        kindVersions: next.kindVersions,
        scenes: Object.fromEntries(
          scenes.map((sceneId) => [
            sceneId,
            { type: 'replace' as const, scene: next.scenes[sceneId]! },
          ]),
        ),
        changes,
      },
    };
    for (const listener of [...listeners]) listener(event);
    return changes;
  };

  // 백엔드처럼 패치를 응답보다 먼저 보낸다
  const apply = (ops: Op[]): ElementDocumentCommitResult => {
    const changes = publish(applyLocalOps(document, ops));
    return { status: 'committed', revision, changes };
  };

  const commit = vi.fn(
    (ops: Op[], _gestureId?: string): Promise<ElementDocumentCommitResult> =>
      new Promise((resolve) => {
        const run = () => resolve(apply(ops));
        if (held) waiting.push(run);
        else run();
      }),
  );

  return {
    api: {
      get: async () => ({ revision, document }),
      commit,
      onChanged: (listener: (event: ElementDocumentChangedEvent) => void) => {
        listeners.add(listener);
        return Object.assign(() => listeners.delete(listener), {
          ready: Promise.resolve(),
        });
      },
    },
    commit,
    document: () => document,
    /** 이후 커밋을 응답 없이 붙잡는다 */
    hold: () => {
      held = true;
    },
    /** 붙잡은 커밋 하나만 적용·응답한다 (붙잡기는 그대로) */
    releaseNext: () => {
      const run = waiting.shift();
      if (!run) throw new Error('붙잡은 커밋이 없다');
      run();
    },
    /** 붙잡은 커밋 수 */
    heldCount: () => waiting.length,
    /** 다른 창·되돌리기처럼 이 창 밖에서 문서가 바뀐다 */
    replace: (next: (document: Document) => Document) => {
      publish(next(document));
    },
    /** 붙잡은 커밋을 차례로 적용·응답하고 붙잡기를 푼다 */
    release: () => {
      held = false;
      for (const run of waiting.splice(0)) run();
    },
  };
};
