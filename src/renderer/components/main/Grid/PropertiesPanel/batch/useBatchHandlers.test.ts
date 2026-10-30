import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { KeyPosition } from '@src/types/key/keys';

import { useBatchHandlers } from './useBatchHandlers';

// 지금 탭 요소의 보이는 값 - 트리에서 읽는다
const tree = vi.hoisted(() => ({
  positions: new Map<string, unknown>(),
}));
vi.mock('@src/renderer/elementKinds/runtime/treeElementPosition', () => ({
  viewTreePosition: (_scene: string, id: string) => tree.positions.get(id),
}));

const IDS = {
  first: '11111111-1111-4111-8111-111111111111',
  second: '22222222-2222-4222-8222-222222222222',
  third: '33333333-3333-4333-8333-333333333333',
} as const;

const position = (id: string, dx: number, width = 10): KeyPosition =>
  ({ id, dx, dy: 0, width, height: 10 } as KeyPosition);

const createHandlers = () => {
  const onStableGeometryCommit = vi.fn();
  const onStableGeometryPreview = vi.fn();
  // 순수 계산 훅을 고정 fixture에서 직접 호출
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const handlers = useBatchHandlers({
    selectedKeyLikeElements: [
      { type: 'key', id: IDS.first },
      { type: 'key', id: IDS.second },
      { type: 'key', id: IDS.third },
    ],
    selectedKeyType: '4key',
    onStableGeometryCommit,
    onStableGeometryPreview,
  });
  return { handlers, onStableGeometryCommit, onStableGeometryPreview };
};

describe('useBatchHandlers stable geometry', () => {
  beforeEach(() => {
    tree.positions = new Map<string, unknown>([
      [IDS.second, position(IDS.second, 30)],
      [IDS.first, position(IDS.first, 0)],
      [IDS.third, position(IDS.third, 60)],
    ]);
  });

  it('현재 ID 위치로 geometry operation만 위임한다', () => {
    const { handlers, onStableGeometryCommit, onStableGeometryPreview } =
      createHandlers();

    handlers.handleBatchAlign('left');
    handlers.handleBatchDistribute('horizontal');
    handlers.handleBatchSpacingPreview(3.2);
    handlers.handleBatchSpacingCommit(3.2, {
      gestureId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    });
    handlers.handleBatchResizePreview('height', 91);
    handlers.handleBatchResize('width', 88);

    expect(onStableGeometryCommit.mock.calls).toEqual([
      [{ kind: 'align', direction: 'left' }],
      [{ kind: 'distribute', direction: 'horizontal' }],
      [
        { kind: 'spacing', spacing: 3.2 },
        { gestureId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
      ],
      [{ kind: 'resize', dimension: 'width', value: 88 }],
    ]);
    expect(onStableGeometryPreview.mock.calls).toEqual([
      [{ kind: 'spacing', spacing: 3.2 }],
      [{ kind: 'resize', dimension: 'height', value: 91 }],
    ]);
    expect(handlers.getBatchSpacingValue()).toEqual({
      isMixed: false,
      value: 20,
    });
  });

  it('sprite 대상도 기하 조작에 참여한다', () => {
    tree.positions = new Map<string, unknown>([
      [IDS.first, position(IDS.first, 0)],
      [IDS.second, { id: IDS.second, dx: 40, dy: 0, width: 20, height: 10 }],
    ]);
    const onStableGeometryCommit = vi.fn();
    const onStableGeometryPreview = vi.fn();
    const handlers = useBatchHandlers({
      selectedKeyLikeElements: [
        { type: 'key', id: IDS.first },
        { type: 'sprite', id: IDS.second },
      ],
      selectedKeyType: '4key',
      onStableGeometryCommit,
      onStableGeometryPreview,
    });

    handlers.handleBatchAlign('left');
    handlers.handleBatchSpacingPreview(5);

    expect(onStableGeometryCommit).toHaveBeenCalledWith({
      kind: 'align',
      direction: 'left',
    });
    expect(onStableGeometryPreview).toHaveBeenCalledWith({
      kind: 'spacing',
      spacing: 5,
    });
    // sprite 위치가 간격 계산에 실제로 잡힌다
    expect(handlers.getBatchSpacingValue()).toEqual({
      isMixed: false,
      value: 30,
    });
  });

  it('대상 ID를 현재 문서에서 모두 찾지 못하면 preview와 commit을 막는다', () => {
    tree.positions = new Map<string, unknown>([
      [IDS.first, position(IDS.first, 0)],
    ]);
    const { handlers, onStableGeometryCommit, onStableGeometryPreview } =
      createHandlers();

    handlers.handleBatchAlign('left');
    handlers.handleBatchResizePreview('width', 50);

    expect(onStableGeometryCommit).not.toHaveBeenCalled();
    expect(onStableGeometryPreview).not.toHaveBeenCalled();
  });
});
