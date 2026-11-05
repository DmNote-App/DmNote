import { afterEach, describe, expect, it } from 'vitest';

import { previewOverlay } from '@src/renderer/editor/runtime/gesture/previewOverlay';
import type { Scene } from '@src/types/generated/elementDocument';
import { keyAnchorPosition } from './keyAnchorPosition';

const key = (id: string, slot: unknown, x: number) => ({
  type: 'element',
  id,
  kind: 'key',
  frame: { x, y: x + 1, width: 60, height: 60, rotation: 0 },
  input: { type: 'key', slot },
});

const scene = {
  nodes: [
    key('k1', '', 0),
    {
      type: 'group',
      id: 'g1',
      children: [key('k2', 'KeyA', 100), key('k3', 'KeyA', 200)],
    },
    key('k4', { keys: ['KeyB', 'KeyC'], match: 'any' }, 300),
  ],
} as unknown as Scene;

describe('키에 붙은 요소의 기준 위치', () => {
  afterEach(() => previewOverlay.clearAll());

  it('그 슬롯 키의 위치 - 트리 순서로 첫 키 (그룹 안까지)', () => {
    expect(keyAnchorPosition(scene, '4key', 'KeyA')).toEqual({
      x: 100,
      y: 101,
    });
    // 여러 키 슬롯은 정규형으로 맞춘다
    expect(keyAnchorPosition(scene, '4key', 'KeyB|KeyC')).toEqual({
      x: 300,
      y: 301,
    });
    expect(keyAnchorPosition(scene, '4key', 'KeyZ')).toBeNull();
    expect(keyAnchorPosition(undefined, '4key', 'KeyA')).toBeNull();
  });

  it('그 탭의 편집 미리보기를 얹는다', () => {
    previewOverlay.applyLocalPatchByIds(
      '33333333-3333-4333-8333-333333333333',
      '4key',
      ['k2'],
      { dx: 150 },
      'keyPosition',
    );
    expect(keyAnchorPosition(scene, '4key', 'KeyA')).toEqual({
      x: 150,
      y: 101,
    });
  });
});
