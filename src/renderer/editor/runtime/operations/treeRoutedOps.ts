// 트리로 옮긴 옛 종류(TREE_EDITED_KINDS)의 옛 편집 연산 중 위치·회전·숨김·이름·지우기는 트리 연산으로 바꾼다.
// 편집 화면이 그 종류를 트리에서 그리므로 트리에 낙관 반영돼야 바로 보인다. 겉모습 칸은 styleOps가 정한다
import type { EditorOpV1 } from '@src/types/editor';
import type { Op } from '@src/types/generated/elementDocument';

interface TreeRouteContext {
  isTreeEdited: (type: string) => boolean;
  // 요소가 있는 장면 - 트리에 없으면 undefined
  sceneOf: (id: string) => string | undefined;
  // 겉모습 칸 패치의 트리 연산 - 트리에 자리가 없는 옛 칸이 섞이면 null
  styleOps?: (op: EditorOpV1, scene: string) => Op[] | null;
}

const treeOpOf = (op: EditorOpV1, scene: string): Op | null => {
  switch (op.kind) {
    case 'setBounds':
      return {
        op: 'setFrame',
        scene,
        id: op.id,
        frame: {
          x: op.bounds.dx,
          y: op.bounds.dy,
          width: op.bounds.width,
          height: op.bounds.height,
        },
      };
    // 스프라이트 상자 - 자세 이동값 비례는 트리 쓰기 입구가 붙인다(withResizeValues, 같은 projection)
    case 'resizeSprite':
      return {
        op: 'setFrame',
        scene,
        id: op.id,
        frame: {
          x: op.bounds.dx,
          y: op.bounds.dy,
          width: op.bounds.width,
          height: op.bounds.height,
        },
      };
    case 'deleteElement':
      return { op: 'remove', scene, ids: [op.id] };
    case 'patchElement': {
      const { property, value } = op.patch as {
        property: string;
        value: unknown;
      };
      if (property === 'hidden') {
        return { op: 'setCommon', scene, id: op.id, hidden: value === true };
      }
      if (property === 'layerName') {
        return {
          op: 'setCommon',
          scene,
          id: op.id,
          name: typeof value === 'string' && value ? value : null,
        };
      }
      if (property === 'rotation' && typeof value === 'number') {
        return { op: 'setFrame', scene, id: op.id, frame: { rotation: value } };
      }
      return null;
    }
    default:
      return null;
  }
};

export const treeRoutedOps = (
  ops: readonly EditorOpV1[],
  { isTreeEdited, sceneOf, styleOps }: TreeRouteContext,
) => {
  const treeOps: Op[] = [];
  const legacyIndexes = new Set<number>();
  ops.forEach((op, index) => {
    const target =
      op.kind === 'resizeSprite'
        ? { type: 'sprite', id: op.id }
        : 'elementType' in op && 'id' in op
        ? { type: op.elementType, id: op.id }
        : null;
    const scene =
      target && isTreeEdited(target.type) ? sceneOf(target.id) : undefined;
    const treeOp = scene ? treeOpOf(op, scene) : null;
    const ops = treeOp
      ? [treeOp]
      : scene
      ? styleOps?.(op, scene) ?? null
      : null;
    if (ops) treeOps.push(...ops);
    else legacyIndexes.add(index);
  });
  return { treeOps, legacyIndexes };
};
