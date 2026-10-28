/**
 * 캔버스 요소 추가·복제 및 z-order 액션 훅
 * 키 외 종류별 생성·복제 규칙은 itemCanvasRules
 */

import {
  addKeyAt,
  placeDuplicatedKey,
} from '@src/renderer/editor/runtime/operations/elementOps';
import type { FrozenKeyDuplicate } from '@src/renderer/editor/runtime/operations/elementOps';
import { reportElementOpError } from '@src/renderer/editor/runtime/intent/elementIntent';
import {
  getItemStoreState,
  readAuthorityPositions,
} from '@src/renderer/editor/model/elementStores';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import {
  EDITOR_ELEMENT_TYPES,
  type CanonicalPositionOf,
  type EditorElementTypeV1,
  type ItemElementType,
} from '@src/types/editor';
import type { KeySlot, KeyPosition } from '@src/types/key/keys';
import { ITEM_CANVAS_RULES } from './itemCanvasRules';

// 공통: 최대 zIndex - 결과가 persist되는 z 계산에 쓰이므로 canonical 기준
function getMaxZIndex(mode: string): number {
  const nativeZIndexes = EDITOR_ELEMENT_TYPES.flatMap((type) =>
    (
      (readAuthorityPositions(type)[mode] || []) as Array<{
        zIndex?: number | null;
      }>
    ).map((p, i) => p.zIndex ?? i),
  );

  const pluginZIndexes = usePluginDisplayElementStore
    .getState()
    .elements.filter((el) => !el.tabId || el.tabId === mode)
    .map((el) => el.zIndex ?? 0);

  return Math.max(0, ...nativeZIndexes, ...pluginZIndexes);
}

// 규칙 표를 종류 무관하게 호출하기 위한 느슨한 뷰
type ItemCanvasRulesOf = {
  create: (dx: number, dy: number) => never;
  add: (mode: string, position: never) => Promise<unknown>;
  duplicateSource: (position: never) => { keyName: string; position: unknown };
  placeDuplicated: (
    mode: string,
    source: never,
    dx: number,
    dy: number,
    zIndex: number,
  ) => Promise<unknown>;
};

export interface CanvasActions {
  addKeyAtPosition: (dx: number, dy: number) => void;
  placeDuplicateKey: (
    frozen: FrozenKeyDuplicate,
    dx: number,
    dy: number,
  ) => void;
  // 키 외 종류 액션 - 종류별 생성·복제 규칙은 ITEM_CANVAS_RULES
  addItemAtPosition: (type: ItemElementType, dx: number, dy: number) => void;
  beginDuplicateItem: (
    type: ItemElementType,
    sourceIndex: number,
  ) => DuplicateState | null;
  placeDuplicateItem: (
    type: ItemElementType,
    templatePosition: DuplicateState['position'],
    dx: number,
    dy: number,
  ) => void;
}

export interface DuplicateState {
  elementType: EditorElementTypeV1;
  sourceIndex: number;
  // 키 복제의 시작 시점 동결 슬롯 - 배치 시 sourceIndex 재조회 금지
  slot?: KeySlot;
  keyName: string;
  position: KeyPosition | CanonicalPositionOf<ItemElementType>;
}

export type NativeCanvasElementType = EditorElementTypeV1;

export const addCanvasElementAt = (
  actions: Pick<CanvasActions, 'addKeyAtPosition' | 'addItemAtPosition'>,
  type: NativeCanvasElementType,
  dx: number,
  dy: number,
) => {
  if (type === 'key') {
    actions.addKeyAtPosition(dx, dy);
  } else {
    actions.addItemAtPosition(type, dx, dy);
  }
};

export const placeFrozenDuplicateAt = (
  actions: Pick<CanvasActions, 'placeDuplicateKey' | 'placeDuplicateItem'>,
  duplicate: DuplicateState,
  dx: number,
  dy: number,
) => {
  if (duplicate.elementType === 'key') {
    if (typeof duplicate.slot === 'undefined') return false;
    actions.placeDuplicateKey(
      { slot: duplicate.slot, position: duplicate.position as KeyPosition },
      dx,
      dy,
    );
    return true;
  }
  actions.placeDuplicateItem(duplicate.elementType, duplicate.position, dx, dy);
  return true;
};

export function useGridCanvasActions(selectedKeyType: string): CanvasActions {
  const addKeyAtPosition = (dx: number, dy: number) => {
    void addKeyAt(selectedKeyType, dx, dy).catch(reportElementOpError);
  };

  const placeDuplicateKey = (
    frozen: FrozenKeyDuplicate,
    dx: number,
    dy: number,
  ) => {
    void placeDuplicatedKey(frozen, selectedKeyType, dx, dy).catch(
      reportElementOpError,
    );
  };
  const addItemAtPosition = (type: ItemElementType, dx: number, dy: number) => {
    const rules = ITEM_CANVAS_RULES[type] as ItemCanvasRulesOf;
    void rules
      .add(selectedKeyType, rules.create(dx, dy))
      .catch(reportElementOpError);
  };

  const beginDuplicateItem = (
    type: ItemElementType,
    sourceIndex: number,
  ): DuplicateState | null => {
    const current = getItemStoreState(type).positions as Record<
      string,
      unknown[]
    >;
    const position = current?.[selectedKeyType]?.[sourceIndex] || null;
    if (!position) return null;
    const source = (
      ITEM_CANVAS_RULES[type] as ItemCanvasRulesOf
    ).duplicateSource(position as never);
    return {
      elementType: type,
      sourceIndex,
      keyName: source.keyName,
      position: source.position as DuplicateState['position'],
    };
  };

  const placeDuplicateItem = (
    type: ItemElementType,
    templatePosition: DuplicateState['position'],
    dx: number,
    dy: number,
  ) => {
    const maxZ = getMaxZIndex(selectedKeyType);
    void (ITEM_CANVAS_RULES[type] as ItemCanvasRulesOf)
      .placeDuplicated(
        selectedKeyType,
        templatePosition as never,
        dx,
        dy,
        maxZ + 1,
      )
      .catch(reportElementOpError);
  };

  return {
    addKeyAtPosition,
    placeDuplicateKey,
    addItemAtPosition,
    beginDuplicateItem,
    placeDuplicateItem,
  };
}
