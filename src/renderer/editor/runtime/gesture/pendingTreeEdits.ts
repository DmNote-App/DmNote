/**
 * 대기 중인 트리 편집 - 트리로 보낸 겉모습 편집의 옛 칸 값을 백엔드 확인 전까지 읽기에 얹는다.
 * 미리보기 오버레이처럼 canonical은 불가침 - 코디네이터가 스토어를 읽어 칸 단위로 커밋·되감기를 하므로
 * 스토어에 쓰지 않는다. 옛 스토어를 걷는 4단계 동안만 쓰는 다리
 */
import type { PreviewDomain } from '@src/types/preview';

type Fields = Record<string, unknown>;

interface PendingEntry {
  domain: PreviewDomain;
  mode: string;
  id: string;
  fields: Fields;
}

let entries: PendingEntry[] = [];
let version = 0;
const listeners = new Set<() => void>();

const changed = () => {
  version += 1;
  listeners.forEach((listener) => listener());
};

const remove = (entry: PendingEntry) => {
  if (!entries.includes(entry)) return;
  entries = entries.filter((other) => other !== entry);
  changed();
};

export const subscribePendingTreeEdits = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const hasPendingTreeEdits = () => entries.length > 0;

/** 대기 편집 하나 - 같은 칸은 나중 편집이 덮는다. 돌려준 함수로 내린다 */
export const addPendingTreeEdit = (
  domain: PreviewDomain,
  mode: string,
  id: string,
  fields: Fields,
): (() => void) => {
  const entry: PendingEntry = { domain, mode, id, fields };
  entries = [...entries, entry];
  changed();
  return () => remove(entry);
};

// 같은 canonical·같은 대기 편집이면 같은 결과 - 선택자·메모가 참조로 비교한다
const cache = new WeakMap<
  object,
  Map<PreviewDomain, { version: number; result: unknown }>
>();

/** 대기 편집을 얹은 탭별 위치 - 바뀐 요소·탭만 새 객체, 없으면 같은 참조 */
export const composePendingTreeEdits = <T extends { id: string }>(
  domain: PreviewDomain,
  canonical: Record<string, T[]>,
): Record<string, T[]> => {
  const relevant = entries.filter((entry) => entry.domain === domain);
  if (relevant.length === 0) return canonical;
  let byDomain = cache.get(canonical);
  if (!byDomain) {
    byDomain = new Map();
    cache.set(canonical, byDomain);
  }
  const cached = byDomain.get(domain);
  if (cached?.version === version) return cached.result as Record<string, T[]>;

  let result = canonical;
  for (const [mode, list] of Object.entries(canonical)) {
    const inMode = relevant.filter((entry) => entry.mode === mode);
    if (inMode.length === 0 || !list) continue;
    let next: T[] | null = null;
    list.forEach((position, index) => {
      const own = inMode.filter((entry) => entry.id === position.id);
      if (own.length === 0) return;
      const patched: Record<string, unknown> = { ...position };
      for (const entry of own) {
        for (const [field, value] of Object.entries(entry.fields)) {
          if (value === null) delete patched[field];
          else patched[field] = value;
        }
      }
      next ??= [...list];
      next[index] = patched as T;
    });
    if (next) result = { ...result, [mode]: next };
  }
  byDomain.set(domain, { version, result });
  return result;
};

/** 테스트·리셋용 */
export const clearPendingTreeEdits = () => {
  if (entries.length === 0) return;
  entries = [];
  changed();
};
