'use no memo';
// 트리 스토어·프리뷰 오버레이(모듈 상태)를 렌더 중에 읽어서 컴파일러 메모 제외
import { useSyncExternalStore } from 'react';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { panelSelectionOf } from '../../document/treeEditedSelection';
import { wholeGroupOf } from '../../document/documentGroups';
import {
  getElementDocumentStore,
  useElementDocumentScene,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import { treeKeySlot } from '@src/renderer/editor/runtime/operations/keySlotOps';
import { treePanelRecords } from '@src/renderer/elementKinds/runtime/treePanelRecords';
import type { KeyMappings, KeyPosition } from '@src/types/key/keys';
import { legacyPositionOf } from '@src/renderer/elementKinds/runtime/legacyPosition';
import { treeElementPositionOf } from '@src/renderer/elementKinds/runtime/treeElementPosition';
import {
  selectPropertyPanelPluginElements,
  usePluginDisplayElementStore,
} from '@stores/plugin/usePluginDisplayElementStore';
import { isNativeElementId } from '@src/renderer/editor/model/elementId';
import {
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import type {
  CanonicalEditorDocumentV1,
  CanonicalReactiveSpritePosition,
  EditorElementTypeV1,
} from '@src/types/editor';
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
  // 트리 선택이 모두 트리로 옮긴 옛 종류면 옛 패널이 옛 선택과 함께 그 요소들을 고른 것처럼 본다
  // (위치·회전·숨김·이름·지우기 커밋은 공통 커밋 경로가 트리로 보낸다)
  const selectedElements = documentSceneId
    ? panelSelectionOf(legacySelection, documentSceneId, documentIds)
    : legacySelection;
  const bridgedDocumentSelection =
    selectedElements.length > legacySelection.length;
  useSyncExternalStore(
    subscribePreviewOverlay,
    getPreviewOverlayVersion,
    getPreviewOverlayVersion,
  );
  const records = treePanelRecords(scene, selectedKeyType);
  const positions = records.positions as unknown as Record<
    string,
    KeyPosition[]
  >;
  const canonicalPositions =
    records.canonicalPositions as unknown as CanonicalEditorDocumentV1['keyPositions'];
  const keyMappings = records.keyMappings as unknown as KeyMappings;
  const statItemPositions = records.statItemPositions as unknown as Record<
    string,
    StatItemPosition[]
  >;
  const graphItemPositions = records.graphItemPositions as unknown as Record<
    string,
    GraphItemPosition[]
  >;
  const knobItemPositions = records.knobItemPositions as unknown as Record<
    string,
    KnobItemPosition[]
  >;
  const spriteItemPositions = records.spriteItemPositions as unknown as Record<
    string,
    CanonicalReactiveSpritePosition[]
  >;
  const canonicalSpritePositions =
    records.canonicalSpritePositions as unknown as Record<
      string,
      CanonicalReactiveSpritePosition[]
    >;
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
  const stableBatchGeometryTargets: BatchGeometryTarget[] | null =
    selectedBatchGeometryElements.every(
      (element) => element.id.length > 0 && isNativeElementId(element.id),
    )
      ? selectedBatchGeometryElements.map((element) => ({
          type: element.type as EditorElementTypeV1,
          id: element.id,
        }))
      : null;
  const stablePluginGeometryElements = (() => {
    const resolved: Array<{
      fullId: string;
      x: number;
      y: number;
      width: number;
      height: number;
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

  // 트리 편집기가 맡는 요소의 단일 값 - 트리 값(트리로 보낸 편집의 낙관 반영 포함) + 편집 미리보기.
  // 옛 배열에는 순번(키 매핑 결합)만 남는다. 트리에 아직 없으면 옛 값
  const storedElement = (id: string) =>
    getElementDocumentStore()?.getElement(selectedKeyType, id);
  const treeView = <T>(id: string, fallback: T | null): T | null => {
    const element = storedElement(id);
    return element
      ? (treeElementPositionOf(element, selectedKeyType) as unknown as T)
      : fallback;
  };

  const singleKeyId =
    selectedKeyElements.length === 1 ? selectedKeyElements[0].id : null;
  const singleKeyIndex = singleKeyId
    ? (positions[selectedKeyType] ?? []).findIndex(
        (position) => position.id === singleKeyId,
      )
    : -1;
  const singleKeyPosition =
    singleKeyId && singleKeyIndex >= 0
      ? treeView(
          singleKeyId,
          positions[selectedKeyType]?.[singleKeyIndex] ?? null,
        )
      : null;
  // 미리보기 없는 값
  const singleKeyElement = singleKeyId ? storedElement(singleKeyId) : undefined;
  const singleCanonicalKeyPosition = singleKeyElement
    ? (legacyPositionOf(singleKeyElement) as unknown as NonNullable<
        typeof singleKeyPosition
      >)
    : singleKeyId
    ? (canonicalPositions[selectedKeyType] ?? []).find(
        (position) => position.id === singleKeyId,
      ) ?? null
    : null;
  // 키 슬롯은 트리 입력 (바꾸기가 트리 연산 - 낙관 적용), 트리에 없으면 옛 매핑
  const singleKeySlot =
    treeKeySlot(singleKeyElement) ??
    (singleKeyIndex >= 0
      ? keyMappings[selectedKeyType]?.[singleKeyIndex] ?? null
      : null);
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

  const singleStatId =
    selectedStatElements.length === 1 ? selectedStatElements[0].id : null;
  const singleStatIndex = singleStatId
    ? (statItemPositions[selectedKeyType] ?? []).findIndex(
        (position) => position.id === singleStatId,
      )
    : -1;
  const singleStatPosition: StatItemPosition | null =
    singleStatId && singleStatIndex >= 0
      ? treeView(
          singleStatId,
          statItemPositions[selectedKeyType]?.[singleStatIndex] ?? null,
        )
      : null;
  const singleGraphId =
    selectedGraphElements.length === 1 ? selectedGraphElements[0].id : null;
  const singleGraphIndex = singleGraphId
    ? (graphItemPositions[selectedKeyType] ?? []).findIndex(
        (position) => position.id === singleGraphId,
      )
    : -1;
  const singleGraphPosition: GraphItemPosition | null =
    singleGraphId && singleGraphIndex >= 0
      ? treeView(
          singleGraphId,
          graphItemPositions[selectedKeyType]?.[singleGraphIndex] ?? null,
        )
      : null;
  const singleKnobId =
    selectedKnobElements.length === 1 ? selectedKnobElements[0].id : null;
  const singleKnobIndex = singleKnobId
    ? (knobItemPositions[selectedKeyType] ?? []).findIndex(
        (position) => position.id === singleKnobId,
      )
    : -1;
  const singleKnobPosition: KnobItemPosition | null =
    singleKnobId && singleKnobIndex >= 0
      ? treeView(
          singleKnobId,
          knobItemPositions[selectedKeyType]?.[singleKnobIndex] ?? null,
        )
      : null;
  const singleSpriteId =
    selectedSpriteElements.length === 1 ? selectedSpriteElements[0].id : null;
  const legacySingleSpritePosition = singleSpriteId
    ? (spriteItemPositions[selectedKeyType] ?? []).find(
        (position) => position.id === singleSpriteId,
      ) ?? null
    : null;
  const singleSpritePosition: CanonicalReactiveSpritePosition | null =
    singleSpriteId && legacySingleSpritePosition
      ? treeView(singleSpriteId, legacySingleSpritePosition)
      : null;

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
    selectedKeyType,
    positions,
    canonicalPositions,
    keyMappings,
    statItemPositions,
    graphItemPositions,
    knobItemPositions,
    canonicalSpritePositions,
    spriteItemPositions,
    pluginElements,
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
    singleCanonicalKeyPosition,
    singleKeySlot,
    singleKeyCode,
    singleKeyInfo,
    singleStatIndex,
    singleStatPosition,
    singleGraphIndex,
    singleGraphPosition,
    singleKnobPosition,
    singleSpritePosition,
    selectedGroupInfo,
  };
};
