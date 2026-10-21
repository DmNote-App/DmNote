import { describe, expect, it } from 'vitest';
import { rotatePointAround } from '@utils/element/rotation';
import { getSelectionOutlineEdges } from './selectionOutline';

const group = { x: 10, y: 20, width: 180, height: 100 };
const bounds = { x: 10, y: 20, width: 30, height: 40 };

describe('getSelectionOutlineEdges', () => {
  it('바깥 박스와 겹치는 변만 생략하고 내부 요소는 네 변을 유지한다', () => {
    const frame = { bounds: group, rotation: 0 };
    expect(getSelectionOutlineEdges(bounds, 0, frame)).toEqual({
      top: false,
      right: true,
      bottom: true,
      left: false,
    });
    expect(
      getSelectionOutlineEdges({ ...bounds, x: 50, y: 50 }, 0, frame),
    ).toEqual({
      top: true,
      right: true,
      bottom: true,
      left: true,
    });
  });

  it.each([30, 90, -135, 180])(
    '그룹과 함께 %s° 회전한 뒤에도 같은 변을 생략한다',
    (rotation) => {
      const center = {
        x: group.x + group.width / 2,
        y: group.y + group.height / 2,
      };
      const elementCenter = rotatePointAround(
        { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
        center,
        rotation,
      );
      const rotatedBounds = {
        ...bounds,
        x: elementCenter.x - bounds.width / 2,
        y: elementCenter.y - bounds.height / 2,
      };
      expect(
        getSelectionOutlineEdges(rotatedBounds, rotation, {
          bounds: group,
          rotation,
        }),
      ).toEqual({
        top: false,
        right: true,
        bottom: true,
        left: false,
      });
    },
  );

  it('꼭짓점만 바깥 박스에 닿는 회전 요소는 변을 숨기지 않는다', () => {
    const size = Math.SQRT2 * 20;
    expect(
      getSelectionOutlineEdges({ x: -10, y: -10, width: 20, height: 20 }, 45, {
        bounds: { x: -size / 2, y: -size / 2, width: size, height: size },
        rotation: 0,
      }),
    ).toEqual({ top: true, right: true, bottom: true, left: true });
  });

  it('바깥 박스가 없거나 변이 박스 밖으로 이어지면 윤곽을 유지한다', () => {
    expect(getSelectionOutlineEdges(bounds, 0, null)).toEqual({
      top: true,
      right: true,
      bottom: true,
      left: true,
    });
    expect(
      getSelectionOutlineEdges({ ...bounds, y: 0, height: 150 }, 0, {
        bounds: group,
        rotation: 0,
      }),
    ).toEqual({ top: true, right: true, bottom: true, left: true });
  });
});
