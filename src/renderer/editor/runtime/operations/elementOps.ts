import { useKeyStore } from '@stores/data/useKeyStore';
import { useLayerGroupStore } from '@stores/data/useLayerGroupStore';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import {
  resolveElementById,
  type NativeElementType,
} from '../../model/elementIdMap';
import {
  captureElementCollections,
  getItemStoreState,
  readAuthorityPositions,
  writeElementCollections,
} from '../../model/elementStores';
import { isNativeElementId } from '../../model/elementId';
import { currentPluginGroupMembers } from '../intent/pluginGroupMembers';
import {
  cloneKeyPositionForDuplicate,
  createDefaultKeyPosition,
} from '../../model/keys';
import { newElementId } from '../../model/elementId';
import { cloneSlot } from '@utils/keySlot';
import { reissueSpritePoseIds } from '@utils/sprite/poseIdentity';
import { toSpriteWireShape } from '@utils/sprite/spriteWireShape';
import { stableStringify } from '@utils/core/stableStringify';
import { normalizeLayerGroupsForMode } from '@utils/layerGroupUtils';
import type { ElementIntentReceipt } from '../intent/elementIntent';
import { commitSemanticOps } from './editorSemanticOps';
import {
  captureEditorDocument,
  editorCoordinator,
} from '../coordinator/editorStateCoordinator';
import { EDITOR_ELEMENT_POSITION_FIELDS } from '@src/types/editor';
import type {
  CanonicalEditorDocumentV1,
  CanonicalPositionOf,
  EditorFrozenElementV1,
  ItemElementType,
} from '@src/types/editor';
import type { KeyPosition, KeySlot } from '@src/types/key/keys';
import type { StatItemPosition } from '@src/types/key/statItems';
import type { GraphItemPosition } from '@src/types/key/graphItems';
import type { KnobItemPosition } from '@src/types/key/knobs';
import type { ReactiveSpritePosition } from '@src/types/key/sprites';
import {
  findInRecord,
  removeAt,
  type LooseRecord,
} from '../intent/elementDocumentModel';

// 메뉴·확인 모달처럼 대상 확정과 실행 사이가 긴 파괴적 액션의 semantic op.
// 대상은 {type, id}로 받고, eager 반영과 wire 생성 각각이 실행 시점의
// 문서에서 id를 다시 찾아 적용한다. 못 찾으면(삭제·모드 소실) 조용히
// 중단한다 - index를 들고 있다가 다른 요소를 지우는 창을 없애는 것이 목적

export const deleteElementById = (
  type: NativeElementType,
  id: string,
): Promise<boolean> => {
  if (!isNativeElementId(id)) return Promise.resolve(false);

  const applyEager = (): ElementIntentReceipt | null => {
    const locator = resolveElementById(type, id);
    if (!locator) return null;
    const layerGroupsBefore = useLayerGroupStore.getState().layerGroups;
    let removedGroups: Array<{ id: string; name: string; index: number }> = [];

    let removedSlot: unknown;
    let removedPosition: Record<string, unknown> | undefined;
    if (type === 'key') {
      const state = useKeyStore.getState();
      removedSlot = state.keyMappings[locator.mode]?.[locator.index];
      removedPosition = (state.canonicalPositions as unknown as LooseRecord)[
        locator.mode
      ]?.[locator.index];
      const nextMappings = {
        ...state.keyMappings,
        [locator.mode]: (state.keyMappings[locator.mode] ?? []).filter(
          (_, i) => i !== locator.index,
        ),
      };
      const nextPositions = removeAt(
        state.canonicalPositions as unknown as LooseRecord,
        locator.mode,
        locator.index,
      );
      state.setKeyMappingsAndPositions(nextMappings, nextPositions as never);
    } else {
      const state = getItemStoreState(type);
      removedPosition = (state.positions as unknown as LooseRecord)[
        locator.mode
      ]?.[locator.index];
      state.setPositions(
        removeAt(
          state.positions as unknown as LooseRecord,
          locator.mode,
          locator.index,
        ) as never,
      );
    }
    // 선택 보정은 현재 모드 배열 기준 - 다른 모드로 이동한 대상의 index로
    // 현재 모드의 무관한 선택을 지우면 안 된다
    if (locator.mode === useKeyStore.getState().selectedKeyType) {
      useGridSelectionStore.getState().deselectElement(id);
    }

    const normalized = normalizeLayerGroupsForMode({
      mode: locator.mode,
      ...captureElementCollections(),
      layerGroups: useLayerGroupStore.getState().layerGroups,
      pluginElements: currentPluginGroupMembers(),
    });
    if (normalized.positionsChanged) {
      writeElementCollections(normalized);
    }
    if (normalized.groupsChanged) {
      const remaining = new Set(
        (normalized.layerGroups[locator.mode] ?? []).map((group) => group.id),
      );
      removedGroups = (layerGroupsBefore[locator.mode] ?? [])
        .map((group, index) => ({ ...group, index }))
        .filter((group) => !remaining.has(group.id));
      useLayerGroupStore.getState().setLayerGroups(normalized.layerGroups);
    }

    return {
      rollback: () => {
        const canonical = editorCoordinator.getState().lastAck;
        const canonicalRecord = canonical?.[
          EDITOR_ELEMENT_POSITION_FIELDS[type]
        ] as LooseRecord | undefined;
        if (canonicalRecord && !findInRecord(canonicalRecord, id)) return;
        const currentRecord = readAuthorityPositions(
          type,
        ) as unknown as LooseRecord;
        // 다른 경로가 같은 ID를 이미 복원·갱신했으면 그룹까지 그 경로 소유
        if (findInRecord(currentRecord, id)) return;
        if (removedGroups.length > 0) {
          const layerGroupState = useLayerGroupStore.getState();
          const currentMode = [
            ...(layerGroupState.layerGroups[locator.mode] ?? []),
          ];
          let restored = false;
          for (const group of removedGroups) {
            if (currentMode.some((candidate) => candidate.id === group.id))
              continue;
            currentMode.splice(Math.min(group.index, currentMode.length), 0, {
              id: group.id,
              name: group.name,
            });
            restored = true;
          }
          if (restored) {
            layerGroupState.setLayerGroups({
              ...layerGroupState.layerGroups,
              [locator.mode]: currentMode,
            });
          }
        }
        if (!removedPosition) return;
        // membership CAS: id가 이미 돌아와 있으면(다른 경로 복원) 중복 금지
        if (type === 'key') {
          const state = useKeyStore.getState();
          const record = state.canonicalPositions as unknown as LooseRecord;
          if (findInRecord(record, id)) return;
          const list = record[locator.mode] ?? [];
          const at = Math.min(locator.index, list.length);
          const mappings = state.keyMappings[locator.mode] ?? [];
          state.setKeyMappingsAndPositions(
            {
              ...state.keyMappings,
              [locator.mode]: [
                ...mappings.slice(0, at),
                removedSlot as never,
                ...mappings.slice(at),
              ],
            },
            {
              ...record,
              [locator.mode]: [
                ...list.slice(0, at),
                removedPosition,
                ...list.slice(at),
              ],
            } as never,
          );
          return;
        }
        const state = getItemStoreState(type);
        const record = state.positions as unknown as LooseRecord;
        if (findInRecord(record, id)) return;
        const list = record[locator.mode] ?? [];
        const at = Math.min(locator.index, list.length);
        state.setPositions({
          ...record,
          [locator.mode]: [
            ...list.slice(0, at),
            removedPosition,
            ...list.slice(at),
          ],
        } as never);
      },
    };
  };

  const receipt = applyEager();
  let enrolled = false;
  return commitSemanticOps([{ kind: 'deleteElement', elementType: type, id }], {
    onEnrolled: () => {
      enrolled = true;
    },
  })
    .then(() => true)
    .catch((error) => {
      if (!enrolled) receipt?.rollback();
      throw error;
    });
};

// 복제 배치: 시작 시점에 동결한 payload(slot + position)를 현재 모드에 새
// 요소로 추가한다. sourceIndex 재조회 금지 - 고스트를 따라다니는 동안의
// 재정렬이 다른 키를 복제하게 만든다
export interface FrozenKeyDuplicate {
  slot: unknown;
  position: KeyPosition;
}

const documentHasElementId = (
  document: CanonicalEditorDocumentV1,
  id: string,
) =>
  [
    document.keyPositions,
    document.statPositions,
    document.graphPositions,
    document.knobPositions,
    document.spritePositions,
  ].some((record) => findInRecord(record as unknown as LooseRecord, id));

const documentHasExactFrozenElement = (
  document: CanonicalEditorDocumentV1,
  mode: string,
  element: EditorFrozenElementV1,
) => {
  const field = EDITOR_ELEMENT_POSITION_FIELDS[element.elementType];
  const index = document[field][mode]?.findIndex(
    (position) => position.id === element.position.id,
  );
  if (index == null || index < 0) return false;
  if (
    stableStringify(document[field][mode][index]) !==
    stableStringify(element.position)
  ) {
    return false;
  }
  return (
    element.elementType !== 'key' ||
    stableStringify(document.keys[mode]?.[index]) ===
      stableStringify(element.slot)
  );
};

const insertFrozenElement = (
  mode: string,
  source: EditorFrozenElementV1,
): Promise<boolean> => {
  const element = structuredClone(source);
  const id = element.position.id;
  if (!mode || typeof id !== 'string' || !id || !isNativeElementId(id)) {
    return Promise.resolve(false);
  }
  if (documentHasElementId(captureEditorDocument(), id)) {
    return Promise.resolve(false);
  }

  const applyEager = (): ElementIntentReceipt => {
    if (element.elementType === 'key') {
      const state = useKeyStore.getState();
      state.setKeyMappingsAndPositions(
        {
          ...state.keyMappings,
          [mode]: [...(state.keyMappings[mode] ?? []), cloneSlot(element.slot)],
        },
        {
          ...state.canonicalPositions,
          [mode]: [
            ...(state.canonicalPositions[mode] ?? []),
            structuredClone(element.position),
          ],
        },
      );
    } else {
      const state = getItemStoreState(element.elementType);
      const positions = state.positions as unknown as LooseRecord;
      state.setPositions({
        ...positions,
        [mode]: [...(positions[mode] ?? []), structuredClone(element.position)],
      } as never);
    }

    return {
      rollback: () => {
        const canonical = editorCoordinator.getState().lastAck;
        if (canonical && documentHasElementId(canonical, id)) {
          return;
        }
        if (
          !documentHasExactFrozenElement(captureEditorDocument(), mode, element)
        ) {
          return;
        }
        if (element.elementType === 'key') {
          const state = useKeyStore.getState();
          const positions = state.canonicalPositions as unknown as LooseRecord;
          const located = findInRecord(positions, id);
          if (!located) return;
          state.setKeyMappingsAndPositions(
            {
              ...state.keyMappings,
              [located.mode]: (state.keyMappings[located.mode] ?? []).filter(
                (_, index) => index !== located.index,
              ),
            },
            removeAt(positions, located.mode, located.index) as never,
          );
          return;
        }
        const state = getItemStoreState(element.elementType);
        const positions = state.positions as unknown as LooseRecord;
        const located = findInRecord(positions, id);
        if (!located) return;
        state.setPositions(
          removeAt(positions, located.mode, located.index) as never,
        );
      },
    };
  };

  const receipt = applyEager();
  let enrolled = false;
  return commitSemanticOps(
    [
      {
        kind: 'insertFrozenElements',
        mode,
        elements: [element],
        groups: [],
        zUpdates: [],
      },
    ],
    {
      onEnrolled: () => {
        enrolled = true;
      },
    },
  )
    .then(() => true)
    .catch((error) => {
      if (!enrolled) receipt.rollback();
      throw error;
    });
};

export const addKeyAt = (mode: string, dx: number, dy: number) =>
  insertFrozenElement(mode, {
    elementType: 'key',
    slot: '',
    position: createDefaultKeyPosition(dx, dy),
  });

// 키 외 요소 추가 - 키는 keys 슬롯과 함께 넣는 addKeyAt
export const addItemAt = <K extends ItemElementType>(
  mode: string,
  type: K,
  position: CanonicalPositionOf<K>,
) =>
  insertFrozenElement(mode, {
    elementType: type,
    position,
  } as EditorFrozenElementV1);

export const addStatAt = (
  mode: string,
  position: StatItemPosition & { id: string },
) => addItemAt(mode, 'stat', position);

export const addGraphAt = (
  mode: string,
  position: GraphItemPosition & { id: string },
) => addItemAt(mode, 'graph', position);

export const addKnobAt = (
  mode: string,
  position: KnobItemPosition & { id: string },
) => addItemAt(mode, 'knob', position);

export const addSpriteAt = (
  mode: string,
  position: ReactiveSpritePosition & { id: string },
) => addItemAt(mode, 'sprite', position);

const groupForMode = (mode: string, groupId: string | undefined) =>
  groupId &&
  (useLayerGroupStore.getState().layerGroups[mode] ?? []).some(
    (group) => group.id === groupId,
  )
    ? groupId
    : undefined;

export const placeDuplicatedKey = (
  frozen: FrozenKeyDuplicate,
  mode: string,
  dx: number,
  dy: number,
): Promise<boolean> => {
  // 구 duplicateKey와 같은 정규화: 새 신원, 좌표 반올림, 참조 분리, 기본값 백필
  const newPosition = cloneKeyPositionForDuplicate(frozen.position, dx, dy);
  newPosition.groupId = groupForMode(mode, newPosition.groupId);
  const frozenSlot = cloneSlot(frozen.slot as never);
  return insertFrozenElement(mode, {
    elementType: 'key',
    slot: frozenSlot,
    position: newPosition,
  });
};

// 키 외 요소 복제 배치 - 새 신원, 현재 모드에 없는 그룹 해제, 지정 zIndex
export const placeDuplicatedItem = (
  mode: string,
  type: ItemElementType,
  source: { groupId?: string | null },
  dx: number,
  dy: number,
  zIndex: number,
) => {
  if (type === 'sprite') {
    const cloned = structuredClone(source as ReactiveSpritePosition);
    return insertFrozenElement(mode, {
      elementType: 'sprite',
      // wire 정규화: 원본의 명시 null layerName·groupId도 키 부재로 맞춘다
      position: toSpriteWireShape({
        ...cloned,
        id: newElementId(),
        // 사본 poseId 재발급 - 원본과 공유하면 백엔드가 중복으로 거부
        poses: reissueSpritePoseIds(cloned.poses),
        groupId: groupForMode(mode, source.groupId ?? undefined),
        dx,
        dy,
        zIndex,
      }),
    });
  }
  return insertFrozenElement(mode, {
    elementType: type,
    position: {
      ...structuredClone(source),
      id: newElementId(),
      groupId: groupForMode(mode, source.groupId ?? undefined),
      dx,
      dy,
      zIndex,
    },
  } as EditorFrozenElementV1);
};

export const placeDuplicatedStat = (
  mode: string,
  source: StatItemPosition,
  dx: number,
  dy: number,
  zIndex: number,
) => placeDuplicatedItem(mode, 'stat', source, dx, dy, zIndex);

export const placeDuplicatedGraph = (
  mode: string,
  source: GraphItemPosition,
  dx: number,
  dy: number,
  zIndex: number,
) => placeDuplicatedItem(mode, 'graph', source, dx, dy, zIndex);

export const placeDuplicatedKnob = (
  mode: string,
  source: KnobItemPosition,
  dx: number,
  dy: number,
  zIndex: number,
) => placeDuplicatedItem(mode, 'knob', source, dx, dy, zIndex);

export const placeDuplicatedSprite = (
  mode: string,
  source: ReactiveSpritePosition,
  dx: number,
  dy: number,
  zIndex: number,
) => placeDuplicatedItem(mode, 'sprite', source, dx, dy, zIndex);

// 키 슬롯 재바인딩: keys만 바꾸되 대상은 paired 위치의 안정 id로 재결합한다.
// index 기반 keys 단독 커밋은 same-shape 재정렬과 겹치면 다른 위치 id와
// 잘못 결합된다
export const rebindKeySlotById = (
  positionId: string,
  newSlot: KeySlot,
): Promise<boolean> => {
  if (!isNativeElementId(positionId)) return Promise.resolve(false);

  const applyEager = (): ElementIntentReceipt | null => {
    const locator = resolveElementById('key', positionId);
    if (!locator) return null;
    const state = useKeyStore.getState();
    const beforeSlot = state.keyMappings[locator.mode]?.[locator.index];
    state.setKeyMappings({
      ...state.keyMappings,
      [locator.mode]: (state.keyMappings[locator.mode] ?? []).map((slot, i) =>
        i === locator.index ? newSlot : slot,
      ),
    } as never);
    return {
      rollback: () => {
        // paired CAS: 위치 id의 현재 자리 슬롯이 우리가 쓴 값일 때만 복원
        const current = useKeyStore.getState();
        const located = findInRecord(
          current.canonicalPositions as unknown as LooseRecord,
          positionId,
        );
        if (!located) return;
        if (current.keyMappings[located.mode]?.[located.index] !== newSlot) {
          return;
        }
        current.setKeyMappings({
          ...current.keyMappings,
          [located.mode]: (current.keyMappings[located.mode] ?? []).map(
            (slot, i) => (i === located.index ? beforeSlot : slot),
          ),
        } as never);
      },
    };
  };

  const receipt = applyEager();
  let enrolled = false;
  return commitSemanticOps(
    [{ kind: 'setKeySlot', id: positionId, slot: newSlot }],
    {
      onEnrolled: () => {
        enrolled = true;
      },
    },
  )
    .then((outcome) => outcome.opResults[0]?.status !== 'targetMissing')
    .catch((error) => {
      if (!enrolled) receipt?.rollback();
      throw error;
    });
};

export {
  patchElementHiddenById,
  patchElementPropertyById,
} from './elementPropertyCore';
export * from './elementGroupOps';
export * from './elementStyleOps';
export * from './elementGeometryOps';
