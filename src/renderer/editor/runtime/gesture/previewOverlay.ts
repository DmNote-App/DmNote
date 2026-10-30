/**
 * 편집 프리뷰 오버레이 계층
 * canonical 위에 세션별 patch를 렌더 시점에만 합성, canonical은 불가침
 */

import { type PreviewEnvelope, type PreviewDomain } from '@src/types/preview';

interface PreviewSession {
  mode: string;
  // 같은 창에서는 편집 게스처가 하나뿐이라 로컬 세션도 하나만 활성
  // optional은 개발 중 이전 모듈이 남긴 세션도 로컬로 회수하기 위한 호환
  local?: boolean;
  // 도메인 → 요소 id → 누적 patch (같은 필드는 덮어쓰기). id가 신원이라 canonical reorder에도 같은 요소를 따라간다
  idPatches: Map<PreviewDomain, Map<string, Record<string, unknown>>>;
  lastSeq: number;
}

const sessions = new Map<string, PreviewSession>();

let overlayVersion = 0;
const overlayListeners = new Set<() => void>();

export const subscribePreviewOverlay = (listener: () => void) => {
  overlayListeners.add(listener);
  return () => overlayListeners.delete(listener);
};

export const getPreviewOverlayVersion = () => overlayVersion;

// 종료 세션 tombstone, 늦게 도착한 patch 폐기용
const TOMBSTONE_LIMIT = 64;
const tombstones = new Set<string>();

const addTombstone = (sessionId: string) => {
  tombstones.add(sessionId);
  if (tombstones.size > TOMBSTONE_LIMIT) {
    const oldest = tombstones.values().next().value;
    if (oldest !== undefined) tombstones.delete(oldest);
  }
};

/** 요소 하나의 활성 미리보기 패치(세션 순서대로 합침) - 없으면 null */
export const previewPatchOf = (
  domain: PreviewDomain,
  mode: string,
  id: string,
): Record<string, unknown> | null => {
  let merged: Record<string, unknown> | null = null;
  for (const session of sessions.values()) {
    if (session.mode !== mode) continue;
    const patch = session.idPatches.get(domain)?.get(id);
    if (patch) merged = { ...(merged ?? {}), ...patch };
  }
  return merged;
};

// 키 외 종류 컬렉션에 활성 프리뷰 합성 - 키는 키 스토어가 렌더 positions로 합성한다
const refreshRenderedState = () => {
  overlayVersion += 1;
  overlayListeners.forEach((listener) => listener());
};

const mergeIdPatch = (
  session: PreviewSession,
  domain: PreviewDomain,
  targets: readonly string[],
  patch: Record<string, unknown>,
) => {
  let targetPatches = session.idPatches.get(domain);
  if (!targetPatches) {
    targetPatches = new Map();
    session.idPatches.set(domain, targetPatches);
  }
  for (const id of targets) {
    const existing = targetPatches.get(id);
    targetPatches.set(id, existing ? { ...existing, ...patch } : { ...patch });
  }
};

const removeLocalSessionsExcept = (sessionId: string | null): string[] => {
  const replaced: string[] = [];
  for (const [candidateId, session] of sessions) {
    if (session.local === false || candidateId === sessionId) continue;
    sessions.delete(candidateId);
    addTombstone(candidateId);
    replaced.push(candidateId);
  }
  return replaced;
};

const replacePreviousLocalSession = (sessionId: string): string[] =>
  removeLocalSessionsExcept(sessionId);

export const previewOverlay = {
  /** 로컬(발신) 세션 patch 반영 */
  applyLocalPatchByIds(
    sessionId: string,
    mode: string,
    targets: readonly string[],
    patch: Record<string, unknown>,
    domain: PreviewDomain = 'keyPosition',
  ): string[] {
    return this.applyLocalPatchesByIds(
      sessionId,
      mode,
      targets.map((id) => ({ id, patch })),
      domain,
    );
  },

  applyLocalPatchesByIds(
    sessionId: string,
    mode: string,
    entries: readonly { id: string; patch: Record<string, unknown> }[],
    domain: PreviewDomain = 'keyPosition',
  ): string[] {
    if (tombstones.has(sessionId)) return [];
    const replaced = replacePreviousLocalSession(sessionId);
    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        mode,
        local: true,
        idPatches: new Map(),
        lastSeq: 0,
      };
      sessions.set(sessionId, session);
    }
    for (const { id, patch } of entries) {
      mergeIdPatch(session, domain, [id], patch);
    }
    refreshRenderedState();
    return replaced;
  },

  /** 원격 envelope 반영 (자기 발신 echo는 호출 전에 걸러짐) */
  applyRemoteEnvelope(envelope: PreviewEnvelope): void {
    if (tombstones.has(envelope.sessionId)) return;

    if (envelope.kind === 'cancel') {
      this.endSession(envelope.sessionId);
      return;
    }

    let session = sessions.get(envelope.sessionId);
    if (session) {
      // 세션 내 stale patch 폐기
      if (envelope.seq <= session.lastSeq) return;
    } else {
      session = {
        mode: envelope.mode,
        local: false,
        idPatches: new Map(),
        lastSeq: 0,
      };
      sessions.set(envelope.sessionId, session);
    }
    session.lastSeq = envelope.seq;
    mergeIdPatch(session, envelope.domain, envelope.targets, envelope.patch);
    refreshRenderedState();
  },

  /** 활성 컨트롤러와 연결되지 않은 로컬 세션 회수 */
  discardLocalSessionsExcept(sessionId: string | null): string[] {
    const discarded = removeLocalSessionsExcept(sessionId);
    if (discarded.length > 0) refreshRenderedState();
    return discarded;
  },

  /**
   * 세션 종료 (commit 성공·cancel 공통)
   * 오버레이만 제거하며 canonical은 건드리지 않음
   */
  endSession(sessionId: string): void {
    this.endSessions([sessionId]);
  },

  endSessions(sessionIds: readonly string[]): void {
    let changed = false;
    for (const sessionId of sessionIds) {
      addTombstone(sessionId);
      changed = sessions.delete(sessionId) || changed;
    }
    if (changed) refreshRenderedState();
  },

  /** 테스트·리셋용 전체 정리 */
  clearAll(): void {
    sessions.clear();
    tombstones.clear();
    refreshRenderedState();
  },
};

// 개발 중 모듈 교체에서도 이전 프리뷰를 남기지 않음
const hotModule = (
  import.meta as ImportMeta & {
    hot?: { dispose: (callback: () => void) => void };
  }
).hot;
if (hotModule) {
  hotModule.dispose(() => {
    previewOverlay.clearAll();
  });
}
