import { create } from 'zustand';
import type { CanonicalEditorDocumentV1 } from '@src/types/editor';
import type { KeyMappings } from '@src/types/key/keys';

type CanonicalKeyPositions = CanonicalEditorDocumentV1['keyPositions'];

// 테스트 상태 꾸미기 전용 - 옛 키 매핑·키 위치 배열 (앱은 트리에서 읽는다).
// treeFromLegacyStores가 이 값으로 트리 장면을 만든다
interface LegacyKeyArraysState {
  keyMappings: KeyMappings;
  positions: CanonicalKeyPositions;
  canonicalPositions: CanonicalKeyPositions;
  setKeyMappings: (mappings: KeyMappings) => void;
  setPositions: (positions: CanonicalKeyPositions) => void;
  setKeyMappingsAndPositions: (
    mappings: KeyMappings,
    positions: CanonicalKeyPositions,
  ) => void;
}

export const useLegacyKeyArrays = create<LegacyKeyArraysState>((set) => ({
  keyMappings: {},
  positions: {},
  canonicalPositions: {},
  setKeyMappings: (mappings) => set({ keyMappings: mappings }),
  setPositions: (positions) =>
    set({ canonicalPositions: positions, positions }),
  setKeyMappingsAndPositions: (mappings, positions) =>
    set({ keyMappings: mappings, canonicalPositions: positions, positions }),
}));
