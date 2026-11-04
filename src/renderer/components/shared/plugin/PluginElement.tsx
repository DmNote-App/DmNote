import React, {
  type CSSProperties,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
  type Ref,
} from 'react';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import {
  buildPluginElementStyle,
  buildPluginOverlayHitStyle,
} from '@utils/plugin/layout/pluginElementLayout';
import { usePluginElementPosition } from './usePluginElementPosition';
import { usePluginElementView } from './usePluginElementView';

// 그리기 - 편집 화면(EditablePluginElement)과 오버레이·OBS(PluginElement)가 같이 쓴다.
// 끌기·선택·메뉴 같은 편집 코드는 오버레이 번들에 들지 않게 EditablePluginElement에만 둔다

const DEFAULT_POSITION_OFFSET = { x: 0, y: 0 };

interface PluginElementFrameProps {
  element: PluginDisplayElementInternal;
  windowType: 'main' | 'overlay';
  style: CSSProperties;
  attachRef: Ref<HTMLDivElement>;
  content: ReactNode;
  // 끌기·크기 조절 미리보기 중 - 전환 효과를 끈다 (트리 미리보기 포함)
  editing?: boolean;
  onPointerDownCapture?: PointerEventHandler<HTMLDivElement>;
  onClick?: MouseEventHandler<HTMLDivElement>;
  onDoubleClick?: MouseEventHandler<HTMLDivElement>;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onContextMenu: MouseEventHandler<HTMLDivElement>;
  contextMenu?: ReactNode;
}

/** 요소 상자 - 오버레이는 창의 클릭 영역을 재는 히트 상자를 함께 둔다 */
export const PluginElementFrame = ({
  element,
  windowType,
  style,
  attachRef,
  content,
  editing = false,
  onPointerDownCapture,
  onClick,
  onDoubleClick,
  onPointerDown,
  onContextMenu,
  contextMenu,
}: PluginElementFrameProps) => {
  const overlayHitStyle = buildPluginOverlayHitStyle(
    element,
    style,
    windowType,
  );
  return (
    <>
      {overlayHitStyle ? (
        <div
          aria-hidden="true"
          style={overlayHitStyle}
          data-overlay-hit="true"
          data-plugin-hit-box={element.fullId}
        />
      ) : null}
      <div
        ref={attachRef}
        id={element.id}
        className={`${windowType === 'main' ? 'dmn-grabbable' : ''} ${
          element.className || ''
        }`}
        style={style}
        data-plugin-element={element.fullId}
        data-plugin-id={element.pluginId}
        data-editing={editing ? 'true' : undefined}
        onPointerDownCapture={onPointerDownCapture}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onContextMenu={onContextMenu}
      >
        {content}
      </div>

      {contextMenu}
    </>
  );
};

export interface PluginElementProps {
  element: PluginDisplayElementInternal;
  windowType: 'main' | 'overlay';
  positionOffset?: { x: number; y: number };
  zoom?: number;
  // 트리 순번 - 트리에 없으면 자기 zIndex, 그것도 없으면 fallbackZIndex(맨 위)
  stackZIndex?: number;
  fallbackZIndex?: number;
}

const preventContextMenu: MouseEventHandler<HTMLDivElement> = (event) =>
  event.preventDefault();

/** 그리기만 하는 플러그인 요소 - 오버레이·OBS (편집 화면은 EditablePluginElement) */
const PluginElementImpl = ({
  element,
  windowType,
  positionOffset = DEFAULT_POSITION_OFFSET,
  zoom = 1,
  stackZIndex,
  fallbackZIndex = 0,
}: PluginElementProps) => {
  const { containerRef, definition, content } = usePluginElementView({
    element,
    windowType,
    zoom,
  });
  const position = usePluginElementPosition(element, positionOffset);
  const style = buildPluginElementStyle({
    element,
    windowType,
    renderX: position.x,
    renderY: position.y,
    stackZIndex: stackZIndex ?? element.zIndex ?? fallbackZIndex,
    resizable: definition?.resizable === true,
  });
  return (
    <PluginElementFrame
      element={element}
      windowType={windowType}
      style={style}
      attachRef={containerRef}
      content={content}
      onContextMenu={preventContextMenu}
    />
  );
};

// 요소 하나의 갱신이 나머지 전체 리렌더로 번지지 않도록 차단
// (스토어 update 경로는 미변경 요소의 참조를 유지하므로 shallow 비교로 스킵됨)
export const PluginElement = React.memo(PluginElementImpl);
