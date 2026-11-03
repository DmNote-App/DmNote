import { describe, expect, it } from 'vitest';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { bundleFieldViewOf } from './bundleFieldView';

const key = {
  type: 'element',
  id: 'key-1',
  kind: 'key',
  frame: { x: 4, y: 8, width: 60, height: 60, rotation: 15 },
  className: 'my-key',
  values: { displayText: 'A', count: 3 },
  bundles: {
    surface: { backgroundColor: '#112233', borderWidth: null },
    font: { fontSize: 14 },
    // 정의 밖 묶음은 보존만 된다
    unknown: { secret: true },
  },
  legacy: { index: 0, fields: { groupId: 'g1' } },
} as unknown as ElementNode;

describe('기능 묶음을 펼친 그리기 입력', () => {
  it('고유 값·종류가 쓰는 묶음 칸·틀·공통 정보를 펼친다 (옛 정보 칸은 싣지 않는다)', () => {
    expect(bundleFieldViewOf(key)).toEqual({
      displayText: 'A',
      count: 3,
      backgroundColor: '#112233',
      borderWidth: null,
      fontSize: 14,
      id: 'key-1',
      dx: 4,
      dy: 8,
      width: 60,
      height: 60,
      rotation: 15,
      hidden: false,
      className: 'my-key',
    });
  });

  it('오버레이는 받은 자리를 쓰고, 같은 요소·같은 자리면 같은 객체다', () => {
    const placed = bundleFieldViewOf(key, { x: 10, y: 20, zIndex: 3 });
    expect(placed).toMatchObject({ dx: 10, dy: 20, zIndex: 3 });
    expect(bundleFieldViewOf(key, { x: 10, y: 20, zIndex: 3 })).toBe(placed);
    expect(bundleFieldViewOf(key, { x: 11, y: 20, zIndex: 3 })).not.toBe(
      placed,
    );
  });
});
