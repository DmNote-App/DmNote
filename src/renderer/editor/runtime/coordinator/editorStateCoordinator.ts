import { editorApi } from '@api/modules/editor/editorApi';
import { previewApi } from '@api/modules/editor/previewApi';
import { unstable_batchedUpdates } from 'react-dom';
import { useCommittedApplyStore } from '@stores/data/useCommittedApplyStore';
import {
  composeRenderedPositions,
  useKeyStore,
} from '@stores/data/useKeyStore';
import { useLayerGroupStore } from '@stores/data/useLayerGroupStore';
import {
  invalidateSelectionForChangedIndexedElementArrays,
  type IndexedElementArrays,
} from '@stores/grid/useGridSelectionStore';
import { stableStringify } from '@utils/core/stableStringify';

import { createEditorCoordinator } from './editorCoordinator';
import { markGestureSessionsDiscarded } from '../gesture/gestureSessionLifecycle';
import { previewOverlay } from '../gesture/previewOverlay';

import {
  captureElementCollections,
  getItemStoreState,
} from '../../model/elementStores';

import type {
  CanonicalEditorDocumentV1,
  ElementCollections,
} from '@src/types/editor';
import {
  assertCanonicalEditorDocument,
  EDITOR_ELEMENT_POSITION_FIELDS,
  ITEM_ELEMENT_TYPES,
} from '@src/types/editor';

const hasChanged = (current: unknown, next: unknown) =>
  stableStringify(current) !== stableStringify(next);

// 선택 보정 입력 - 키는 매핑·positions, 나머지는 종류별 현재 모드 배열
const indexedArraysFor = (
  keyMappings: Readonly<Record<string, readonly unknown[] | undefined>>,
  keyPositions: ElementCollections['keyPositions'],
  collections: ElementCollections,
  mode: string,
): IndexedElementArrays =>
  ({
    keyMappings: keyMappings[mode] ?? [],
    keyPositions: keyPositions[mode] ?? [],
    ...Object.fromEntries(
      ITEM_ELEMENT_TYPES.map((type) => [
        type,
        collections[EDITOR_ELEMENT_POSITION_FIELDS[type]][mode] ?? [],
      ]),
    ),
  } as unknown as IndexedElementArrays);

let previewSubscribed = false;
let previewSubscriptionInFlight: Promise<void> | null = null;

// 프리뷰 봉투는 편집 UI가 있는 창(main·panel)끼리의 실시간 피드백 전용.
// 오버레이·OBS는 방송 화면이라 스크럽 중 덜덜거림 없이 커밋 시점만 반영한다
const PREVIEW_WINDOW_TYPES = new Set(['main', 'panel']);

const ensurePreviewSubscription = (): Promise<void> => {
  if (!PREVIEW_WINDOW_TYPES.has(window.__dmn_window_type ?? '')) {
    return Promise.resolve();
  }
  if (previewSubscribed) return Promise.resolve();
  if (previewSubscriptionInFlight) return previewSubscriptionInFlight;

  // 채널은 unsubscribe API가 없어 창 단위 coordinator 수명에 맞춰 한 번만 등록
  previewSubscriptionInFlight = previewApi
    .subscribe((envelope) => {
      previewOverlay.applyRemoteEnvelope(envelope);
    })
    .then(() => {
      previewSubscribed = true;
    })
    .catch((error) => {
      console.error('프리뷰 채널 구독 실패', error);
    })
    .finally(() => {
      previewSubscriptionInFlight = null;
    });
  return previewSubscriptionInFlight;
};

export const captureEditorDocument = (): CanonicalEditorDocumentV1 => {
  const keyState = useKeyStore.getState();
  return {
    // 문서 스키마는 v1 유지. v2는 쓰기(commit) 전용 버전이다
    schemaVersion: 1,
    keys: keyState.keyMappings,
    // 프리뷰가 섞이지 않은 canonical만 문서로 캡처
    ...captureElementCollections(),
    layerGroups: useLayerGroupStore.getState().layerGroups,
  };
};

export const applyEditorDocument = (
  document: CanonicalEditorDocumentV1,
): void => {
  unstable_batchedUpdates(() => {
    const keyState = useKeyStore.getState();
    const mode = keyState.selectedKeyType;
    invalidateSelectionForChangedIndexedElementArrays(
      indexedArraysFor(
        keyState.keyMappings,
        keyState.positions,
        captureElementCollections(),
        mode,
      ),
      indexedArraysFor(document.keys, document.keyPositions, document, mode),
    );
    const keyChanges: Partial<
      Pick<typeof keyState, 'keyMappings' | 'positions' | 'canonicalPositions'>
    > = {};
    if (hasChanged(keyState.keyMappings, document.keys)) {
      keyChanges.keyMappings = document.keys;
    }
    if (hasChanged(keyState.canonicalPositions, document.keyPositions)) {
      keyChanges.canonicalPositions = document.keyPositions;
      // 외부 canonical 적용 시에도 활성 프리뷰를 다시 합성
      keyChanges.positions = composeRenderedPositions(document.keyPositions);
    }
    if (Object.keys(keyChanges).length > 0) {
      useKeyStore.setState(keyChanges);
    }

    for (const type of ITEM_ELEMENT_TYPES) {
      const next = document[EDITOR_ELEMENT_POSITION_FIELDS[type]];
      const state = getItemStoreState(type);
      if (hasChanged(state.positions, next)) {
        state.setPositions(next as never);
      }
    }
    if (
      hasChanged(
        useLayerGroupStore.getState().layerGroups,
        document.layerGroups,
      )
    ) {
      useLayerGroupStore.getState().setLayerGroups(document.layerGroups);
    }
  });
};

export const editorCoordinator = createEditorCoordinator({
  transport: editorApi,
  readDocument: captureEditorDocument,
  // OBS 브릿지는 읽기 전용, 네이티브 창은 revision 충돌 검사를 거쳐 쓰기 허용
  readOnly: () => window.__dmn_runtime === 'obs',
  applyDocument: (document, reason) => {
    // OBS는 읽기 전용이므로 차단될 쓰기를 화면에 낙관 적용하지 않음
    if (reason === 'localPatch' && window.__dmn_runtime === 'obs') return;
    assertCanonicalEditorDocument(document, 'editor coordinator document');
    applyEditorDocument(document);
  },
  // canonical 반영과 같은 처리 단위에서 해당 게스처의 프리뷰 오버레이 정리
  onCommittedApplied: (event) => {
    previewOverlay.endSessions(
      event.gestureIds ?? (event.gestureId ? [event.gestureId] : []),
    );
    // canonical 반영 직후 열린 피커의 로컬 편집 상태 재동기화 신호
    // (undo/redo는 historyTick도 올려 진행 중 드래그·초안을 취소)
    useCommittedApplyStore.getState().bump(event.origin);
  },
  onGestureIdsDiscarded: (gestureIds) => {
    markGestureSessionsDiscarded(gestureIds);
    previewOverlay.endSessions(gestureIds);
    gestureIds.forEach((gestureId) => {
      previewApi.cancel(gestureId).catch(() => {});
    });
  },
  onStartSucceeded: ensurePreviewSubscription,
});
