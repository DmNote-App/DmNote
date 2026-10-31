import { beforeEach, describe, expect, it } from 'vitest';

import {
  pruneStalePluginSelection,
  useDocumentSelectionStore,
} from './useDocumentSelectionStore';

describe('죽은 플러그인 선택 prune', () => {
  beforeEach(() => {
    useDocumentSelectionStore.setState({ selectedElements: [] });
  });

  it('죽은 plugin fullId 선택만 제거된다', () => {
    useDocumentSelectionStore.getState().setSelectedElements([
      { type: 'plugin', id: 'plugin-a:dead' },
      { type: 'plugin', id: 'plugin-a:alive' },
    ]);

    pruneStalePluginSelection(new Set(['plugin-a:alive']));

    const selected = useDocumentSelectionStore.getState().selectedElements;
    expect(selected).toEqual([{ type: 'plugin', id: 'plugin-a:alive' }]);
  });

  it('모든 선택이 살아 있으면 선택 참조를 보존한다', () => {
    useDocumentSelectionStore
      .getState()
      .setSelectedElements([{ type: 'plugin', id: 'plugin-a:alive' }]);
    const reference = useDocumentSelectionStore.getState().selectedElements;

    pruneStalePluginSelection(new Set(['plugin-a:alive']));

    expect(useDocumentSelectionStore.getState().selectedElements).toBe(
      reference,
    );
  });

  it('빈 선택이면 아무것도 하지 않는다', () => {
    const reference = useDocumentSelectionStore.getState().selectedElements;

    pruneStalePluginSelection(new Set());

    expect(useDocumentSelectionStore.getState().selectedElements).toBe(
      reference,
    );
  });
});
