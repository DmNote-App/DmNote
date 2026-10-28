import { useGraphItemStore } from '@stores/data/useGraphItemStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useKnobItemStore } from '@stores/data/useKnobItemStore';
import { useSpriteStore } from '@stores/data/useSpriteStore';
import { useStatItemStore } from '@stores/data/useStatItemStore';

import { EDITOR_ELEMENT_TYPES } from '@src/types/editor';
import type { EditorElementTypeV1 } from '@src/types/editor';

// 키 외 요소 종류 - 키는 keys 매핑과 인덱스 결합이라 스토어 경로가 다르다
export type ItemElementType = Exclude<EditorElementTypeV1, 'key'>;

const ITEM_STORES = {
  stat: useStatItemStore,
  graph: useGraphItemStore,
  knob: useKnobItemStore,
  sprite: useSpriteStore,
} as const satisfies Record<ItemElementType, unknown>;

export const getItemStoreState = (type: ItemElementType) =>
  ITEM_STORES[type].getState();

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
