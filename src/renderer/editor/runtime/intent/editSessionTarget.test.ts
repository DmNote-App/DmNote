import { afterEach, describe, expect, it } from 'vitest';

import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { getEditSessionTarget } from './editSessionTarget';

describe('편집 세션 대상 지문', () => {
  afterEach(() =>
    useDocumentSelectionStore.setState({
      sceneId: null,
      selectedIds: [],
      selectedElements: [],
    }),
  );

  it('트리 요소 선택이 바뀌어도 대상이 갈린다', () => {
    const select = (ids: string[]) =>
      useDocumentSelectionStore.setState({ sceneId: '4key', selectedIds: ids });
    select(['a']);
    const first = getEditSessionTarget();
    select(['b']);
    expect(getEditSessionTarget()).not.toBe(first);
    select(['a']);
    expect(getEditSessionTarget()).toBe(first);
  });

  it('플러그인 요소 선택도 대상에 든다', () => {
    const first = getEditSessionTarget();
    useDocumentSelectionStore.setState({
      selectedElements: [{ type: 'plugin', id: 'p::1' }],
    });
    expect(getEditSessionTarget()).not.toBe(first);
  });
});
