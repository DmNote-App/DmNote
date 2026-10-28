import { beforeEach, describe, expect, it } from 'vitest';

import { useGraphItemStore } from '@stores/data/useGraphItemStore';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useKnobItemStore } from '@stores/data/useKnobItemStore';
import { useSpriteStore } from '@stores/data/useSpriteStore';
import { useStatItemStore } from '@stores/data/useStatItemStore';
import { EDITOR_ELEMENT_TYPES } from '@src/types/editor';

import {
  getItemStoreState,
  readAuthorityPositions,
  snapshotAuthorityPositions,
  writeAuthorityPositions,
} from './elementStores';
import type { ItemElementType } from '@src/types/editor';

const ITEM_STORES = {
  stat: useStatItemStore,
  graph: useGraphItemStore,
  knob: useKnobItemStore,
  sprite: useSpriteStore,
} as const;

const marker = (type: string) => ({ tab: [{ id: `${type}-id` }] });

describe('elementStores', () => {
  beforeEach(() => {
    useKeyStore.getState().setKeyMappingsAndPositions(
      { tab: ['A'] } as never,
      {
        tab: [],
      } as never,
    );
    for (const store of Object.values(ITEM_STORES)) {
      store.getState().setPositions({});
    }
  });

  it('키 외 종류는 자기 스토어 상태를 돌려준다', () => {
    for (const [type, store] of Object.entries(ITEM_STORES)) {
      expect(getItemStoreState(type as ItemElementType)).toBe(store.getState());
    }
  });

  it('종류별 권위 컬렉션에 쓰고 읽는다', () => {
    for (const type of EDITOR_ELEMENT_TYPES) {
      writeAuthorityPositions(type, marker(type));
    }
    for (const type of EDITOR_ELEMENT_TYPES) {
      expect(readAuthorityPositions(type)).toEqual(marker(type));
    }
    expect(useKeyStore.getState().canonicalPositions).toEqual(marker('key'));
    expect(useKnobItemStore.getState().positions).toEqual(marker('knob'));
  });

  it('키 positions 교체는 매핑을 유지한다', () => {
    writeAuthorityPositions('key', marker('key'));
    expect(useKeyStore.getState().keyMappings).toEqual({ tab: ['A'] });
  });

  it('스냅샷은 전 종류를 같은 시점에 담는다', () => {
    for (const type of EDITOR_ELEMENT_TYPES) {
      writeAuthorityPositions(type, marker(type));
    }
    const snapshot = snapshotAuthorityPositions();
    expect(Object.keys(snapshot)).toEqual([...EDITOR_ELEMENT_TYPES]);
    for (const type of EDITOR_ELEMENT_TYPES) {
      expect(snapshot[type]).toBe(readAuthorityPositions(type));
    }
  });
});
