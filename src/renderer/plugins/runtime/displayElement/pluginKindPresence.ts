// 편집 화면에서 플러그인 요소를 플러그인 렌더러가 그리는지 - 정의가 없는 플러그인(지움·끔)의 요소는
// 모르는 종류(자리 표시 상자)로 트리 편집기가 맡는다 (설계 3.11)
import { useSyncExternalStore } from 'react';

import { isPluginKind, pluginIdOfKind } from '@src/types/elementKinds';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import {
  isLocalPluginRuntimeReady,
  subscribePluginReadiness,
} from '../pluginRuntimeReadiness';

/** 지금 상태 기준 - 불러오는 중에는 플러그인 렌더러 몫으로 둔다(시작할 때 상자가 깜빡이지 않게) */
export const pluginRendersKind = (kind: string): boolean => {
  if (!isPluginKind(kind)) return false;
  if (!isLocalPluginRuntimeReady()) return true;
  return usePluginDisplayElementStore
    .getState()
    .definitions.has(pluginIdOfKind(kind));
};

const subscribe = (listener: () => void) => {
  const stopReadiness = subscribePluginReadiness(listener);
  const stopDefinitions = usePluginDisplayElementStore.subscribe(
    (state, previous) => {
      if (state.definitions !== previous.definitions) listener();
    },
  );
  return () => {
    stopReadiness();
    stopDefinitions();
  };
};

// 판정이 바뀔 때만 바뀌는 열쇠 - 정의 목록과 준비 상태
const presenceKey = () =>
  isLocalPluginRuntimeReady()
    ? [...usePluginDisplayElementStore.getState().definitions.keys()]
        .sort()
        .join('\n')
    : null;

const predicates = new Map<string | null, (kind: string) => boolean>();

/** 렌더 중 판정 - 판정이 바뀌면 다른 함수를 돌려줘 메모한 계산이 다시 돈다 */
export const useRenderedPluginKinds = (): ((kind: string) => boolean) => {
  const key = useSyncExternalStore(subscribe, presenceKey, presenceKey);
  let predicate = predicates.get(key);
  if (!predicate) {
    const defined = key === null ? null : new Set(key.split('\n'));
    predicate = (kind) =>
      isPluginKind(kind) &&
      (defined === null || defined.has(pluginIdOfKind(kind)));
    predicates.clear();
    predicates.set(key, predicate);
  }
  return predicate;
};

// 크기 조절 - 플러그인 종류는 정의가 resizable일 때만 (정의가 없으면 모르는 종류처럼 된다). 나머지 종류는 된다
const resizableIn = (
  definitions: ReadonlyMap<string, { resizable?: boolean }>,
  kind: string,
) => {
  if (!isPluginKind(kind)) return true;
  const definition = definitions.get(pluginIdOfKind(kind));
  return !definition || definition.resizable === true;
};

export const isKindResizable = (kind: string): boolean =>
  resizableIn(usePluginDisplayElementStore.getState().definitions, kind);

export const useKindResizable = (kind: string | undefined): boolean =>
  usePluginDisplayElementStore((state) =>
    kind === undefined ? true : resizableIn(state.definitions, kind),
  );
