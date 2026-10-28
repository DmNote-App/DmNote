import { useSyncExternalStore } from 'react';

import {
  getItemStoreState,
  subscribeItemStores,
  type ItemElementCollections,
} from '@src/renderer/editor/model/elementStores';
import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  ITEM_ELEMENT_TYPES,
} from '@src/types/editor';

let itemSnapshot: ItemElementCollections | null = null;

// positions 참조가 모두 같으면 이전 스냅샷 유지 - 개별 selector 구독과 같은 리렌더 조건
const readItemSnapshot = (): ItemElementCollections => {
  const previous = itemSnapshot;
  if (
    previous &&
    ITEM_ELEMENT_TYPES.every(
      (type) =>
        previous[EDITOR_ELEMENT_POSITION_FIELDS[type]] ===
        getItemStoreState(type).positions,
    )
  ) {
    return previous;
  }
  itemSnapshot = Object.fromEntries(
    ITEM_ELEMENT_TYPES.map((type) => [
      EDITOR_ELEMENT_POSITION_FIELDS[type],
      getItemStoreState(type).positions,
    ]),
  ) as unknown as ItemElementCollections;
  return itemSnapshot;
};

// 키 외 종류 canonical 컬렉션 구독
export const useItemElementCollections = (): ItemElementCollections =>
  useSyncExternalStore(subscribeItemStores, readItemSnapshot, readItemSnapshot);
