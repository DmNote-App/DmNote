import type { ComponentProps, ReactNode } from 'react';
import ResizeHandles from '../handles/ResizeHandles';
import GroupResizeHandles from '../handles/GroupResizeHandles';
import GradientAxisOverlay from '../handles/GradientAxisHandle';
import SpriteCanvasHandles from '../handles/SpriteCanvasHandles';
import { useDocumentSelectionStore } from '../document/useDocumentSelectionStore';
import { usePanelSelection } from '../document/treeEditedSelection';
import { useTreeFramedPositions } from '../document/useTreeFramedPositions';
import { projectSpriteResize } from '@utils/sprite/resizeProjection';
import {
  getSelectionOutlineEdges,
  GROUP_SELECTION_BORDER_WIDTH,
  GROUP_SELECTION_BORDER_COLOR,
  SELECTION_BORDER_WIDTH,
} from '../handles/selectionOutline';
import {
  calculateGroupBounds,
  getElementBounds,
  getElementRotation,
  isAspectLockedElement,
  isElementResizable,
  type Bounds,
  type ElementBounds,
} from '../handles/groupResizeUtils';
import type { ElementCollections } from '@src/types/editor';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import type { SelectedElement } from '@stores/grid/useGridSelectionStore';

type ResizeHandlesProps = ComponentProps<typeof ResizeHandles>;
type GroupResizeHandlesProps = ComponentProps<typeof GroupResizeHandles>;

interface GridSelectionOverlaysProps {
  selectedElements: SelectedElement[];
  collections: ElementCollections;
  mode: string;
  pluginElements: PluginDisplayElementInternal[];
  zoom: number;
  panX: number;
  panY: number;
  hasGradientEditSession: boolean;
  // 스프라이트 자세 편집 중 - 자세 프레임이 리사이즈 핸들을 대신한다
  hasSpritePoseSession: boolean;
  previewBounds: Bounds | null;
  previewGroupBounds: Bounds | null;
  previewElementBounds: readonly ElementBounds[] | null;
  onResizeStart: NonNullable<ResizeHandlesProps['onResizeStart']>;
  onResize: NonNullable<ResizeHandlesProps['onResize']>;
  onResizeEnd: NonNullable<ResizeHandlesProps['onResizeEnd']>;
  onGroupResize: NonNullable<GroupResizeHandlesProps['onGroupResize']>;
  onGroupResizeEnd: NonNullable<GroupResizeHandlesProps['onGroupResizeEnd']>;
  getOtherElements: NonNullable<ResizeHandlesProps['getOtherElements']>;
}

const GridSelectionOverlays = ({
  selectedElements,
  collections,
  mode,
  pluginElements,
  zoom,
  panX,
  panY,
  hasGradientEditSession,
  hasSpritePoseSession,
  previewBounds,
  previewGroupBounds,
  previewElementBounds,
  onResizeStart,
  onResize,
  onResizeEnd,
  onGroupResize,
  onGroupResizeEnd,
  getOtherElements,
}: GridSelectionOverlaysProps) => {
  // 일괄 그라데이션 축은 패널이 편집하는 선택(트리로 옮긴 옛 종류 포함)을 감싼다
  const panelSelection = usePanelSelection(mode);
  // 기준점·자세 손잡이 - 트리에서 그리는 스프라이트는 트리 틀(끌기·크기 미리보기 포함)을 따른다
  const framedSprites = useTreeFramedPositions(
    'sprite',
    collections.spritePositions[mode] ?? [],
    mode,
  );
  // 크기가 달라졌으면 이동값도 같은 비율로 (얼굴·커밋과 같은 projection)
  const spriteHandlePositions = {
    ...collections.spritePositions,
    [mode]: framedSprites.map((framed, index) => {
      const source = collections.spritePositions[mode]?.[index];
      return source && framed !== source
        ? {
            ...framed,
            ...projectSpriteResize(source, {
              dx: framed.dx,
              dy: framed.dy,
              width: framed.width,
              height: framed.height,
            }),
            rotation: framed.rotation,
            hidden: framed.hidden,
          }
        : framed;
    }),
  };
  // 트리 요소와 섞인 선택 - 묶음 손잡이가 한쪽만 돌리거나 늘리지 않게 손잡이를 닫는다 (윤곽은 그대로)
  const mixedWithDocument = useDocumentSelectionStore(
    (state) => state.selectedIds.length > 0,
  );
  // 회전 섞인 여러 선택은 개별 윤곽만 표시하고 그룹 리사이즈는 닫는다
  const rotatedWithoutFrame =
    selectedElements.length > 1 &&
    selectedElements.some(
      (element) => getElementRotation(element, collections, mode) !== 0,
    );
  const isMultiSelection = selectedElements.length > 1;
  const groupData =
    isMultiSelection && !rotatedWithoutFrame
      ? calculateGroupBounds(
          selectedElements,
          collections,
          mode,
          pluginElements,
        )
      : null;
  // 그룹 핸들이 실제로 그리는 프레임과 같은 좌표·회전·프리뷰 사용
  const groupOutlineFrame = groupData
    ? {
        bounds: previewGroupBounds ?? groupData,
        rotation: 0,
      }
    : null;
  const previewByElement = new Map(
    previewElementBounds?.map(({ element, bounds }) => [
      `${element.type}:${element.id}`,
      bounds,
    ]),
  );
  const selectionOutlines: ReactNode[] = [];
  if (!hasGradientEditSession) {
    selectedElements.forEach((element) => {
      const bounds = getElementBounds(
        element,
        collections,
        mode,
        pluginElements,
      );
      if (!bounds) return;
      const displayBounds = isMultiSelection
        ? previewByElement.get(`${element.type}:${element.id}`) ?? bounds
        : previewBounds ?? bounds;
      const borderWidth = isMultiSelection
        ? GROUP_SELECTION_BORDER_WIDTH
        : SELECTION_BORDER_WIDTH;
      const rotation = getElementRotation(element, collections, mode);
      const edges = getSelectionOutlineEdges(
        displayBounds,
        rotation,
        groupOutlineFrame,
      );
      const nonResizable =
        isMultiSelection && !isElementResizable(element, pluginElements);
      const color = nonResizable
        ? 'var(--ui-warning)'
        : isMultiSelection
        ? GROUP_SELECTION_BORDER_COLOR
        : 'var(--ui-selection-border)';
      selectionOutlines.push(
        <div
          key={`${element.type}:${element.id}`}
          data-grid-selection-outline=""
          data-grid-selection-element-id={element.id}
          data-grid-selection-element-type={element.type}
          style={{
            position: 'absolute',
            left: displayBounds.x * zoom + panX - SELECTION_BORDER_WIDTH,
            top: displayBounds.y * zoom + panY - SELECTION_BORDER_WIDTH,
            width: displayBounds.width * zoom + SELECTION_BORDER_WIDTH * 2,
            height: displayBounds.height * zoom + SELECTION_BORDER_WIDTH * 2,
            boxSizing: 'border-box',
            ...(rotation !== 0 ? { transform: `rotate(${rotation}deg)` } : {}),
            borderWidth,
            borderStyle: nonResizable ? 'dashed' : 'solid',
            borderTopColor: edges.top ? color : 'transparent',
            borderRightColor: edges.right ? color : 'transparent',
            borderBottomColor: edges.bottom ? color : 'transparent',
            borderLeftColor: edges.left ? color : 'transparent',
            borderRadius: isMultiSelection ? 0 : '4px',
            pointerEvents: 'none',
            zIndex: 'var(--z-canvas-selection-outline)',
          }}
        />,
      );
    });
  }

  const singleElement =
    selectedElements.length === 1 ? selectedElements[0] : null;
  const singleBounds = singleElement
    ? getElementBounds(singleElement, collections, mode, pluginElements)
    : null;
  const singleRotation = singleElement
    ? getElementRotation(singleElement, collections, mode)
    : 0;
  // 자세 편집 중에는 자세 프레임이 핸들을 맡는다 - 상자 핸들과 겹치지 않게
  const showSingleResizeHandles = Boolean(
    singleElement &&
      singleBounds &&
      !mixedWithDocument &&
      !hasGradientEditSession &&
      !hasSpritePoseSession &&
      isElementResizable(singleElement, pluginElements),
  );

  return (
    <>
      {selectionOutlines}
      {showSingleResizeHandles && singleElement && singleBounds && (
        <ResizeHandles
          bounds={singleBounds}
          previewBounds={previewBounds}
          zoom={zoom}
          panX={panX}
          panY={panY}
          onResizeStart={onResizeStart}
          onResize={onResize}
          onResizeEnd={onResizeEnd}
          elementId={singleElement.id}
          getOtherElements={getOtherElements}
          // 스프라이트는 그림 레이어라 늘리지 않는다
          lockAspect={isAspectLockedElement(singleElement)}
          rotation={singleRotation}
        />
      )}
      {selectedElements.length > 1 &&
        !mixedWithDocument &&
        !hasGradientEditSession &&
        !rotatedWithoutFrame && (
          <GroupResizeHandles
            selectedElements={selectedElements}
            collections={collections}
            selectedKeyType={mode}
            pluginElements={pluginElements}
            zoom={zoom}
            panX={panX}
            panY={panY}
            previewGroupBounds={previewGroupBounds}
            onGroupResizeStart={onResizeStart}
            onGroupResize={onGroupResize}
            onGroupResizeEnd={onGroupResizeEnd}
            getOtherElements={getOtherElements}
          />
        )}
      <GradientAxisOverlay
        collections={collections}
        selectedElements={panelSelection}
        selectedKeyType={mode}
        zoom={zoom}
        panX={panX}
        panY={panY}
      />
      {/* 온캔버스 스프라이트 핸들 - 선택 중엔 기준점, 자세 편집 중엔 자세 프레임 */}
      <SpriteCanvasHandles
        spritePositions={spriteHandlePositions}
        selectedElements={panelSelection}
        selectedKeyType={mode}
        zoom={zoom}
        panX={panX}
        panY={panY}
      />
    </>
  );
};

export default GridSelectionOverlays;
