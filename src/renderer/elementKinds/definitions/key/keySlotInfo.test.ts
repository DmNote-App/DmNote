import { describe, expect, it } from 'vitest';

import { keySlotOf, keyTitleOf } from './keySlotInfo';

describe('키 요소의 입력 슬롯', () => {
  it('트리 입력 슬롯을 읽는다 - 키 입력이 아니면 null', () => {
    expect(keySlotOf({ input: { type: 'key', slot: 'KeyA' } } as never)).toBe(
      'KeyA',
    );
    expect(keySlotOf({ input: { type: 'axis', axisId: 'x' } } as never)).toBe(
      null,
    );
    expect(keySlotOf(undefined)).toBe(null);
  });

  it('패널 제목은 슬롯 이름, 없으면 슬롯 코드, 없으면 Key', () => {
    expect(
      keyTitleOf({ input: { type: 'key', slot: 'LEFT SHIFT' } } as never),
    ).toBe('LShift');
    expect(
      keyTitleOf({
        input: { type: 'key', slot: { keys: ['A', 'B'], match: 'any' } },
      } as never),
    ).toBe('A/B');
    expect(keyTitleOf({ input: { type: 'key', slot: '' } } as never)).toBe(
      'Key',
    );
  });
});
