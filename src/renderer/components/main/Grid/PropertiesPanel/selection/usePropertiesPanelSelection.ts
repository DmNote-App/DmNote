'use no memo';
// 트리 스토어·프리뷰 오버레이(모듈 상태)를 렌더 중에 읽어서 컴파일러 메모 제외
import { useMemo, useSyncExternalStore } from 'react';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { propertyPanelSelectionOf } from '../../document/treeEditedSelection';
import { wholeGroupOf } from '../../document/documentGroups';
import {
  getElementDocumentStore,
  useElementDocumentScene,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import { sceneElements } from '@src/renderer/editor/document/documentPatch';
import { keySlotOf } from '@src/renderer/elementKinds/definitions/key/keySlotInfo';
import type { KeyPosition } from '@src/types/key/keys';
import {
  sceneElementLookup,
  viewFieldsLookup,
} from '@src/renderer/elementKinds/runtime/viewFields';
import {
  selectPropertyPanelPluginElements,
  usePluginDisplayElementStore,
} from '@stores/plugin/usePluginDisplayElementStore';
import { isNativeElementId } from '@src/renderer/editor/model/elementId';
import {
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import type { CanonicalReactiveSpritePosition } from '@src/types/editor';
import type { BatchGeometryTarget } from '@src/renderer/editor/runtime/operations/elementOps';
import type { GraphItemPosition } from '@src/types/key/graphItems';
import type { KnobItemPosition } from '@src/types/key/knobs';
import type { StatItemPosition } from '@src/types/key/statItems';
import { getKeyInfoByGlobalKey } from '@utils/input/KeyMaps';
import { slotCanonical, slotDisplayName } from '@utils/keySlot';
import { isPluginVisibleInMode } from '@utils/layerGroupUtils';
import { resolveResizablePluginElementSize } from '@utils/plugin/layout/pluginElementMeasurement';

export const usePropertiesPanelSelection = () => {
  const legacySelection = useDocumentSelectionStore(
    (state) => state.selectedElements,
  );
  const documentSceneId = useDocumentSelectionStore((state) => state.sceneId);
  const documentIds = useDocumentSelectionStore((state) => state.selectedIds);
  // 트리 문서가 바뀌면(종류 확인) 다시 합친다
  useElementDocumentScene(documentSceneId ?? '');
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  // 패널이 읽는 위치 기록·키 슬롯은 트리에서 (지금 탭, 편집 미리보기 포함) - 바뀌면 다시 읽는다
  const scene = useElementDocumentScene(selectedKeyType);
  // 트리 선택 중 트리로 옮긴 옛 종류·플러그인 요소는 옛 패널이 옛 선택과 함께 고른 것처럼 본다(트리에만 있는
  // 종류가 섞여도 - 섞인 선택은 고른 종류들 선언의 합 패널). 트리에만 있는 종류 요소는 따로 든다
  // (위치·회전·숨김·이름·지우기 커밋은 공통 커밋 경로가 트리로 보낸다)
  // 같은 선택이면 같은 참조 - 선택 바뀜 effect(피커·하위 페이지 닫기)가 렌더마다, 트리를 고칠 때마다 돌지 않게.
  // 장면이 바뀌면(종류 확인·지운 요소, documentScene 구독) 다시 합치되 고른 요소가 같으면 앞 목록을 그대로 쓴다
  const split = documentSceneId
    ? propertyPanelSelectionOf(legacySelection, documentSceneId, documentIds)
    : { elements: legacySelection, treeOnlyIds: [] as string[] };
  const merged = split.elements;
  const mergedKey = merged
    .map((element) => `${element.type}:${element.id}:${element.index ?? ''}`)
    .join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 내용(종류·id·순번)이 같으면 같은 참조
  const selectedElements = useMemo(() => merged, [mergedKey]);
  const treeOnlyKey = split.treeOnlyIds.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 내용이 같으면 같은 참조
  const treeOnlyIds = useMemo(() => split.treeOnlyIds, [treeOnlyKey]);
  const bridgedDocumentSelection =
    selectedElements.length > legacySelection.length;
  const previewVersion = useSyncExternalStore(
    subscribePreviewOverlay,
    getPreviewOverlayVersion,
    getPreviewOverlayVersion,
  );
  // 패널이 읽는 요소·보이는 칸(편집 미리보기 포함) - 지금 탭 트리에서 id로.
  // 장면·미리보기 판마다 하나라 받는 쪽 메모가 바뀔 때만 다시 계산한다
  const elementOf = sceneElementLookup(scene);
  const viewOf = viewFieldsLookup(scene, selectedKeyType, previewVersion);
  const pluginElements = usePluginDisplayElementStore(
    selectPropertyPanelPluginElements,
  );
  const pluginDefinitions = usePluginDisplayElementStore(
    (state) => state.definitions,
  );

  const selectedKeyElements = selectedElements.filter(
    (element) => element.type === 'key',
  );
  const selectedStatElements = selectedElements.filter(
    (element) => element.type === 'stat',
  );
  const selectedGraphElements = selectedElements.filter(
    (element) => element.type === 'graph',
  );
  const selectedKnobElements = selectedElements.filter(
    (element) => element.type === 'knob',
  );
  const selectedSpriteElements = selectedElements.filter(
    (element) => element.type === 'sprite',
  );
  const selectedKeyLikeElements = selectedElements.filter(
    (element) => element.type === 'key' || element.type === 'stat',
  );
  const selectedBatchStyleElements = selectedElements.filter(
    (element) =>
      element.type === 'key' ||
      element.type === 'stat' ||
      element.type === 'graph' ||
      element.type === 'knob',
  );
  // 기하 대상은 스타일 대상과 별개 - sprite는 배치 스타일이 없지만
  // 정렬·분배·간격·이동에는 참여한다
  const selectedBatchGeometryElements = selectedElements.filter(
    (element) =>
      element.type === 'key' ||
      element.type === 'stat' ||
      element.type === 'graph' ||
      element.type === 'knob' ||
      element.type === 'sprite',
  );
  const selectedPluginElements = selectedElements.filter(
    (element) => element.type === 'plugin',
  );

  const selectedPluginElement = (() => {
    if (selectedPluginElements.length !== 1) return null;
    return (
      pluginElements.find(
        (element) => element.fullId === selectedPluginElements[0].id,
      ) ?? null
    );
  })();

  // invalid native ID 또는 모드에서 사라진 plugin이 섞이면 fail-closed
  // 정렬·분배·간격·크기 대상 - 옛 종류와 트리에만 있는 종류 요소 (그 종류)
  const batchGeometryTargets: BatchGeometryTarget[] = [
    ...selectedBatchGeometryElements.map((element) => ({
      type: element.type as string,
      id: element.id,
    })),
    ...treeOnlyIds.flatMap((id) => {
      const kind = getElementDocumentStore()?.getElement(
        documentSceneId ?? selectedKeyType,
        id,
      )?.kind;
      return kind ? [{ type: kind, id }] : [];
    }),
  ];
  const stableBatchGeometryTargets: BatchGeometryTarget[] | null =
    batchGeometryTargets.every(
      (target) => target.id.length > 0 && isNativeElementId(target.id),
    )
      ? batchGeometryTargets
      : null;
  const stablePluginGeometryElements = (() => {
    const resolved: Array<{
      fullId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      // 크기를 정하는 플러그인 - 크기 일괄 대상 (나머지는 내용이 크기를 정한다)
      resizable: boolean;
    }> = [];
    for (const selected of selectedPluginElements) {
      const element = pluginElements.find(
        (candidate) => candidate.fullId === selected.id,
      );
      if (!element || !isPluginVisibleInMode(element, selectedKeyType)) {
        return null;
      }
      const size = resolveResizablePluginElementSize(element);
      resolved.push({
        fullId: element.fullId,
        x: element.position.x,
        y: element.position.y,
        width: size.width,
        height: size.height,
        resizable:
          pluginDefinitions.get(element.definitionId ?? '')?.resizable === true,
      });
    }
    return resolved;
  })();
  const stablePluginGeometryTargets =
    stablePluginGeometryElements?.map((element) => element.fullId) ?? null;

  const selectedPluginDefinition = selectedPluginElement?.definitionId
    ? pluginDefinitions.get(selectedPluginElement.definitionId) ?? null
    : null;
  const pluginSettingsUI = selectedPluginDefinition?.settingsUI ?? 'panel';
  const hasSinglePluginSelection =
    selectedPluginElements.length === 1 && !!selectedPluginElement;
  const showModalHint =
    hasSinglePluginSelection && pluginSettingsUI === 'modal';
  const showSettings = hasSinglePluginSelection && pluginSettingsUI !== 'modal';
  const isPluginResizable =
    hasSinglePluginSelection && !!selectedPluginDefinition?.resizable;
  const pluginDisplaySize = {
    width:
      selectedPluginElement?.measuredSize?.width ??
      selectedPluginElement?.estimatedSize?.width ??
      200,
    height:
      selectedPluginElement?.measuredSize?.height ??
      selectedPluginElement?.estimatedSize?.height ??
      150,
  };

  // 하나만 고른 그 종류 요소의 값 - 트리 값(트리로 보낸 편집의 낙관 반영 포함) + 편집 미리보기 (트리에 없으면 없음)
  const singleViewOf = <T>(
    elements: readonly { id: string }[],
    kind: string,
  ): T | null => {
    if (elements.length !== 1) return null;
    const { id } = elements[0];
    return elementOf(id)?.kind === kind
      ? (viewOf(id) as unknown as T | undefined) ?? null
      : null;
  };

  const singleKeyId =
    selectedKeyElements.length === 1 ? selectedKeyElements[0].id : null;
  // 키 사이 트리 순서 - 순서가 바뀌어도 선택 바뀜 effect가 돈다 (예전과 같다)
  const singleKeyIndex =
    singleKeyId && scene
      ? sceneElements(scene)
          .filter((element) => element.kind === 'key')
          .findIndex((element) => element.id === singleKeyId)
      : -1;
  const singleKeyPosition = singleViewOf<KeyPosition>(
    selectedKeyElements,
    'key',
  );
  // 키 슬롯은 트리 입력 (바꾸기가 트리 연산 - 낙관 적용), 슬롯이 없으면 빈 슬롯
  const singleKeyElement = singleKeyId ? elementOf(singleKeyId) : undefined;
  const singleKeySlot =
    singleKeyElement?.kind === 'key' ? keySlotOf(singleKeyElement) ?? '' : null;
  const singleKeyCode =
    singleKeySlot != null ? slotCanonical(singleKeySlot) : null;
  const singleKeyInfo =
    singleKeySlot != null && singleKeyCode
      ? typeof singleKeySlot === 'string'
        ? getKeyInfoByGlobalKey(singleKeySlot)
        : {
            browserKey: singleKeyCode,
            globalKey: singleKeyCode,
            displayName: slotDisplayName(singleKeySlot),
          }
      : null;

  const singleStatPosition = singleViewOf<StatItemPosition>(
    selectedStatElements,
    'stat',
  );
  const singleGraphPosition = singleViewOf<GraphItemPosition>(
    selectedGraphElements,
    'graph',
  );
  const singleKnobPosition = singleViewOf<KnobItemPosition>(
    selectedKnobElements,
    'knob',
  );
  const singleSpritePosition = singleViewOf<CanonicalReactiveSpritePosition>(
    selectedSpriteElements,
    'sprite',
  );

  // 고른 것이 그룹 하나 전체면 그 그룹 (트리 그룹 - 옛·트리 전용 구분 없음)
  const selectedGroupInfo = wholeGroupOf(
    scene,
    selectedElements.map(({ id }) => id),
  );

  return {
    selectedElements,
    // 실제 옛 선택 수 - 트리 선택을 옛 패널로 본 경우와 섞인 선택을 가린다
    legacySelectionCount: legacySelection.length,
    bridgedDocumentSelection,
    treeOnlyIds,
    batchGeometryTargets,
    selectedKeyType,
    elementOf,
    viewOf,
    pluginElements,
    pluginDefinitions,
    selectedKeyElements,
    selectedStatElements,
    selectedGraphElements,
    selectedKnobElements,
    selectedSpriteElements,
    selectedKeyLikeElements,
    selectedBatchStyleElements,
    selectedBatchGeometryElements,
    selectedPluginElements,
    selectedPluginElement,
    stableBatchGeometryTargets,
    stablePluginGeometryElements,
    stablePluginGeometryTargets,
    selectedPluginDefinition,
    hasSinglePluginSelection,
    showModalHint,
    showSettings,
    isPluginResizable,
    pluginDisplaySize,
    singleKeyIndex,
    singleKeyPosition,
    singleKeySlot,
    singleKeyCode,
    singleKeyInfo,
    singleStatPosition,
    singleGraphPosition,
    singleKnobPosition,
    singleSpritePosition,
    selectedGroupInfo,
  };
};
