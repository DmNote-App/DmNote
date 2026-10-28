import { useGraphItemStore } from '@stores/data/useGraphItemStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useKnobItemStore } from '@stores/data/useKnobItemStore';
import { useSpriteStore } from '@stores/data/useSpriteStore';
import { useStatItemStore } from '@stores/data/useStatItemStore';

import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  EDITOR_ELEMENT_TYPES,
  ITEM_ELEMENT_TYPES,
} from '@src/types/editor';
import type {
  EditorElementTypeV1,
  ElementCollections,
  ItemElementType,
} from '@src/types/editor';

const ITEM_STORES = {
  stat: useStatItemStore,
  graph: useGraphItemStore,
  knob: useKnobItemStore,
  sprite: useSpriteStore,
} as const satisfies Record<ItemElementType, unknown>;

export const getItemStoreState = (type: ItemElementType) =>
  ITEM_STORES[type].getState();

// 외부 스냅샷 적용 (부트스트랩) - 스토어 상태의 positions만 교체
export const replaceItemStorePositions = (
  type: ItemElementType,
  positions: unknown,
): void => {
  (
    ITEM_STORES[type] as {
      setState: (partial: { positions: unknown }) => void;
    }
  ).setState({ positions });
};

export type ItemElementCollections = Omit<ElementCollections, 'keyPositions'>;

// 키 외 종류 스토어 변경 구독
export const subscribeItemStores = (onChange: () => void) => {
  const unsubscribes = ITEM_ELEMENT_TYPES.map((type) =>
    ITEM_STORES[type].subscribe(onChange),
  );
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
};

// 권위 컬렉션 - 키는 프리뷰 합성 전 canonical
export const readAuthorityPositions = (type: EditorElementTypeV1) =>
  type === 'key'
    ? useKeyStore.getState().canonicalPositions
    : getItemStoreState(type).positions;

export type AuthorityPositions = ReturnType<typeof readAuthorityPositions>;

// 전 종류 권위 컬렉션을 같은 시점에 읽는다
export const snapshotAuthorityPositions = () =>
  Object.fromEntries(
    EDITOR_ELEMENT_TYPES.map((type) => [type, readAuthorityPositions(type)]),
  ) as Record<EditorElementTypeV1, AuthorityPositions>;

// 같은 스냅샷을 문서 필드 형태로
export const captureElementCollections = (): ElementCollections =>
  Object.fromEntries(
    EDITOR_ELEMENT_TYPES.map((type) => [
      EDITOR_ELEMENT_POSITION_FIELDS[type],
      readAuthorityPositions(type),
    ]),
  ) as unknown as ElementCollections;

// 키는 매핑을 유지한 채 positions만 교체
export const writeAuthorityPositions = (
  type: EditorElementTypeV1,
  next: unknown,
): void => {
  if (type === 'key') {
    useKeyStore.getState().setPositions(next as never);
  } else {
    getItemStoreState(type).setPositions(next as never);
  }
};

// 참조 CAS 복원 - 우리가 쓴 컬렉션 그대로인 종류만 before로 되돌린다
export const restoreElementCollectionsIfUnchanged = (
  written: ElementCollections,
  before: ElementCollections,
): void => {
  for (const type of EDITOR_ELEMENT_TYPES) {
    const field = EDITOR_ELEMENT_POSITION_FIELDS[type];
    if (readAuthorityPositions(type) === written[field]) {
      writeAuthorityPositions(type, before[field]);
    }
  }
};

// 종류 순서대로 전 컬렉션 교체
export const writeElementCollections = (
  collections: ElementCollections,
): void => {
  for (const type of EDITOR_ELEMENT_TYPES) {
    writeAuthorityPositions(
      type,
      collections[EDITOR_ELEMENT_POSITION_FIELDS[type]],
    );
  }
};
