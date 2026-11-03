import React, { useEffect } from 'react';

import { useLegacyPreviewFrame } from '@src/renderer/elementKinds/runtime/useLegacyPreviewFrame';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { keepOtherSelection } from '@stores/grid/keepOtherSelection';
import { openPropertiesPanelForSelection } from '@stores/grid/usePanelHostStore';
import {
  getElementDocumentStore,
  loadElementDocumentStore,
  useElementDocumentScene,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { documentElementSlots } from '@src/renderer/elementKinds/runtime/documentElementOrder';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import {
  useEditorPreviewElement,
  withGradientSession,
} from '@src/renderer/elementKinds/runtime/editorPreviewElement';
import { useGradientPreviewSession } from '@stores/grid/useGradientEditStore';
import { useEditStatePreviewActive } from '@stores/grid/useEditStatePreviewStore';
import type { SurfaceStyledElementType } from '@src/types/elementKinds';
import { useTranslation } from '@contexts/useTranslation';
import { isMac } from '@utils/core/platform';
import { elementRotationTransform } from '@utils/element/rotation';
import { removeDocumentElements } from './documentEditActions';
import {
  startDocumentSelectionDrag,
  type MixedDragLifecycle,
} from './documentSelectionDrag';
import { groupSelectionOf } from './documentGroups';
import { documentRangeSelection, toggleDocumentId } from './documentSelection';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { useDocumentFramePreviewStore } from '@stores/grid/useDocumentFramePreviewStore';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { useRenderedPluginKinds } from '@plugins/runtime/displayElement/pluginKindPresence';
import { useInPanelSelection } from './treeEditedSelection';

const EDITOR_INPUTS = {};
const EDITOR_PRESSED_INPUTS = { pressed: { value: true } };
const EMPTY_IDS: string[] = [];

interface DocumentGridElementProps {
  sceneId: string;
  eraser: boolean;
  element: ElementNode;
  zIndex: number;
  zoom: number;
  onContextMenu: (event: React.MouseEvent, element: ElementNode) => void;
  mixedDrag?: MixedDragLifecycle;
}

const DocumentGridElement = ({
  sceneId,
  eraser,
  element,
  zIndex,
  zoom,
  onContextMenu,
  mixedDrag,
}: DocumentGridElementProps) => {
  const { t } = useTranslation();
  const preview = useDocumentFramePreviewStore(
    (state) => state.frames[element.id],
  );
  const selected = useDocumentSelectionStore(
    (state) =>
      state.sceneId === sceneId && state.selectedIds.includes(element.id),
  );
  // 트리로 옮긴 옛 종류는 옛 패널 미리보기의 위치·크기·회전도 얹는다
  const legacyPreview = useLegacyPreviewFrame(element, sceneId);
  const definition = elementKindDefinition(element.kind);
  const Render = definition?.render;
  const frame = preview ?? legacyPreview ?? element.frame;
  // 편집 미리보기를 얹은 트리 값으로 그린다. 일괄 미리보기(그라데이션·눌림)는 패널이 편집하는 선택에 든 요소만
  const drawn = useEditorPreviewElement(element, sceneId);
  const inPanelSelection = useInPanelSelection(sceneId, element.id);
  const gradientSession = useGradientPreviewSession(
    element.kind as SurfaceStyledElementType,
    element.id,
    inPanelSelection,
  );
  const previewPressed = useEditStatePreviewActive(
    element.kind as SurfaceStyledElementType,
    element.id,
    inPanelSelection,
  );
  const bundles = withGradientSession(drawn.bundles ?? {}, gradientSession);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // macOS Ctrl 클릭은 보조 클릭 - 컨텍스트 메뉴에 맡긴다
    if (isMac() && event.ctrlKey) return;
    event.stopPropagation();
    // 지우개 도구 - 옛 종류 요소처럼 눌러서 지운다
    if (eraser) {
      useDocumentSelectionStore.getState().clear();
      void removeDocumentElements(sceneId, [element.id]);
      return;
    }
    const selection = useDocumentSelectionStore.getState();
    const current =
      selection.sceneId === sceneId ? selection.selectedIds : EMPTY_IDS;
    const store = getElementDocumentStore();
    // 보조키 클릭 - 넣고 빼기 (옛 종류 선택과 같은 키)
    const primaryModifier = isMac() ? event.metaKey : event.ctrlKey;
    const gridSelection = useGridSelectionStore.getState();
    // Shift 범위 선택의 기준 - 플러그인 요소와 같은 마지막으로 누른 요소 영역
    const { x, y, width, height } = element.frame;
    if (primaryModifier) {
      // 넣고 빼기 - 옛 종류 선택을 지킨다
      keepOtherSelection(() =>
        selection.setSelection(sceneId, toggleDocumentId(current, element.id)),
      );
      gridSelection.setLastSelectedKeyBounds({ x, y, width, height });
      return;
    }
    // Shift 클릭 - 마지막으로 누른 요소와 누른 요소 사이 범위 (기준이 없으면 그냥 클릭)
    const anchor = event.shiftKey ? gridSelection.lastSelectedKeyBounds : null;
    if (anchor) {
      const { treeIds, plugins } = documentRangeSelection(
        store?.getScene(sceneId),
        anchor,
        element.frame,
        usePluginDisplayElementStore.getState().elements,
        sceneId,
      );
      selection.replaceSelection(sceneId, treeIds, plugins);
      return;
    }
    gridSelection.setLastSelectedKeyBounds({ x, y, width, height });
    // 고른 요소를 누르면 선택을 지킨 채 함께 옮긴다. 그룹 안 요소는 가장 바깥 그룹째(플러그인 인스턴스 포함) 고른다
    const ids = current.includes(element.id)
      ? current
      : groupSelectionOf(store?.getScene(sceneId), element.id);
    if (ids !== current) selection.setSelection(sceneId, ids);
    startDocumentSelectionDrag({
      sceneId,
      selfId: element.id,
      ids,
      event,
      zoom,
      mixedDrag,
    });
  };

  return (
    <div
      className={
        definition?.faceOwnsClassName
          ? undefined
          : element.className ?? undefined
      }
      data-element-kind={element.kind}
      data-element-id={element.id}
      data-selected={selected ? 'true' : undefined}
      // 끌기·크기 조절·회전 미리보기 중 - 전환 효과를 끈다 (옛 요소와 같은 규칙)
      data-editing={preview ? 'true' : undefined}
      onPointerDown={handlePointerDown}
      // 더블클릭은 속성 패널을 연다 (옛 종류 요소와 같다 - 고르기는 누를 때 끝났다)
      onDoubleClick={(event) => {
        if (eraser || event.button !== 0) return;
        event.stopPropagation();
        openPropertiesPanelForSelection();
      }}
      onContextMenu={(event) => onContextMenu(event, element)}
      style={{
        position: 'absolute',
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height,
        zIndex,
        transform: elementRotationTransform(frame.rotation),
        cursor: 'move',
      }}
    >
      {Render ? (
        <Render
          element={frame !== drawn.frame ? { ...drawn, frame } : drawn}
          // 규칙표로 검사한 값 - 종류 정의의 값 타입과 같다
          values={(drawn.values ?? {}) as never}
          bundles={bundles}
          live={false}
          inputs={previewPressed ? EDITOR_PRESSED_INPUTS : EDITOR_INPUTS}
          selected={selected}
        />
      ) : (
        // 모르는 종류(플러그인을 지움 등) - 옮기기·크기·삭제만 된다
        <div className="absolute inset-0 flex items-center justify-center rounded-md border border-dashed border-fg-muted text-fg-muted text-label">
          {t('elementKinds.unknownKind')}
        </div>
      )}
    </div>
  );
};

interface DocumentGridLayerProps {
  sceneId: string;
  activeTool: string;
  // bottom: 아래에 옛 종류 요소가 없는 요소 - 옛 요소보다 먼저 그리는 자리에 둔다
  placement: 'bottom' | 'stacked';
  zoom: number;
  onElementContextMenu: (event: React.MouseEvent, element: ElementNode) => void;
  // 옛 종류 요소와 섞인 선택 끌기 - Grid의 선택 끌기 수명 주기
  mixedDrag?: MixedDragLifecycle;
}

/** 편집 화면 - 트리 문서에만 있는 종류를 미리보기 상태로 그리고 고르고 옮긴다 */
const DocumentGridLayer = ({
  sceneId,
  activeTool,
  placement,
  zoom,
  onElementContextMenu,
  mixedDrag,
}: DocumentGridLayerProps) => {
  useEffect(() => {
    void loadElementDocumentStore().catch((error) =>
      console.error('[ElementDocument] failed to load', error),
    );
  }, []);
  const scene = useElementDocumentScene(sceneId);
  const pluginRendered = useRenderedPluginKinds();
  return (
    <>
      {documentElementSlots(scene, { pluginRendered })
        .filter(({ aboveLegacy }) => aboveLegacy === (placement === 'stacked'))
        .map(({ element, zIndex }) => (
          <DocumentGridElement
            key={element.id}
            sceneId={sceneId}
            eraser={activeTool === 'eraser'}
            element={element}
            zIndex={zIndex}
            zoom={zoom}
            onContextMenu={onElementContextMenu}
            mixedDrag={mixedDrag}
          />
        ))}
    </>
  );
};

export default DocumentGridLayer;
