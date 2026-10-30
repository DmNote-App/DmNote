// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CanonicalGraphItemPosition,
  CanonicalKeyPosition,
  CanonicalKnobItemPosition,
  CanonicalReactiveSpritePosition,
  CanonicalStatItemPosition,
} from '@src/types/editor';
import NativeGridElements from './NativeGridElements';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// 키를 옛 종류로 둘지 - 키 배선 테스트는 옛 경로를 쓴다
const keyKind = vi.hoisted(() => ({ legacy: true }));
vi.mock('@src/types/elementKinds', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@src/types/elementKinds')
  >();
  return {
    ...actual,
    isLegacyEditedType: (
      type: Parameters<typeof actual.isLegacyEditedType>[0],
    ) => (type === 'key' ? keyKind.legacy : actual.isLegacyEditedType(type)),
  };
});

const operationMocks = vi.hoisted(() => ({
  commitPosition: vi.fn(),
  deleteElement: vi.fn(() => Promise.resolve()),
}));

vi.mock('@hooks/Grid/elementPositionCommit', () => ({
  commitElementPosition: operationMocks.commitPosition,
}));
vi.mock('@src/renderer/editor/runtime/operations/elementOps', () => ({
  deleteElementById: operationMocks.deleteElement,
}));
vi.mock('@src/renderer/editor/runtime/intent/elementIntent', () => ({
  reportElementOpError: vi.fn(),
}));
vi.mock('@hooks/shared/useStableHandlerSlots', () => ({
  useStableHandlerSlots:
    () =>
    <Handlers,>(_id: string, handlers: Handlers): Handlers =>
      handlers,
}));

async function createElementRenderer(kind: string) {
  const { createElement } = await import('react');
  return {
    default: (props: Record<string, unknown>) => {
      const call = (name: string, ...args: unknown[]) =>
        (props[name] as ((...values: unknown[]) => void) | undefined)?.(
          ...args,
        );
      return createElement(
        'button',
        {
          ref: props.setReferenceRef as (node: HTMLElement | null) => void,
          'data-native-kind': kind,
          'data-element-id': props.elementId,
          'data-key-name': props.keyName,
          'data-selected': String(props.isSelected),
          onClick: (event: React.MouseEvent) => {
            if (event.shiftKey) call('onShiftClick', event);
            else if (event.ctrlKey) call('onCtrlClick', event);
            else call('onClick', event);
          },
          onDoubleClick: (event: React.MouseEvent) =>
            call('onDoubleClick', event),
          onContextMenu: (event: React.MouseEvent) =>
            call('onContextMenu', event),
          onMouseDown: () =>
            call('onPositionChange', props.index, 12, 34, props.elementId),
          onMouseUp: (event: React.MouseEvent) => {
            if (event.button === 1) call('onEraserClick');
          },
        },
        String(props.keyName ?? kind),
      );
    },
  };
}

vi.mock('@components/shared/key/Key', () => createElementRenderer('key-like'));
vi.mock('../layers/GraphItem', () => createElementRenderer('graph'));
vi.mock('../layers/KnobItem', () => createElementRenderer('knob'));
vi.mock('../layers/SpriteItem', () => createElementRenderer('sprite'));

const keyPosition = (
  id: string,
  dx: number,
  patch: Partial<CanonicalKeyPosition> = {},
): CanonicalKeyPosition =>
  ({ id, dx, dy: 0, width: 60, height: 60, ...patch } as CanonicalKeyPosition);

const KEY_ID = '00000000-0000-4000-8000-000000000101';
const STAT_ID = '00000000-0000-4000-8000-000000000102';
const GRAPH_ID = '00000000-0000-4000-8000-000000000103';
const KNOB_ID = '00000000-0000-4000-8000-000000000104';
const SPRITE_ID = '00000000-0000-4000-8000-000000000105';

describe('NativeGridElements', () => {
  let host: HTMLDivElement;
  let root: Root;
  const callbacks = {
    select: vi.fn(),
    toggle: vi.fn(),
    clear: vi.fn(),
    setSelected: vi.fn(),
    setLastBounds: vi.fn(),
    move: vi.fn(),
    dragStart: vi.fn(),
    dragEnd: vi.fn(),
    openEditor: vi.fn(),
    openContext: vi.fn(),
  };

  const renderScene = (
    lastSelectedKeyBounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null = null,
  ) => {
    act(() => {
      root.render(
        <NativeGridElements
          mode="4key"
          modeArrays={{
            keyPositions: [keyPosition(KEY_ID, 100)],
            statPositions: [
              {
                ...keyPosition(STAT_ID, 20),
                statType: 'total',
              } as CanonicalStatItemPosition,
            ],
            graphPositions: [
              {
                ...keyPosition(GRAPH_ID, 40),
                statType: 'kpsMax',
                graphType: 'line',
                graphSpeed: 1,
                graphColor: '#fff',
              } as CanonicalGraphItemPosition,
            ],
            knobPositions: [
              {
                ...keyPosition(KNOB_ID, 60),
                axisId: 'axis',
                sensitivity: 1,
                reverse: false,
              } as CanonicalKnobItemPosition,
            ],
            spritePositions: [
              {
                ...keyPosition(SPRITE_ID, 80),
                poses: [],
              } as unknown as CanonicalReactiveSpritePosition,
            ],
          }}
          keyMappings={['KeyA']}
          pluginElements={[]}
          selectedElements={[{ type: 'key', id: KEY_ID, index: 0 }]}
          activeTool="select"
          zoom={1}
          panX={0}
          panY={0}
          isViewportTransforming={false}
          keyCounterEnabled={true}
          lastSelectedKeyBounds={lastSelectedKeyBounds}
          onSelectElement={callbacks.select}
          onToggleElement={callbacks.toggle}
          onClearSelection={callbacks.clear}
          onSetSelectedElements={callbacks.setSelected}
          onSetLastSelectedKeyBounds={callbacks.setLastBounds}
          onMoveSelection={callbacks.move}
          onMultiDragStart={callbacks.dragStart}
          onMultiDragEnd={callbacks.dragEnd}
          onOpenElementEditor={callbacks.openEditor}
          onOpenElementContextMenu={callbacks.openContext}
        />,
      );
    });
  };

  const dispatchMouse = (
    node: Element,
    type: string,
    init: MouseEventInit = {},
  ) => {
    act(() => {
      node.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          ...init,
        }),
      );
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    keyKind.legacy = true;
  });

  it('트리로 옮긴 키는 그리지 않는다 (트리 레이어가 그린다)', () => {
    keyKind.legacy = false;
    renderScene();

    expect(host.querySelectorAll('[data-native-kind]')).toHaveLength(0);
  });

  it('키만 그리고 트리로 옮긴 스탯·그래프·노브·스프라이트는 그리지 않는다', () => {
    renderScene();

    const elements = [...host.querySelectorAll('[data-native-kind]')];
    expect(elements.map((element) => element.textContent)).toEqual(['KeyA']);
    expect(
      elements.map((element) => element.getAttribute('data-selected')),
    ).toEqual(['true']);
  });

  it('키 선택·위치 커밋·지우개·컨텍스트 메뉴를 공통 핸들러로 라우팅한다', () => {
    renderScene();
    const key = host.querySelector(`[data-element-id="${KEY_ID}"]`)!;
    dispatchMouse(key, 'click');
    expect(callbacks.select).toHaveBeenCalledWith('key', 0);
    expect(callbacks.setLastBounds).toHaveBeenCalledWith({
      x: 100,
      y: 0,
      width: 60,
      height: 60,
    });

    dispatchMouse(key, 'mousedown');
    expect(operationMocks.commitPosition).toHaveBeenCalledWith(
      'key',
      KEY_ID,
      12,
      34,
    );

    dispatchMouse(key, 'contextmenu', { clientX: 7, clientY: 9 });
    expect(callbacks.openContext).toHaveBeenCalledWith('key', 0, 7, 9, key);

    dispatchMouse(key, 'mouseup', { button: 1 });
    expect(operationMocks.deleteElement).toHaveBeenCalledWith('key', KEY_ID);
  });

  it('기존 키 앵커가 있으면 좌표 범위 수집 결과를 한 번에 적용한다', () => {
    renderScene({ x: 0, y: 0, width: 60, height: 60 });
    const key = host.querySelector(`[data-element-id="${KEY_ID}"]`)!;

    dispatchMouse(key, 'click', { shiftKey: true });

    expect(callbacks.clear).not.toHaveBeenCalled();
    expect(callbacks.setSelected).toHaveBeenCalledTimes(1);
    expect(
      callbacks.setSelected.mock.calls[0][0].map(
        (element: { type: string; id: string }) =>
          `${element.type}:${element.id}`,
      ),
    ).toEqual([
      `key:${KEY_ID}`,
      `stat:${STAT_ID}`,
      `graph:${GRAPH_ID}`,
      // 트리로 옮긴 종류도 범위에 든다 - 선택 스토어가 트리 선택으로 보낸다
      `knob:${KNOB_ID}`,
      `sprite:${SPRITE_ID}`,
    ]);
  });
});
