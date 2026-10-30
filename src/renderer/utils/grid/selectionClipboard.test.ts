import { describe, expect, it } from 'vitest';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import { createSelectionClipboardItems } from './selectionClipboard';

describe('옛 선택 클립보드', () => {
  it('고른 플러그인 요소만 fullId 없이 담는다', () => {
    const element = {
      id: 'one',
      fullId: 'plugin::one',
      pluginId: 'plugin',
      html: '<div />',
      position: { x: 1, y: 2 },
    } as PluginDisplayElementInternal;
    const items = createSelectionClipboardItems(
      [
        { type: 'plugin', id: 'plugin::one' },
        { type: 'plugin', id: 'plugin::missing' },
        { type: 'key', id: 'k1' },
      ],
      [element],
    );
    expect(items).toEqual([
      {
        type: 'plugin',
        element: {
          id: 'one',
          pluginId: 'plugin',
          html: '<div />',
          position: { x: 1, y: 2 },
        },
      },
    ]);
  });
});
