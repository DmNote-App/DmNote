import { afterEach, describe, expect, it } from 'vitest';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { previewOverlay } from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { viewFieldsOf } from './viewFields';

const knob = {
  type: 'element',
  id: 'n1',
  kind: 'knob',
  frame: { x: 1, y: 2, width: 60, height: 60, rotation: 0 },
  values: { sensitivity: 1, reverse: false },
  bundles: { surface: { backgroundColor: '#111' } },
  input: { type: 'axis', axisId: 'LeftStickX' },
  legacy: { index: 0, zIndex: 3, fields: { fontSize: 20 } },
} as unknown as ElementNode;

describe('트리 요소의 칸 보기 + 편집 미리보기', () => {
  afterEach(() => previewOverlay.clearAll());

  it('트리 값을 칸 이름으로 펼치고 같은 탭의 미리보기 패치를 얹는다', () => {
    expect(viewFieldsOf(knob, '4key')).toMatchObject({
      id: 'n1',
      dx: 1,
      sensitivity: 1,
      backgroundColor: '#111',
      axisId: 'LeftStickX',
    });
    previewOverlay.applyLocalPatchByIds(
      '11111111-1111-4111-8111-111111111111',
      '4key',
      ['n1'],
      { backgroundColor: '#f00' },
      'knobPosition',
    );
    expect(viewFieldsOf(knob, '4key').backgroundColor).toBe('#f00');
    // 다른 탭 미리보기는 얹지 않는다
    expect(viewFieldsOf(knob, '5key').backgroundColor).toBe('#111');
  });

  it('종류가 갖지 않는 옛 칸(legacy.fields)과 옛 겹침 번호는 읽지 않는다', () => {
    const view = viewFieldsOf(knob, '4key');
    expect(view).not.toHaveProperty('fontSize');
    expect(view).not.toHaveProperty('zIndex');
  });
});

describe('칸 보기의 참조 안정성', () => {
  afterEach(() => previewOverlay.clearAll());

  it('같은 요소·같은 미리보기면 같은 객체, 미리보기가 바뀌면 새 객체', () => {
    const first = viewFieldsOf(knob, '4key');
    expect(viewFieldsOf(knob, '4key')).toBe(first);
    previewOverlay.applyLocalPatchByIds(
      '22222222-2222-4222-8222-222222222222',
      '4key',
      ['n1'],
      { sensitivity: 9 },
      'knobPosition',
    );
    const previewed = viewFieldsOf(knob, '4key');
    expect(previewed).not.toBe(first);
    expect(viewFieldsOf(knob, '4key')).toBe(previewed);
  });
});
