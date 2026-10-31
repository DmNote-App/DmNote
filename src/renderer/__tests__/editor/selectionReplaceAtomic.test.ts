import { describe, expect, it } from 'vitest';

import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { useKeyStore } from '@stores/data/useKeyStore';

const KNOB = '00000000-0000-4000-8000-0000000000k1';

describe('바꿔 고르기는 중간의 빈 선택 없이', () => {
  it('트리로 옮긴 종류를 다시 고르거나 트리 요소를 바꿔 골라도 트리 선택이 비지 않는다', () => {
    useKeyStore.setState({ selectedKeyType: '4key' });
    useDocumentSelectionStore.getState().setSelection('4key', [KNOB]);
    const seen: string[][] = [];
    const unsubscribe = useDocumentSelectionStore.subscribe((state) =>
      seen.push(state.selectedIds),
    );
    // 옛 선택 스토어 경로 (레이어 행·옛 그룹 다시 누르기)
    useDocumentSelectionStore
      .getState()
      .setSelectedElements([{ type: 'knob', id: KNOB, index: 0 }]);
    // 트리 선택 스토어 경로
    useDocumentSelectionStore.getState().setSelection('4key', [KNOB]);
    unsubscribe();
    expect(seen.every((ids) => ids.length > 0)).toBe(true);
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([KNOB]);
  });
});
