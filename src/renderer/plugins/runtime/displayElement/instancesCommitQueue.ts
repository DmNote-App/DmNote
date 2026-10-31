/**
 * plugin instance canonical commit의 플러그인별 직렬화 큐 (main 전용)
 * defineElement debounce 저장과 패널 RPC commit이 서로 다른 시점의 full snapshot으로
 * 상대를 덮지 않도록 일반 저장은 큐 실행 시점 상태를 캡처하고,
 * 제스처 경계 flush는 다음 mutation 전 상태를 고정한다
 */

import { trackEditorWrite } from '@src/renderer/editor/runtime/lifecycle/editorWriteBarrier';

const queues = new Map<string, Promise<unknown>>();

const EDIT_SESSION_TTL_MS = 1200;

interface PluginEditSession {
  id: string;
  active: boolean;
  expiresAt: number;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const editSessions = new Map<string, PluginEditSession>();
const editSessionFlushers = new Map<string, Set<() => void>>();

const schedulePluginInstancesEditSessionCleanup = (
  pluginId: string,
  session: PluginEditSession,
): void => {
  session.active = false;
  session.expiresAt = Date.now() + EDIT_SESSION_TTL_MS;
  if (session.cleanupTimer) clearTimeout(session.cleanupTimer);
  const sessionId = session.id;
  session.cleanupTimer = setTimeout(() => {
    const current = editSessions.get(pluginId);
    if (current?.id === sessionId && !current.active) {
      editSessions.delete(pluginId);
    }
  }, EDIT_SESSION_TTL_MS);
};

export const touchPluginInstancesEditSession = (
  pluginId: string,
  preferredGestureId?: string,
): string => {
  const now = Date.now();
  let session = editSessions.get(pluginId);
  if (session?.active) return session.id;
  if (
    !session ||
    now > session.expiresAt ||
    (preferredGestureId !== undefined && session.id !== preferredGestureId)
  ) {
    if (session?.cleanupTimer) clearTimeout(session.cleanupTimer);
    session = {
      id: preferredGestureId ?? crypto.randomUUID(),
      active: false,
      expiresAt: 0,
      cleanupTimer: null,
    };
    editSessions.set(pluginId, session);
  }
  schedulePluginInstancesEditSessionCleanup(pluginId, session);
  return session.id;
};

export const registerPluginInstancesEditSessionFlush = (
  pluginId: string,
  flush: () => void,
): (() => void) => {
  const flushers = editSessionFlushers.get(pluginId) ?? new Set<() => void>();
  flushers.add(flush);
  editSessionFlushers.set(pluginId, flushers);

  return () => {
    const current = editSessionFlushers.get(pluginId);
    if (!current) return;
    current.delete(flush);
    if (current.size === 0) editSessionFlushers.delete(pluginId);
  };
};

// 등록된 flusher만 실행 - 세션 상태는 건드리지 않는 확정 경계용
export const flushPluginInstancesEditSession = (pluginId: string): void => {
  editSessionFlushers.get(pluginId)?.forEach((flush) => flush());
};

export const rotatePluginInstancesEditSession = (
  pluginId: string,
  preferredGestureId?: string,
): string => {
  const current = editSessions.get(pluginId);
  if (preferredGestureId !== undefined && current?.id === preferredGestureId) {
    return touchPluginInstancesEditSession(pluginId, preferredGestureId);
  }
  flushPluginInstancesEditSession(pluginId);

  const previous = editSessions.get(pluginId);
  if (previous?.cleanupTimer) clearTimeout(previous.cleanupTimer);
  editSessions.delete(pluginId);
  return touchPluginInstancesEditSession(pluginId, preferredGestureId);
};

// 테스트·창 재시작 - 세션 상태 비우기
export const clearPluginInstancesEditSessions = (): void => {
  editSessions.forEach((session) => {
    if (session.cleanupTimer) clearTimeout(session.cleanupTimer);
  });
  editSessions.clear();
};

export const hasConflictingPluginInstancesGesture = (
  pluginId: string,
  gestureId: string,
): boolean => {
  const session = editSessions.get(pluginId);
  return session !== undefined && session.id !== gestureId;
};

// gesture 무관 편집 문맥 존재 판정 - reconcile류 실패 복구의 재주입 가드
export const hasActivePluginInstancesEditContext = (
  pluginId: string,
): boolean => editSessions.has(pluginId);

export const enqueuePluginInstancesCommit = <T>(
  pluginId: string,
  task: () => Promise<T>,
): Promise<T> => {
  const tail = queues.get(pluginId) ?? Promise.resolve();
  const run = tail.then(task, task);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(pluginId, settled);
  void settled.then(() => {
    if (queues.get(pluginId) === settled) queues.delete(pluginId);
  });
  return run;
};

export const getPendingPluginInstancesCommitCount = (): number => queues.size;

/** 그 플러그인들의 지금 줄 선 인스턴스 커밋이 모두 끝날 때 (실패도 끝난 것으로) */
export const settledPluginInstancesCommits = (
  pluginIds: Iterable<string>,
): Promise<void> =>
  Promise.all(
    [...pluginIds].map((pluginId) => queues.get(pluginId) ?? Promise.resolve()),
  ).then(() => undefined);

interface PluginInstancesSaveRequest {
  gestureId?: string;
  captureCurrentSnapshot: boolean;
}

interface PluginInstancesSaveDebounceOptions {
  delayMs: number;
  save: (request: PluginInstancesSaveRequest) => Promise<void>;
  onError: (error: unknown, request: PluginInstancesSaveRequest) => void;
}

export const createPluginInstancesSaveDebounce = ({
  delayMs,
  save,
  onError,
}: PluginInstancesSaveDebounceOptions) => {
  let scheduled:
    | {
        gestureId?: string;
        timer: ReturnType<typeof setTimeout>;
        resolve: () => void;
        reject: (error: unknown) => void;
      }
    | undefined;

  const cancel = () => {
    if (!scheduled) return;
    clearTimeout(scheduled.timer);
    scheduled.resolve();
    scheduled = undefined;
  };

  const runScheduledSave = (captureCurrentSnapshot: boolean): boolean => {
    const pending = scheduled;
    if (!pending) return false;

    clearTimeout(pending.timer);
    scheduled = undefined;
    const request: PluginInstancesSaveRequest = {
      gestureId: pending.gestureId,
      captureCurrentSnapshot,
    };
    let savePromise: Promise<void>;
    try {
      savePromise = save(request);
    } catch (error) {
      onError(error, request);
      pending.reject(error);
      return true;
    }
    void savePromise.then(pending.resolve, (error) => {
      onError(error, request);
      pending.reject(error);
    });
    return true;
  };

  const schedule = (gestureId?: string) => {
    cancel();

    let resolveWrite!: () => void;
    let rejectWrite!: (error: unknown) => void;
    const pendingWrite = new Promise<void>((resolve, reject) => {
      resolveWrite = resolve;
      rejectWrite = reject;
    });
    trackEditorWrite(pendingWrite);

    scheduled = {
      gestureId,
      resolve: resolveWrite,
      reject: rejectWrite,
      timer: setTimeout(() => {
        runScheduledSave(false);
      }, delayMs),
    };
  };

  const flush = () => runScheduledSave(true);

  return { cancel, flush, schedule };
};
