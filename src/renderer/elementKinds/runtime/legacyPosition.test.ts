import { describe, expect, it } from 'vitest';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { legacyPositionOf } from './legacyPosition';

const knob: ElementNode = {
  type: 'element',
  id: 'k1',
  kind: 'knob',
  frame: { x: 10, y: 20, width: 60, height: 70, rotation: 5 },
  name: '노브',
  className: 'my',
  values: { sensitivity: 2, reverse: true },
  // note는 노브 정의 밖 묶음 - 옛 모양에 펼치지 않는다
  bundles: {
    surface: { borderWidth: 3 },
    image: { activeImage: 'a.png' },
    note: { noteColor: '#stale' },
  },
  input: { type: 'axis', axisId: 'HIDA:1' },
  legacy: { index: 0, zIndex: 4, fields: { noteColor: '#kept' } },
};

describe('트리 요소 ↔ 옛 위치 모양', () => {
  it('트리 요소를 옛 위치 객체로 펼친다', () => {
    expect(legacyPositionOf(knob)).toMatchObject({
      id: 'k1',
      dx: 10,
      dy: 20,
      width: 60,
      height: 70,
      rotation: 5,
      layerName: '노브',
      className: 'my',
      sensitivity: 2,
      reverse: true,
      borderWidth: 3,
      activeImage: 'a.png',
      noteColor: '#kept',
      axisId: 'HIDA:1',
      zIndex: 4,
    });
  });
});
