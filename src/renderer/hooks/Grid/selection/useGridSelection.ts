/**
 * Grid 선택 관련 로직 훅
 * - 선택된 요소들 이동
 * - 선택된 요소들 삭제
 * - 복사/붙여넣기
 */

import { useRef } from 'react';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import {
  useGridSelectionStore,
  type SelectedElement,
  type ClipboardItem,
} from '@stores/grid/useGridSelectionStore';
import { reportElementOpSkipped } from '@src/renderer/editor/runtime/intent/elementIntent';
import { runMixedElementOpsIntent } from '@src/renderer/editor/runtime/intent/mixedElementIntent';
import { sendBridgeMessageBestEffort } from '@utils/plugin/bridgeMessages';
import { rotatePluginInstancesEditSession } from '@plugins/runtime/displayElement/instancesCommitQueue';
import {
  beginMixedGestureTransaction,
  cancelUncommittedMixedGestureTransaction,
} from '@plugins/runtime/displayElement/gestureTransaction';
import {
  moveSelectedPluginElements,
  selectedPluginIds,
} from '@utils/grid/selectionMovement';
import { createSelectionClipboardItems } from '@utils/grid/selectionClipboard';
import { pasteSelection } from './pasteSelection';

interface UseGridSelectionParams {
  selectedElements: SelectedElement[];
  selectedKeyType: string;
}

interface UseGridSelectionReturn {
  moveSelectedElements: (
    deltaX: number,
    deltaY: number,
    gestureId?: string,
    syncToOverlay?: boolean,
  ) => void;
  copySelectedElements: () => void;
  pasteElements: () => Promise<void>;
  syncSelectedElementsToOverlay: (
    gestureId?: string,
    frozenTargets?: readonly SelectedElement[],
  ) => void;
  // 게스처 시작 시점 대상 동결. 정산이 완료 시점 live 선택을 다시 읽으면
  // 대기 중 선택 해제가 eager 이동을 통째로 삼킨다
  freezeSelectionForGesture: () => void;
  clipboard: ClipboardItem[];
}

/**
 * 선택된 요소들 관리 훅
 */
export function useGridSelection({
  selectedElements,
  selectedKeyType,
}: UseGridSelectionParams): UseGridSelectionReturn {
  const setSelectedElements = useGridSelectionStore(
    (state) => state.setSelectedElements,
  );
  const clipboard = useGridSelectionStore((state) => state.clipboard);
  const setClipboard = useGridSelectionStore((state) => state.setClipboard);

  // 훅이 동결을 소유한다 - 호출부가 정산에 인자를 넘기는 것을 잊어도
  // live 재조회로 떨어지지 않게 한다
  const frozenGestureTargetsRef = useRef<readonly SelectedElement[] | null>(
    null,
  );
  const freezeSelectionForGesture = () => {
    frozenGestureTargetsRef.current =
      useGridSelectionStore.getState().selectedElements;
  };

  // 선택된 요소들의 최종 위치를 한 번에 저장
  // 커밋 base는 canonical - rendered에는 다른 세션의 미커밋 프리뷰가 섞일 수 있음
  // 정산 대상은 호출부가 동결한 집합 우선 - eager를 적용한 집합과 커밋 대상이
  // 어긋나면 옛 대상의 이동이 wire에 실리지 않아 다음 canonical 적용에서 소실
  const syncSelectedElementsToOverlay = (
    gestureId?: string,
    frozenTargets?: readonly SelectedElement[],
  ) => {
    const frozen = frozenTargets ?? frozenGestureTargetsRef.current;
    frozenGestureTargetsRef.current = null;
    const currentSelection =
      frozen ?? useGridSelectionStore.getState().selectedElements;
    const selectedPluginElementIds = new Set(
      currentSelection
        .filter((element) => element.type === 'plugin')
        .map((element) => element.id),
    );
    const pluginIds = [
      ...new Set(
        usePluginDisplayElementStore
          .getState()
          .elements.filter((element) =>
            selectedPluginElementIds.has(element.fullId),
          )
          .map((element) => element.pluginId),
      ),
    ];
    // 게스처 정산인데 대상이 하나도 없다 - 호출부가 시작 시점 대상을 동결하지
    // 않아 대기 중 선택 해제가 이동을 통째로 삼킨 경우다. 관측 가능하게 남긴다
    if (gestureId && currentSelection.length === 0) {
      reportElementOpSkipped('drag settlement without frozen targets');
    }
    if (gestureId && pluginIds.length > 0) {
      void runMixedElementOpsIntent({
        gestureId,
        pluginIds,
        ops: [],
        receipt: null,
      }).catch((error: Error) => {
        console.error('Failed to persist selected plugin positions', error);
      });
    }

    // 플러그인 요소도 명시적으로 동기화 (드래그 종료 시 skipSync로 인해 동기화되지 않았을 수 있음)
    const currentPluginElements =
      usePluginDisplayElementStore.getState().elements;
    sendBridgeMessageBestEffort('overlay', 'plugin:displayElements:sync', {
      elements: currentPluginElements,
    });
  };

  // 선택된 요소들 일괄 이동 함수 (배치 업데이트)
  const moveSelectedElements = (
    deltaX: number,
    deltaY: number,
    gestureId?: string,
    syncToOverlay = true,
  ) => {
    if (selectedElements.length === 0) return;

    // 현재 상태 직접 가져오기 (클로저 문제 방지)
    // setPositions는 canonical 쓰기이므로 base도 canonical에서 읽는다
    const currentPluginElements =
      usePluginDisplayElementStore.getState().elements;

    // 플러그인 요소 배치 업데이트
    const pluginUpdateIds = new Set(
      selectedElements
        .filter((element) => element.type === 'plugin')
        .map((element) => element.id),
    );
    let stagedBeforeEagerWrite = false;
    if (pluginUpdateIds.size > 0) {
      if (gestureId) {
        const movedPluginIds = selectedPluginIds(
          currentPluginElements,
          pluginUpdateIds,
        );
        // 화살표 이동은 pointer 시작 경계가 없으므로 여기서 staging을 eager
        // 쓰기 앞에 세운다. 드래그는 Grid의 시작 경계가 이미 같은 id로 stage함
        if (syncToOverlay && movedPluginIds.length > 0) {
          beginMixedGestureTransaction(gestureId, movedPluginIds);
          stagedBeforeEagerWrite = true;
        }
        movedPluginIds.forEach((pluginId) => {
          rotatePluginInstancesEditSession(pluginId, gestureId);
        });
      }
      const newElements = moveSelectedPluginElements(
        currentPluginElements,
        pluginUpdateIds,
        deltaX,
        deltaY,
      );
      // syncToOverlay가 false이면 오버레이 동기화 스킵 (드래그 중)
      usePluginDisplayElementStore
        .getState()
        .setElements(newElements, { skipSync: !syncToOverlay });
    }

    if (syncToOverlay) {
      // 정산은 이 호출이 eager를 적용한 클로저의 선택 집합으로 - RAF flush가
      // 선택 변경 뒤에 돌아도 옛 대상 이동이 그대로 커밋된다
      syncSelectedElementsToOverlay(gestureId, selectedElements);
      // settle이 mixed 커밋을 시작하지 못한 경로의 사전 staging 정산 -
      // 커밋이 소유권을 가져간 staged는 건드리지 않는다
      if (stagedBeforeEagerWrite && gestureId) {
        cancelUncommittedMixedGestureTransaction(gestureId);
      }
    }
  };

  // 선택된 요소들 복사
  const copySelectedElements = () => {
    const items = createSelectionClipboardItems(
      selectedElements,
      usePluginDisplayElementStore.getState().elements,
    );
    if (items.length > 0) setClipboard(items);
  };

  const pasteElements = () =>
    pasteSelection({ selectedKeyType, setSelectedElements });

  return {
    moveSelectedElements,
    copySelectedElements,
    pasteElements,
    syncSelectedElementsToOverlay,
    freezeSelectionForGesture,
    clipboard,
  };
}
