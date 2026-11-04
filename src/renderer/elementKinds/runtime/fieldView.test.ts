import { describe, expect, it } from 'vitest';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { bundleFieldViewOf } from './bundleFieldView';
import { fieldPatchOps, panelFieldViewOf } from './fieldView';

const knob: ElementNode = {
  type: 'element',
  id: 'k1',
  kind: 'knob',
  frame: { x: 10, y: 20, width: 60, height: 70, rotation: 5 },
  name: '노브',
  className: 'my',
  values: { sensitivity: 2, reverse: true },
  // note는 노브 정의 밖 묶음 - 칸 보기에 펼치지 않는다
  bundles: {
    surface: { borderWidth: 3 },
    image: { activeImage: 'a.png' },
    note: { noteColor: '#stale' },
  },
  input: { type: 'axis', axisId: 'HIDA:1' },
  legacy: { index: 0, zIndex: 4, fields: { noteColor: '#kept' } },
};

describe('패널 칸 보기', () => {
  it('종류가 가진 칸·틀·공통 정보와 축 입력만 펼친다 (옛 칸·겹침 순서는 없다)', () => {
    expect(panelFieldViewOf(knob)).toEqual({
      id: 'k1',
      dx: 10,
      dy: 20,
      width: 60,
      height: 70,
      rotation: 5,
      hidden: false,
      layerName: '노브',
      className: 'my',
      sensitivity: 2,
      reverse: true,
      borderWidth: 3,
      activeImage: 'a.png',
      axisId: 'HIDA:1',
    });
  });

  it('같은 요소면 같은 객체, 축 입력이 없으면 묶음 칸 보기 그대로', () => {
    expect(panelFieldViewOf(knob)).toBe(panelFieldViewOf(knob));
    const key: ElementNode = {
      type: 'element',
      id: 'key-1',
      kind: 'key',
      frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
      input: { type: 'key', slot: 'KeyA' },
    };
    expect(panelFieldViewOf(key)).toBe(bundleFieldViewOf(key));
  });
});

describe('칸 패치 → 트리 연산', () => {
  it('칸 패치를 칸 종류에 맞는 트리 연산으로 나눈다', () => {
    expect(
      fieldPatchOps('4key', knob, {
        dx: 15,
        width: 80,
        sensitivity: 3,
        borderColor: '#fff',
        layerName: '새 이름',
        hidden: true,
        axisId: 'HIDA:2',
      }).ops,
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

  it('트리에 자리가 없는 칸은 unowned로 알린다', () => {
    expect(
      fieldPatchOps('4key', knob, {
        sensitivity: 3,
        zIndex: 4,
        groupId: 'g',
        fontColor: '#fff',
      }).unowned,
    ).toEqual(['zIndex', 'groupId', 'fontColor']);
  });
});
