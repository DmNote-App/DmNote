// 창마다 요소 트리 문서 스토어 하나 - 편집 창만 커밋을 보낸다
import { useSyncExternalStore } from 'react';

import { elementDocumentApi } from '@api/modules/editor/elementDocumentApi';
import { obsApi } from '@api/modules/window/obsApi';
import type { Scene } from '@src/types/generated/elementDocument';
import type { ElementNode } from './documentPatch';
import {
  createEditorDocumentStore,
  createMirrorDocumentStore,
  type ElementDocumentStore,
} from './elementDocumentStore';
import { isTransientTreeWriteFailure } from './treeWriteFailure';
import { registerHeldEditorWrites } from '@src/renderer/editor/runtime/lifecycle/editorWriteBarrier';

let current: ElementDocumentStore | null = null;
let loading: Promise<ElementDocumentStore> | null = null;
// 구독 중인 컴포넌트 - 스토어가 준비되면 그때 스토어 구독을 붙인다
const listeners = new Map<() => void, (() => void) | null>();

const isEditingWindow = () =>
  window.__dmn_window_type === 'main' || window.__dmn_window_type === 'panel';

const create = async (): Promise<ElementDocumentStore> => {
  // 이벤트를 먼저 구독해 조회와 첫 패치 사이 변경을 놓치지 않는다
  const buffered: Parameters<
    Parameters<typeof elementDocumentApi.onChanged>[0]
  >[0][] = [];
  let forward: ((event: (typeof buffered)[number]) => void) | null = null;
  const unsubscribe = elementDocumentApi.onChanged((event) => {
    if (forward) forward(event);
    else buffered.push(event);
  });
  await unsubscribe.ready;
  const initial = await elementDocumentApi.get();
  const transport = {
    get: elementDocumentApi.get,
    commit: elementDocumentApi.commit,
    onChanged: (listener: (event: (typeof buffered)[number]) => void) => {
      forward = listener;
      for (const event of buffered.splice(0)) listener(event);
      return unsubscribe;
    },
  };
  if (isEditingWindow()) {
    const store = createEditorDocumentStore(initial, transport, {
      isTransient: isTransientTreeWriteFailure,
    });
    // 보류가 없어도 차례를 탄다 - 이미 돌고 있는 다시 보내기(보류 목록은 시작하자마자 비운다)를 기다린다
    registerHeldEditorWrites(() => store.retryHeld!());
    return store;
  }
  const store = createMirrorDocumentStore(initial, transport);
  // OBS 재연결·놓친 패치 - 옛 상태 재동기화와 같은 신호로 트리도 다시 받아 온다
  obsApi.onResync(() => {
    void store
      .resync?.()
      .catch((error) =>
        console.error('[ElementDocument] failed to resync', error),
      );
  });
  return store;
};

export const loadElementDocumentStore = (): Promise<ElementDocumentStore> => {
  loading ??= create().then((store) => {
    current = store;
    for (const listener of [...listeners.keys()]) {
      listeners.set(listener, store.subscribe(listener));
      listener();
    }
    return store;
  });
  return loading;
};

export const getElementDocumentStore = () => current;

const subscribeStore = (listener: () => void) => {
  listeners.set(listener, current?.subscribe(listener) ?? null);
  return () => {
    listeners.get(listener)?.();
    listeners.delete(listener);
  };
};

/** 스토어를 읽어 왔는지 - 오버레이 첫 공개가 트리 요소까지 기다린다 */
export const useElementDocumentReady = (): boolean =>
  useSyncExternalStore(
    subscribeStore,
    () => current !== null,
    () => false,
  );

/** 장면 하나 - 스토어가 준비되기 전이나 장면이 없으면 undefined */
export const useElementDocumentScene = (sceneId: string): Scene | undefined =>
  useSyncExternalStore(
    subscribeStore,
    () => current?.getScene(sceneId),
    () => undefined,
  );

export const useDocumentElement = (
  sceneId: string,
  id: string,
): ElementNode | undefined =>
  useSyncExternalStore(
    subscribeStore,
    () => current?.getElement(sceneId, id),
    () => undefined,
  );
