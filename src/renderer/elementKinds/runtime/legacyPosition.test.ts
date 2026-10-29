import { describe, expect, it } from 'vitest';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { legacyPatchOps, legacyPositionOf } from './legacyPosition';

const knob: ElementNode = {
  type: 'element',
  id: 'k1',
  kind: 'knob',
  frame: { x: 10, y: 20, width: 60, height: 70, rotation: 5 },
  name: '노브',
  className: 'my',
  values: { sensitivity: 2, reverse: true },
  // image는 노브 정의 밖 묶음 - 옛 모양에 펼치지 않는다
  bundles: { surface: { borderWidth: 3 }, image: { activeImage: 'stale.png' } },
  input: { type: 'axis', axisId: 'HIDA:1' },
  legacy: { index: 0, zIndex: 4, fields: { activeImage: 'a.png' } },
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
      axisId: 'HIDA:1',
      zIndex: 4,
    });
  });

  it('옛 칸 패치를 칸 종류에 맞는 트리 연산으로 나눈다', () => {
    expect(
      legacyPatchOps('4key', knob, {
        dx: 15,
        width: 80,
        sensitivity: 3,
        borderColor: '#fff',
        layerName: '새 이름',
        hidden: true,
        axisId: 'HIDA:2',
      }),
    ).toEqual([
      { op: 'setFrame', scene: '4key', id: 'k1', frame: { x: 15, width: 80 } },
      {
        op: 'setCommon',
        scene: '4key',
        id: 'k1',
        name: '새 이름',
        hidden: true,
      },
      { op: 'setValues', scene: '4key', id: 'k1', values: { sensitivity: 3 } },
      {
        op: 'setBundle',
        scene: '4key',
        id: 'k1',
        bundle: 'surface',
        fields: { borderColor: '#fff' },
      },
      {
        op: 'setInput',
        scene: '4key',
        id: 'k1',
        input: { type: 'axis', axisId: 'HIDA:2' },
      },
    ]);
  });
});
