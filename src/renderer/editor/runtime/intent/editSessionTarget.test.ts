import { afterEach, describe, expect, it } from 'vitest';

import { setOtherSelectionReader } from '@stores/grid/keepOtherSelection';
import { getEditSessionTarget } from './editSessionTarget';

describe('편집 세션 대상 지문', () => {
  afterEach(() => setOtherSelectionReader(() => []));

  it('트리 요소 선택(트리로 옮긴 옛 종류 포함)이 바뀌어도 대상이 갈린다', () => {
    let ids: string[] = ['a'];
    setOtherSelectionReader(() => ids);
    const first = getEditSessionTarget();
    ids = ['b'];
    expect(getEditSessionTarget()).not.toBe(first);
    ids = ['a'];
    expect(getEditSessionTarget()).toBe(first);
  });
});
