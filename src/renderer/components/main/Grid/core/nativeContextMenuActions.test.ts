import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeNativeContextMenuAction } from './nativeContextMenuActions';

const actionMocks = vi.hoisted(() => ({
  deleteElement: vi.fn(() => Promise.resolve()),
  commitLayer: vi.fn(() => Promise.resolve()),
  reportError: vi.fn(),
}));

vi.mock('../document/documentEditActions', () => ({
  removeDocumentElements: actionMocks.deleteElement,
  runStructureAction: actionMocks.commitLayer,
}));
vi.mock('@src/renderer/editor/runtime/intent/elementIntent', () => ({
  reportElementOpError: actionMocks.reportError,
}));

describe('executeNativeContextMenuAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('삭제는 트리에서 그 요소를 뺀다', () => {
    const handled = executeNativeContextMenuAction({
      menuItemId: 'delete',
      mode: '4key',
      elementId: 'stat-id',
      onDuplicate: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(actionMocks.deleteElement).toHaveBeenCalledWith('4key', ['stat-id']);
  });

  it('복제는 대상 id가 있을 때만 자리 고르기를 시작한다', () => {
    const onDuplicate = vi.fn();
    executeNativeContextMenuAction({
      menuItemId: 'duplicate',
      mode: '4key',
      elementId: 'graph-id',
      onDuplicate,
    });
    executeNativeContextMenuAction({
      menuItemId: 'duplicate',
      mode: '4key',
      elementId: null,
      onDuplicate,
    });

    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDuplicate).toHaveBeenCalledWith('graph-id');
  });

  it.each([
    ['bringToFront', 'front'],
    ['bringForward', 'forward'],
    ['sendBackward', 'backward'],
    ['sendToBack', 'back'],
  ] as const)('%s를 레이어 액션 %s로 변환한다', (menuItemId, action) => {
    executeNativeContextMenuAction({
      menuItemId,
      mode: '4key',
      elementId: 'key-id',
      onDuplicate: vi.fn(),
    });

    // 트리 노드 id로 트리 연산
    expect(actionMocks.commitLayer).toHaveBeenCalledWith(
      '4key',
      ['key-id'],
      action,
    );
  });

  it('지원하지 않는 메뉴 항목은 소비하지 않는다', () => {
    expect(
      executeNativeContextMenuAction({
        menuItemId: 'plugin:item',
        mode: '4key',
        elementId: 'key-id',
        onDuplicate: vi.fn(),
      }),
    ).toBe(false);
  });
});
