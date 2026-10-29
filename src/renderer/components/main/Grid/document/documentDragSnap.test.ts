import { describe, expect, it } from 'vitest';

import { calculateBounds } from '@utils/grid/smartGuides';
import { documentDragSnap } from './documentDragSnap';

const frame = (x: number, y: number) => ({
  x,
  y,
  width: 100,
  height: 100,
  rotation: 0,
});

describe('트리 요소 끌기 맞추기', () => {
  it('정렬 가이드가 켜져 있으면 다른 요소 가장자리에 붙이고 가이드를 낸다', () => {
    const others = [calculateBounds(300, 400, 100, 100, 'key-1')];
    const result = documentDragSnap({
      origins: [{ id: 't1', frame: frame(0, 0) }],
      selfId: 't1',
      dx: 297,
      dy: 3,
      others,
      gridSize: 5,
      alignment: true,
      spacing: false,
    });
    // 아래 요소 왼쪽 가장자리(300)에 맞추고, 안 붙는 세로는 격자에 맞춘다
    expect(result.offsetX).toBe(300);
    expect(result.offsetY).toBe(5);
    expect(result.guides?.active.length).toBeGreaterThan(0);
  });

  it('정렬 가이드를 끄면 격자에만 맞춘다', () => {
    const result = documentDragSnap({
      origins: [{ id: 't1', frame: frame(0, 0) }],
      selfId: 't1',
      dx: 197,
      dy: 3,
      others: [calculateBounds(300, 0, 100, 100, 'key-1')],
      gridSize: 5,
      alignment: false,
      spacing: true,
    });
    expect(result).toEqual({ offsetX: 195, offsetY: 5, guides: null });
  });

  it('여러 개면 묶음 상자 기준으로 맞추고 모두 같은 만큼 옮긴다', () => {
    const result = documentDragSnap({
      origins: [
        { id: 't1', frame: frame(0, 0) },
        { id: 't2', frame: frame(0, 150) },
      ],
      selfId: 't2',
      dx: 0,
      dy: 4,
      others: [calculateBounds(300, 0, 100, 100, 'key-1')],
      gridSize: 5,
      alignment: true,
      spacing: false,
    });
    expect(result.offsetY).toBe(0);
  });
});
