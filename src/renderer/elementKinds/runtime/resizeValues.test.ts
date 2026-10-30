import { describe, expect, it, vi } from 'vitest';

const transform = (x: number) => ({
  x,
  y: 0,
  rotation: 0,
  scale: 1,
  flipX: false,
  flipY: false,
});

const elements: Record<string, unknown> = {
  s1: {
    type: 'element',
    id: 's1',
    kind: 'sprite',
    frame: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
    values: { idleTransform: transform(10), poses: [] },
  },
  n1: {
    type: 'element',
    id: 'n1',
    kind: 'knob',
    frame: { x: 0, y: 0, width: 60, height: 60, rotation: 0 },
  },
};

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) => elements[id],
  }),
}));

import { withResizeValues } from './resizeValues';

describe('크기와 함께 맞출 값', () => {
  it('크기가 바뀌는 스프라이트 setFrame 뒤에 이동값 setValues를 붙인다', () => {
    const ops = withResizeValues([
      { op: 'setFrame', scene: '4key', id: 's1', frame: { width: 200 } },
    ]);
    expect(ops).toHaveLength(2);
    expect(ops[1]).toMatchObject({
      op: 'setValues',
      id: 's1',
      values: { idleTransform: { x: 20 } },
    });
  });

  it('맞출 값이 없는 종류·이동만·다른 연산은 그대로 둔다', () => {
    const ops = [
      {
        op: 'setFrame' as const,
        scene: '4key',
        id: 'n1',
        frame: { width: 90 },
      },
      { op: 'setFrame' as const, scene: '4key', id: 's1', frame: { x: 5 } },
      { op: 'remove' as const, scene: '4key', ids: ['s1'] },
    ];
    expect(withResizeValues(ops)).toEqual(ops);
  });
});
