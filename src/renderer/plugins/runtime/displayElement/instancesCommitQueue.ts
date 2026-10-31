/**
 * 플러그인 인스턴스 편집 세션 (main 전용) - 이어지는 쓰기에 같은 동작 id를 줘 되돌리기 한 번으로 묶고,
 * 지우기·만들기 같은 끊는 편집은 등록된 입구로 밀린 쓰기를 바로 보낸다
 */

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
