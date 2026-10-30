import { afterEach, describe, expect, it } from 'vitest';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { previewOverlay } from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { treeElementPositionOf } from './treeElementPosition';

const knob = {
  type: 'element',
  id: 'n1',
  kind: 'knob',
  frame: { x: 1, y: 2, width: 60, height: 60, rotation: 0 },
  values: { sensitivity: 1, reverse: false },
  bundles: { surface: { backgroundColor: '#111' } },
} as unknown as ElementNode;

describe('트리 요소의 옛 모양 + 편집 미리보기', () => {
  afterEach(() => previewOverlay.clearAll());

  it('트리 값을 옛 칸으로 펼치고 같은 탭의 미리보기 패치를 얹는다', () => {
    expect(treeElementPositionOf(knob, '4key')).toMatchObject({
      id: 'n1',
      dx: 1,
      sensitivity: 1,
      backgroundColor: '#111',
    });
    previewOverlay.applyLocalPatchByIds(
      '11111111-1111-4111-8111-111111111111',
      '4key',
      ['n1'],
      { backgroundColor: '#f00' },
      'knobPosition',
    );
    expect(treeElementPositionOf(knob, '4key').backgroundColor).toBe('#f00');
    // 다른 탭 미리보기는 얹지 않는다
    expect(treeElementPositionOf(knob, '5key').backgroundColor).toBe('#111');
  });
});

describe('트리 요소 옛 모양의 참조 안정성', () => {
  afterEach(() => previewOverlay.clearAll());

  it('같은 요소·같은 미리보기면 같은 객체, 미리보기가 바뀌면 새 객체', () => {
    const first = treeElementPositionOf(knob, '4key');
    expect(treeElementPositionOf(knob, '4key')).toBe(first);
    previewOverlay.applyLocalPatchByIds(
      '22222222-2222-4222-8222-222222222222',
      '4key',
      ['n1'],
      { sensitivity: 9 },
      'knobPosition',
    );
    const previewed = treeElementPositionOf(knob, '4key');
    expect(previewed).not.toBe(first);
    expect(treeElementPositionOf(knob, '4key')).toBe(previewed);
  });
});
