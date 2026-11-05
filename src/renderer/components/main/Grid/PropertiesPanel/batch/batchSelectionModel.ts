import type { GraphItemPosition } from '@src/types/key/graphItems';
import type { KeyPosition } from '@src/types/key/keys';
import type { KnobItemPosition } from '@src/types/key/knobs';
import type { StatItemPosition } from '@src/types/key/statItems';
import type { EditorElementTypeV1 } from '@src/types/editor';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import {
  panelFieldViewOf,
  type PanelFieldView,
} from '@src/renderer/elementKinds/runtime/fieldView';
import { keySlotOf } from '@src/renderer/elementKinds/definitions/key/keySlotInfo';
import { getKeyInfoByGlobalKey } from '@utils/input/KeyMaps';
import { aggregateMixedValue } from '@src/renderer/components/main/Grid/PropertiesPanel/batch/mixedValue';
import { slotCanonical, slotDisplayName } from '@utils/keySlot';
import { getStatTypeLabel } from '@utils/grid/statTypeLabel';
import type { SurfaceStyledElementType } from '@src/types/elementKinds';

interface BatchSelectedElement<Type extends string> {
  type: Type;
  id: string;
}

const indexSelectionDataById = <Data extends { position: { id?: string } }>(
  data: readonly Data[],
): Map<string, Data> => {
  const index = new Map<string, Data>();
  data.forEach((item) => {
    const id = item.position.id;
    if (!id || index.has(id)) return;
    index.set(id, item);
  });
  return index;
};

export interface BatchSelectionModelInput {
  // 지금 탭 트리 요소(id로) - 지금 칸(미리보기 없음)·키 슬롯
  elementOf: (id: string) => ElementNode | undefined;
  // 보이는 칸(id로) - 트리 칸 보기 + 편집 미리보기
  viewOf: (id: string) => PanelFieldView | undefined;
  selectedKeyElements: readonly BatchSelectedElement<'key'>[];
  selectedKeyLikeElements: readonly BatchSelectedElement<'key' | 'stat'>[];
  selectedGraphElements: readonly BatchSelectedElement<'graph'>[];
  selectedKnobElements: readonly BatchSelectedElement<'knob'>[];
  selectedBatchStyleElements: readonly BatchSelectedElement<SurfaceStyledElementType>[];
  // resize가 실제로 조절하는 집합 - 스타일 집합에 sprite가 더해진다
  selectedBatchGeometryElements: readonly BatchSelectedElement<EditorElementTypeV1>[];
}

export const createBatchSelectionModel = ({
  elementOf,
  viewOf,
  selectedKeyElements,
  selectedKeyLikeElements,
  selectedGraphElements,
  selectedKnobElements,
  selectedBatchStyleElements,
  selectedBatchGeometryElements,
}: BatchSelectionModelInput) => {
  // 그 종류 요소의 보이는 칸 - 트리에 없거나 종류가 다르면 없음
  const positionOf = <Position = KeyPosition>(
    element: BatchSelectedElement<string>,
  ) =>
    elementOf(element.id)?.kind === element.type
      ? (viewOf(element.id) as unknown as Position | undefined)
      : undefined;

  const selectedKeysData = selectedKeyLikeElements
    .map((element) => {
      if (element.type === 'key') {
        const position = positionOf(element);
        if (!position) return null;
        const slot = keySlotOf(elementOf(element.id)) ?? '';
        const keyCode = slotCanonical(slot);
        const keyInfo = keyCode
          ? typeof slot === 'string'
            ? getKeyInfoByGlobalKey(slot)
            : {
                browserKey: keyCode,
                globalKey: keyCode,
                displayName: slotDisplayName(slot),
              }
          : null;
        return { position, keyCode, keyInfo };
      }
      const position = positionOf<StatItemPosition>(element);
      if (!position) return null;
      const statLabel =
        (position.displayText || '').trim() ||
        getStatTypeLabel(position.statType ?? null);
      return {
        position,
        keyCode: null,
        keyInfo: { globalKey: statLabel, displayName: statLabel },
      };
    })
    .filter((data): data is NonNullable<typeof data> => data !== null);

  const selectedGraphsData = selectedGraphElements
    .map((element) => {
      const position = positionOf<GraphItemPosition>(element);
      if (!position) return null;
      const graphLabel = `${getStatTypeLabel(position.statType ?? null)} Graph`;
      return {
        position,
        keyCode: null,
        keyInfo: { globalKey: graphLabel, displayName: graphLabel },
      };
    })
    .filter((data): data is NonNullable<typeof data> => data !== null);

  const selectedKnobsData = selectedKnobElements
    .map((element) => {
      const position = positionOf<KnobItemPosition>(element);
      if (!position) return null;
      const knobLabel = (position.displayText || '').trim() || 'Knob';
      return {
        position,
        keyCode: null,
        keyInfo: { globalKey: knobLabel, displayName: knobLabel },
      };
    })
    .filter((data): data is NonNullable<typeof data> => data !== null);

  const keyLikeDataById = indexSelectionDataById(selectedKeysData);
  const graphDataById = indexSelectionDataById(selectedGraphsData);
  const knobDataById = indexSelectionDataById(selectedKnobsData);
  const styleDataIndexByType = {
    key: keyLikeDataById,
    stat: keyLikeDataById,
    graph: graphDataById,
    knob: knobDataById,
  };
  const selectedBatchStyleData = selectedBatchStyleElements
    .map((element) => styleDataIndexByType[element.type].get(element.id))
    .filter((data): data is NonNullable<typeof data> => data !== undefined);

  const selectedKeyOnlyPositions = selectedKeyElements.flatMap((element) => {
    const position = positionOf(element);
    return position ? [{ position }] : [];
  });

  // 크기 표시·Mixed 판정 전용. resize가 실제로 조절하는 집합에서 그대로 파생시켜
  // 두 집합이 갈릴 수 없게 한다 - 스타일 집합에는 스프라이트가 없어서 그걸 쓰면
  // 키 60·스프라이트 200이 Mixed 없이 60으로 보이고, 그 값을 확정하면
  // 스프라이트의 모든 자세 오프셋까지 배율이 먹는다
  const selectedGeometryPositions = selectedBatchGeometryElements.flatMap(
    (element) => {
      const position = positionOf(element);
      return position ? [position] : [];
    },
  );

  const selectedActiveCapablePositions: KeyPosition[] = [
    ...selectedKeyOnlyPositions.map(({ position }) => position),
    ...selectedKnobElements.flatMap((element) => {
      const position = positionOf(element);
      return position ? [position] : [];
    }),
  ];
  // 지금 칸(미리보기 없음)
  const selectedCanonicalKeyPositions = selectedKeyLikeElements.flatMap(
    (element) => {
      const node = element.type === 'key' ? elementOf(element.id) : undefined;
      return node?.kind === 'key'
        ? [panelFieldViewOf(node) as unknown as KeyPosition]
        : [];
    },
  );

  const getSelectedKeysData = () => selectedKeysData;
  const getSelectedBatchStyleData = () => selectedBatchStyleData;
  const getSelectedKeyOnlyPositions = () => selectedKeyOnlyPositions;

  return {
    getSelectedKeysData,
    getSelectedBatchStyleData,
    getSelectedKeyOnlyPositions,
    getMixedValue: <Value>(
      getter: (position: KeyPosition) => Value | undefined,
      defaultValue: Value,
    ) =>
      aggregateMixedValue(
        getSelectedKeysData().map((data) => data.position),
        getter,
        defaultValue,
      ),
    getMixedValueCanonical: <Value>(
      getter: (position: KeyPosition) => Value | undefined,
      defaultValue: Value,
    ) => {
      return aggregateMixedValue(
        selectedCanonicalKeyPositions,
        getter,
        defaultValue,
      );
    },
    getMixedValueBatch: <Value>(
      getter: (position: KeyPosition) => Value | undefined,
      defaultValue: Value,
    ) =>
      aggregateMixedValue(
        getSelectedBatchStyleData().map((data) => data.position as KeyPosition),
        getter,
        defaultValue,
      ),
    getMixedValueGeometry: <Value>(
      getter: (position: KeyPosition) => Value | undefined,
      defaultValue: Value,
    ) => aggregateMixedValue(selectedGeometryPositions, getter, defaultValue),
    getMixedValueActiveCapable: <Value>(
      getter: (position: KeyPosition) => Value | undefined,
      defaultValue: Value,
    ) =>
      aggregateMixedValue(selectedActiveCapablePositions, getter, defaultValue),
    getMixedValueKeysOnly: <Value>(
      getter: (position: KeyPosition) => Value | undefined,
      defaultValue: Value,
    ) =>
      aggregateMixedValue(
        getSelectedKeyOnlyPositions().map(({ position }) => position),
        getter,
        defaultValue,
      ),
  };
};
