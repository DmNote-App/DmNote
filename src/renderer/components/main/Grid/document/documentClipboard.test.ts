import { describe, expect, it } from 'vitest';

import { buildDocumentPaste } from './documentClipboard';

const tracker = (id: string, x: number, y = 10) => ({
  type: 'element' as const,
  id,
  kind: 'cursorTracker',
  frame: { x, y, width: 120, height: 120, rotation: 0 },
  values: { mode: 'motion' },
});

describe('트리 요소 붙여넣기', () => {
  it('새 id로 옛 종류와 같은 만큼 비켜 넣고 겹치는 순서를 지킨다', () => {
    let next = 0;
    const { ops, ids } = buildDocumentPaste(
      '5key',
      [tracker('a', 0), tracker('b', 50)],
      () => `new-${(next += 1)}`,
    );
    expect(ids).toEqual(['new-1', 'new-2']);
    expect(ops).toEqual([
      {
        op: 'insert',
        scene: '5key',
        parent: null,
        index: null,
        node: tracker('new-1', 20, 30),
      },
      {
        op: 'insert',
        scene: '5key',
        parent: null,
        index: null,
        node: tracker('new-2', 70, 30),
      },
    ]);
  });

  it('그룹은 안쪽 요소까지 새 id를 붙인다', () => {
    let next = 0;
    const { ops, ids } = buildDocumentPaste(
      's',
      [{ type: 'group', id: 'g', name: 'G', children: [tracker('a', 0)] }],
      () => `n${(next += 1)}`,
    );
    expect(ids).toEqual(['n2']);
    expect(ops[0]).toMatchObject({
      node: {
        type: 'group',
        id: 'n1',
        children: [{ id: 'n2', frame: { x: 20, y: 30 } }],
      },
    });
  });
});
