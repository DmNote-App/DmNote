import { describe, expect, it } from 'vitest';

import { legacyFieldPatch } from './legacyFieldPatch';

const knob = {
  id: 'k1',
  dx: 0,
  dy: 0,
  width: 60,
  height: 60,
  sensitivity: 1,
  reverse: false,
  backgroundColor: '#111111',
  backgroundGradient: null,
};

describe('옛 칸 패널 패치 → 바뀐 옛 칸', () => {
  it('값 칸 패치는 그 칸만 돌려준다', () => {
    expect(
      legacyFieldPatch('knob', knob, { property: 'sensitivity', value: 2.5 }),
    ).toEqual({ sensitivity: 2.5 });
  });

  it('채색 패치는 옛 패널과 같이 색·그라데이션 칸으로 푼다', () => {
    const patch = legacyFieldPatch('knob', knob, {
      property: 'backgroundPaint',
      value: { color: '#FF0000', gradient: null },
    } as never);
    expect(patch.backgroundColor).toBe('#FF0000');
    expect(patch).not.toHaveProperty('sensitivity');
  });

  it('바뀐 것이 없으면 빈 객체', () => {
    expect(
      legacyFieldPatch('knob', knob, { property: 'reverse', value: false }),
    ).toEqual({});
  });
});
