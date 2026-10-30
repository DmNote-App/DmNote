import { describe, expect, it } from 'vitest';

import { scaleDocumentFrames } from './documentGroupResize';

const frame = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
  rotation: 0,
});

describe('트리 요소 묶음 크기 조절', () => {
  it('선택틀 안의 상대 위치·크기를 새 틀에 비례로 옮긴다', () => {
    const scaled = scaleDocumentFrames(
      [
        { id: 'a', frame: frame(0, 0, 20, 20) },
        { id: 'b', frame: frame(80, 40, 20, 20) },
      ],
      { x: 0, y: 0, width: 100, height: 60 },
      { x: 10, y: 0, width: 200, height: 30 },
    );
    expect(scaled).toEqual([
      { id: 'a', frame: frame(10, 0, 40, 10) },
      { id: 'b', frame: frame(170, 20, 40, 10) },
    ]);
  });

  it('너비·높이가 0인 틀은 그 축을 옮기기만 한다', () => {
    const scaled = scaleDocumentFrames(
      [{ id: 'a', frame: frame(5, 5, 0, 10) }],
      { x: 5, y: 5, width: 0, height: 10 },
      { x: 15, y: 5, width: 30, height: 20 },
    );
    expect(scaled[0].frame).toEqual(frame(15, 5, 0, 20));
  });
});
