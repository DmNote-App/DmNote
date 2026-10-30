import { describe, expect, it } from 'vitest';

import { useSpriteStore } from '@stores/data/useSpriteStore';
import { spriteResizeValues } from './spriteResizeValues';

const transform = (x: number, y: number) => ({
  x,
  y,
  rotation: 0,
  scale: 1,
  flipX: false,
  flipY: false,
});

const sprite = {
  type: 'element' as const,
  id: 's1',
  kind: 'sprite',
  frame: { x: 0, y: 0, width: 200, height: 200, rotation: 0 },
  values: {
    idleTransform: transform(20, 10),
    poses: [{ poseId: 'p', triggers: [], transform: transform(40, -10) }],
  },
};

describe('스프라이트 크기 조절 값', () => {
  it('크기 비율로 기본·자세 이동값을 맞춘다 (옛 resizeSprite와 같다)', () => {
    const values = spriteResizeValues(sprite as never, {
      x: 0,
      y: 0,
      width: 400,
      height: 100,
    }) as {
      idleTransform: { x: number; y: number };
      poses: Array<{ transform: { x: number; y: number } }>;
    };
    expect(values.idleTransform).toMatchObject({ x: 40, y: 5 });
    expect(values.poses[0].transform).toMatchObject({ x: 80, y: -5 });
  });

  it('크기가 그대로면 바꿀 값이 없다', () => {
    expect(
      spriteResizeValues(sprite as never, {
        x: 5,
        y: 5,
        width: 200,
        height: 200,
      }),
    ).toBeNull();
  });

  it('이동값은 옛 스토어 값(패널 편집이 먼저 반영된다)을 쓴다', () => {
    useSpriteStore.setState({
      positions: {
        '4key': [
          {
            id: 's1',
            idleTransform: transform(50, 0),
            poses: [],
          } as never,
        ],
      },
    });
    const values = spriteResizeValues(sprite as never, {
      x: 0,
      y: 0,
      width: 400,
      height: 200,
    }) as { idleTransform: { x: number }; poses: unknown[] };
    expect(values.idleTransform.x).toBe(100);
    expect(values.poses).toEqual([]);
    useSpriteStore.setState({ positions: {} });
  });
});
