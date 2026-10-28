import { describe, expect, it } from 'vitest';
import { defaultElementSize, fallbackElementSize } from './elementKinds';
import { DEFAULT_SPRITE_SIZE } from './key/sprites';

describe('요소 종류 크기', () => {
  it('저장 크기가 없을 때는 렌더 컴포넌트 기본값과 같은 대체 크기를 쓴다', () => {
    expect(fallbackElementSize('key')).toEqual({ width: 60, height: 60 });
    expect(fallbackElementSize('stat')).toEqual({ width: 60, height: 60 });
    expect(fallbackElementSize('graph')).toEqual({ width: 200, height: 100 });
    expect(fallbackElementSize('knob')).toEqual({ width: 60, height: 60 });
    expect(fallbackElementSize('sprite')).toEqual({
      width: DEFAULT_SPRITE_SIZE,
      height: DEFAULT_SPRITE_SIZE,
    });
  });

  it('새로 만들 때 크기는 대체 크기와 따로 둔다', () => {
    expect(defaultElementSize('graph')).toEqual({ width: 120, height: 60 });
  });
});
