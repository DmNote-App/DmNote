// 창마다 요소 트리 문서 스토어 하나 - 편집 창은 WASM 엔진, 오버레이·OBS는 패치만
import { useSyncExternalStore } from 'react';

import { elementDocumentApi } from '@api/modules/editor/elementDocumentApi';
import { BUILTIN_ELEMENT_KINDS } from '@src/renderer/elementKinds/builtinKinds';
import { elementKindData } from '@src/renderer/elementKinds/defineElementKind';
import type { Scene } from '@src/types/generated/elementDocument';
import type { ElementNode } from './documentPatch';
import {
  createEditorDocumentStore,
  createMirrorDocumentStore,
  type ElementDocumentStore,
} from './elementDocumentStore';

let current: ElementDocumentStore | null = null;
let loading: Promise<ElementDocumentStore> | null = null;
// 구독 중인 컴포넌트 - 스토어가 준비되면 그때 스토어 구독을 붙인다
const listeners = new Map<() => void, (() => void) | null>();

const isEditingWindow = () =>
  window.__dmn_window_type === 'main' || window.__dmn_window_type === 'panel';

const kindsJson = () =>
  JSON.stringify(BUILTIN_ELEMENT_KINDS.map(elementKindData));

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
  if (!isEditingWindow()) return createMirrorDocumentStore(initial, transport);
  const wasm = await import(
    '@src/renderer/wasm/elementDocument/elementDocument.js'
  );
  await wasm.default();
  const kinds = kindsJson();
  return createEditorDocumentStore(
    initial,
    transport,
    (document, revision) =>
      new wasm.EditorDocumentSession(kinds, document, revision),
  );
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
