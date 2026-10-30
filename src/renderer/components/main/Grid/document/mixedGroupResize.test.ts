import { describe, expect, it } from 'vitest';

import { mixedResizeTargets } from './mixedGroupResize';

const frame = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
  rotation: 0,
});

describe('섞인 선택 묶음 크기 조절', () => {
  it('두 가족을 한 틀로 비례해 옮기고 옛 종류는 종류별 위치 패치로 나눈다', () => {
    const { legacy, document } = mixedResizeTargets(
      [{ type: 'key', id: 'k1', frame: frame(0, 0, 50, 50) }],
      [{ id: 't1', frame: frame(50, 0, 50, 50) }],
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 0, y: 0, width: 200, height: 100 },
    );
    expect(legacy.get('key')).toEqual([
      { id: 'k1', patch: { dx: 0, dy: 0, width: 100, height: 100 } },
    ]);
    expect(document).toEqual([{ id: 't1', frame: frame(100, 0, 100, 100) }]);
  });
});
