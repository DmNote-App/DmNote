import { useSyncExternalStore } from 'react';
import { useGraphItemStore } from '@stores/data/useGraphItemStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useKnobItemStore } from '@stores/data/useKnobItemStore';
import { useLayerGroupStore } from '@stores/data/useLayerGroupStore';
import { useSpriteStore } from '@stores/data/useSpriteStore';
import { useStatItemStore } from '@stores/data/useStatItemStore';
import {
  useGridSelectionStore,
  type SelectedElement,
} from '@stores/grid/useGridSelectionStore';
import { useDocumentSelectionStore } from '../../document/useDocumentSelectionStore';
import { useElementDocumentScene } from '@src/renderer/editor/document/elementDocumentRuntime';
import { sceneElements } from '@src/renderer/editor/document/documentPatch';
import { readAuthorityPositions } from '@src/renderer/editor/model/elementStores';
import { isEditorElementType } from '@src/types/editor';
import { TREE_EDITED_KINDS } from '@src/types/elementKinds';
import {
  selectPropertyPanelPluginElements,
  usePluginDisplayElementStore,
} from '@stores/plugin/usePluginDisplayElementStore';
import { isNativeElementId } from '@src/renderer/editor/model/elementId';
import {
  composePreviewPositions,
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import type {
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
  const legacySelection = useGridSelectionStore(
    (state) => state.selectedElements,
  );
  const documentSceneId = useDocumentSelectionStore((state) => state.sceneId);
  const documentIds = useDocumentSelectionStore((state) => state.selectedIds);
  const documentScene = useElementDocumentScene(documentSceneId ?? '');
  // 트리 선택이 모두 트리로 옮긴 옛 종류면 옛 패널이 옛 선택과 함께 그 요소들을 고른 것처럼 본다
  // (위치·회전·숨김·이름·지우기 커밋은 공통 커밋 경로가 트리로 보낸다)
  const bridgedElements =
    documentSceneId && documentScene
      ? documentIds.flatMap((id) => {
          const element = sceneElements(documentScene).find(
            (node) => node.id === id,
          );
          if (
            !element ||
            !isEditorElementType(element.kind) ||
            !TREE_EDITED_KINDS.has(element.kind)
          ) {
            return [];
          }
          const index = (
            (readAuthorityPositions(element.kind)[documentSceneId] ??
              []) as Array<{ id: string }>
          ).findIndex((position) => position.id === id);
          return index >= 0
            ? [{ type: element.kind, id, index } as SelectedElement]
            : [];
        })
      : [];
  // 플러그인이 섞이면 잇지 않는다 - 플러그인 섞인 일괄 커밋은 트리로 보내지 못한다
  const bridgedDocumentSelection =
    bridgedElements.length > 0 &&
    bridgedElements.length === documentIds.length &&
    legacySelection.every((element) => element.type !== 'plugin');
  const selectedElements = bridgedDocumentSelection
    ? [...legacySelection, ...bridgedElements]
    : legacySelection;
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  const positions = useKeyStore((state) => state.positions);
  const canonicalPositions = useKeyStore((state) => state.canonicalPositions);
  const keyMappings = useKeyStore((state) => state.keyMappings);
  const canonicalStatItemPositions = useStatItemStore(
    (state) => state.positions,
  );
  const canonicalGraphItemPositions = useGraphItemStore(
    (state) => state.positions,
  );
  const canonicalKnobItemPositions = useKnobItemStore(
    (state) => state.positions,
  );
  const canonicalSpritePositions = useSpriteStore((state) => state.positions);
  useSyncExternalStore(
    subscribePreviewOverlay,
    getPreviewOverlayVersion,
    getPreviewOverlayVersion,
  );

  const statItemPositions = composePreviewPositions(
    'statPosition',
    canonicalStatItemPositions,
  );
  const graphItemPositions = composePreviewPositions(
    'graphPosition',
    canonicalGraphItemPositions,
  );
  const knobItemPositions = composePreviewPositions(
    'knobPosition',
    canonicalKnobItemPositions,
  );
  const spriteItemPositions = composePreviewPositions(
    'spritePosition',
    canonicalSpritePositions,
  );
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

  const singleKeyId =
    selectedKeyElements.length === 1 ? selectedKeyElements[0].id : null;
  const singleKeyIndex = singleKeyId
    ? (positions[selectedKeyType] ?? []).findIndex(
        (position) => position.id === singleKeyId,
      )
    : -1;
  const singleKeyPosition =
    singleKeyIndex >= 0 ? positions[selectedKeyType]?.[singleKeyIndex] : null;
  const singleCanonicalKeyPosition = singleKeyId
    ? (canonicalPositions[selectedKeyType] ?? []).find(
        (position) => position.id === singleKeyId,
      ) ?? null
    : null;
  const singleKeySlot =
    singleKeyIndex >= 0
      ? keyMappings[selectedKeyType]?.[singleKeyIndex] ?? null
      : null;
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
    singleStatIndex >= 0
      ? statItemPositions[selectedKeyType]?.[singleStatIndex] ?? null
      : null;
  const singleGraphId =
    selectedGraphElements.length === 1 ? selectedGraphElements[0].id : null;
  const singleGraphIndex = singleGraphId
    ? (graphItemPositions[selectedKeyType] ?? []).findIndex(
        (position) => position.id === singleGraphId,
      )
    : -1;
  const singleGraphPosition: GraphItemPosition | null =
    singleGraphIndex >= 0
      ? graphItemPositions[selectedKeyType]?.[singleGraphIndex] ?? null
      : null;
  const singleKnobId =
    selectedKnobElements.length === 1 ? selectedKnobElements[0].id : null;
  const singleKnobIndex = singleKnobId
    ? (knobItemPositions[selectedKeyType] ?? []).findIndex(
        (position) => position.id === singleKnobId,
      )
    : -1;
  const singleKnobPosition: KnobItemPosition | null =
    singleKnobIndex >= 0
      ? knobItemPositions[selectedKeyType]?.[singleKnobIndex] ?? null
      : null;
  const singleSpriteId =
    selectedSpriteElements.length === 1 ? selectedSpriteElements[0].id : null;
  const singleSpritePosition: CanonicalReactiveSpritePosition | null =
    singleSpriteId
      ? (spriteItemPositions[selectedKeyType] ?? []).find(
          (position) => position.id === singleSpriteId,
        ) ?? null
      : null;

  const allLayerGroups = useLayerGroupStore((state) => state.layerGroups);
  const layerGroupsForMode = allLayerGroups[selectedKeyType] || [];
  const selectedGroupInfo = (() => {
    if (selectedElements.length < 2) return null;

    const keyModePositions = positions[selectedKeyType] || [];
    const statModePositions = statItemPositions[selectedKeyType] || [];
    const graphModePositions = graphItemPositions[selectedKeyType] || [];
    const knobModePositions = knobItemPositions[selectedKeyType] || [];
    const spriteModePositions = spriteItemPositions[selectedKeyType] || [];
    const modeGroupIds = new Set(layerGroupsForMode.map((group) => group.id));
    let groupId: string | undefined;

    for (const element of selectedElements) {
      let currentGroupId: string | undefined;
      if (element.type === 'key') {
        currentGroupId = keyModePositions.find(
          (position) => position.id === element.id,
        )?.groupId;
      } else if (element.type === 'stat') {
        currentGroupId = statModePositions.find(
          (position) => position.id === element.id,
        )?.groupId;
      } else if (element.type === 'graph') {
        currentGroupId = graphModePositions.find(
          (position) => position.id === element.id,
        )?.groupId;
      } else if (element.type === 'knob') {
        currentGroupId = knobModePositions.find(
          (position) => position.id === element.id,
        )?.groupId;
      } else if (element.type === 'sprite') {
        currentGroupId =
          spriteModePositions.find((position) => position.id === element.id)
            ?.groupId ?? undefined;
      } else if (element.type === 'plugin') {
        const pluginGroupId = pluginElements.find(
          (candidate) => candidate.fullId === element.id,
        )?.groupId;
        currentGroupId =
          pluginGroupId && modeGroupIds.has(pluginGroupId)
            ? pluginGroupId
            : undefined;
      } else {
        return null;
      }

      if (!currentGroupId) return null;
      if (!groupId) groupId = currentGroupId;
      else if (groupId !== currentGroupId) return null;
    }
    if (!groupId) return null;

    const totalMembers =
      keyModePositions.filter((position) => position?.groupId === groupId)
        .length +
      statModePositions.filter((position) => position?.groupId === groupId)
        .length +
      graphModePositions.filter((position) => position?.groupId === groupId)
        .length +
      knobModePositions.filter((position) => position?.groupId === groupId)
        .length +
      spriteModePositions.filter((position) => position?.groupId === groupId)
        .length +
      pluginElements.filter(
        (element) =>
          isPluginVisibleInMode(element, selectedKeyType) &&
          element.groupId === groupId,
      ).length;
    if (totalMembers < 2 || totalMembers !== selectedElements.length) {
      return null;
    }

    const groupDefinition = layerGroupsForMode.find(
      (group) => group.id === groupId,
    );
    if (!groupDefinition) return null;
    return {
      id: groupDefinition.id,
      name: groupDefinition.name,
      memberCount: totalMembers,
    };
  })();

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
