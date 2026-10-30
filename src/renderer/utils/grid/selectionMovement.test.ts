import { describe, expect, it } from 'vitest';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import {
  moveSelectedPluginElements,
  selectedPluginIds,
} from './selectionMovement';

describe('selectionMovement', () => {
  it('plugin 이동과 plugin별 scope 중복 제거를 같은 안정 ID 집합으로 계산한다', () => {
    const elements = [
      {
        fullId: 'plugin:first',
        pluginId: 'plugin',
        position: { x: 1, y: 2 },
      },
      {
        fullId: 'plugin:second',
        pluginId: 'plugin',
        position: { x: 3, y: 4 },
      },
      {
        fullId: 'other:first',
        pluginId: 'other',
        position: { x: 5, y: 6 },
      },
    ] as PluginDisplayElementInternal[];
    const selected = new Set(['plugin:first', 'plugin:second']);

    expect(selectedPluginIds(elements, selected)).toEqual(['plugin']);
    const moved = moveSelectedPluginElements(elements, selected, 2, 3);
    expect(moved.map((element) => element.position)).toEqual([
      { x: 3, y: 5 },
      { x: 5, y: 7 },
      { x: 5, y: 6 },
    ]);
    expect(moved[2]).toBe(elements[2]);
  });
});
