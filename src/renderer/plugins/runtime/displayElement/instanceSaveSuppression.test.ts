import { describe, expect, it } from 'vitest';

import {
  isInstanceSaveSuppressed,
  withoutInstanceSave,
} from './instanceSaveSuppression';

describe('플러그인 인스턴스 자동 저장 막기', () => {
  it('안에서만 막고, 겹쳐 불러도·던져도 밖에서는 풀린다', () => {
    expect(isInstanceSaveSuppressed()).toBe(false);
    const inner = withoutInstanceSave(() =>
      withoutInstanceSave(() => isInstanceSaveSuppressed()),
    );
    expect(inner).toBe(true);
    expect(() =>
      withoutInstanceSave(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(isInstanceSaveSuppressed()).toBe(false);
  });
});
