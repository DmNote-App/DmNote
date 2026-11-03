'use no memo';
// 편집 미리보기(모듈 상태)를 렌더 중에 읽어서 컴파일러 메모 제외
import React, { Fragment, useRef, useState, useSyncExternalStore } from 'react';

import { useElementDocumentScene } from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  sceneElements,
  type ElementNode,
} from '@src/renderer/editor/document/documentPatch';
import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import {
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import type {
  ElementKindDefinition,
  PanelRowDecl,
} from '@src/renderer/elementKinds/defineElementKind';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import { treeElementPositionOf } from '@src/renderer/elementKinds/runtime/treeElementPosition';
import type { Op, Scene } from '@src/types/generated/elementDocument';
import type { KeyPosition } from '@src/types/key/keys';
import { useSettingsStore } from '@stores/useSettingsStore';
import { AXIS_FIELD_WIDTH } from '@utils/cardRecipes';
import { documentBatchGeometry } from '../../document/documentBatchGeometry';
import { editDocument } from '../../document/documentEditActions';
import {
  documentGroupNames,
  wholeGroupOf,
} from '../../document/documentGroups';
import { aggregateMixedValue } from '../batch/mixedValue';
import BatchPanelHeader from '../batch/BatchPanelHeader';
import BatchGeometrySection from '../batch/geometry/BatchGeometrySection';
import SelectionRotationInput from '../batch/geometry/SelectionRotationInput';
import {
  NumberInput,
  PropertyRow,
  PropertySection,
} from '../controls/PropertyInputs';
import { PANEL_ROOT_CLASS } from '../navigation/panelChrome';
import EditSessionBoundary from '../selection/EditSessionBoundary';
import {
  defaultPanel,
  rowState,
  visibleRows,
  type Translate,
  type Values,
} from './documentPanelModel';
import {
  FieldRow,
  PanelSections,
  SurfaceRows,
  type PanelSectionRenderers,
} from './documentPanelRows';
import { batchPanelWriterFor, type PanelWriter } from './documentPanelWriter';
import {
  LegacyBatchCustomCssSection,
  LegacyBatchStyle,
  type LegacyBatchItem,
} from './legacyBundleRows';

type AlignDirection =
  | 'left'
  | 'centerH'
  | 'right'
  | 'top'
  | 'centerV'
  | 'bottom';

// 옛 일괄 패널의 정렬·분배·간격·크기 처리기 - 옛 종류 선택은 플러그인 요소와 함께 이것으로 쓴다
export interface LegacyBatchGeometry {
  handleBatchAlign: (direction: AlignDirection) => void;
  handleBatchDistribute: (direction: 'horizontal' | 'vertical') => void;
  handleBatchSpacing: (
    spacing: number,
    options?: { gestureId?: string },
  ) => void;
  handleBatchSpacingCommit: (
    spacing: number,
    options?: { gestureId?: string },
  ) => void;
  getBatchSpacingValue: () => { isMixed: boolean; value: number };
  handleBatchResize: (dimension: 'width' | 'height', value: number) => void;
  handleBatchResizePreview: (
    dimension: 'width' | 'height',
    value: number,
  ) => void;
}

// 옛 종류 선택 - 속성 패널이 옛 선택 모양(플러그인 요소 포함)에서 만든 개수·그룹·일괄 기하
export interface LegacyBatchHost {
  totalCount: number;
  groupInfo: { id: string; name: string; memberCount: number } | null;
  geometry: LegacyBatchGeometry;
}

interface DocumentBatchPanelProps {
  sceneId: string;
  elementIds: readonly string[];
  panelElement: HTMLElement | null;
  setPanelElement: (element: HTMLDivElement | null) => void;
  // 패널 스크롤 (Lenis) - 선택이 바뀌어도 같은 뷰포트를 쓴다
  scrollRef?: (node: HTMLDivElement | null) => void;
  legacyHost?: LegacyBatchHost;
  t: Translate;
}

interface PanelElements {
  scene: Scene | undefined;
  elements: ElementNode[];
  // 옛 종류만 고른 선택의 옛 일괄 처리기 (아니면 없음 - 트리 연산)
  writer: PanelWriter | null;
  // 칸 값 - 옛 종류는 옛 패널이 보던 옛 칸 모양 보기(트리 값 + 편집 미리보기), 트리에만 있는 종류는 고유 값
  items: Values[];
}

// 고른 요소들 - 편집 미리보기가 바뀌면 다시 읽는다
const usePanelElements = (
  sceneId: string,
  elementIds: readonly string[],
): PanelElements => {
  const scene = useElementDocumentScene(sceneId);
  useSyncExternalStore(
    subscribePreviewOverlay,
    getPreviewOverlayVersion,
    getPreviewOverlayVersion,
  );
  const all = scene ? sceneElements(scene) : [];
  const elements = elementIds.flatMap((id) => {
    const element = all.find((node) => node.id === id);
    return element ? [element] : [];
  });
  const writer = batchPanelWriterFor(sceneId, elements);
  return {
    scene,
    elements,
    writer,
    items: elements.map(
      (element) =>
        (writer
          ? treeElementPositionOf(element, sceneId)
          : element.values ?? {}) as Values,
    ),
  };
};

interface BatchRowContext {
  sceneId: string;
  elements: readonly ElementNode[];
  items: readonly Values[];
  definition: ElementKindDefinition | undefined;
  writer: PanelWriter | null;
  panelElement: HTMLElement | null;
  t: Translate;
}

// 고유 값 칸 하나 (섞인 값) - 옛 종류는 옛 일괄 처리기, 트리에만 있는 종류는 트리 연산
const batchRowRenderer =
  ({
    sceneId,
    elements,
    items,
    definition,
    writer,
    panelElement,
    t,
  }: BatchRowContext) =>
  (row: PanelRowDecl<Values>) => {
    const commitValues = (next: Values) => {
      void Promise.all(
        elements.map(async (element) => {
          const merged = { ...(element.values ?? {}), ...next };
          const frame = await definition?.adjustFrame?.(
            merged as never,
            element.frame,
          );
          const ops: Op[] = [
            { op: 'setValues', scene: sceneId, id: element.id, values: next },
          ];
          if (frame) {
            ops.push({ op: 'setFrame', scene: sceneId, id: element.id, frame });
          }
          return ops;
        }),
      ).then((ops) => editDocument(ops.flat()));
    };
    return (
      <FieldRow
        row={row}
        state={rowState(definition, row, items)}
        batch
        onCommit={(value, options) =>
          writer
            ? writer.commitField(row.field, value, options)
            : commitValues({ [row.field]: value })
        }
        onPreview={
          writer ? (value) => writer.previewField(row.field, value) : undefined
        }
        onCancelPreview={writer?.cancelPreview}
        colorId={`${elements[0]?.kind}-${row.field}-batch-${sceneId}`}
        elementIds={elements.map(({ id }) => id)}
        panelElement={panelElement}
        t={t}
      />
    );
  };

interface KindBatchRowsProps {
  sceneId: string;
  // 같은 종류 요소들
  elementIds: readonly string[];
  panelElement: HTMLElement | null;
  t: Translate;
}

/** 한 종류의 선언 칸 - 여러 종류가 섞인 옛 일괄 패널 안에서 그 종류 요소만 고친다 (섹션 상자는 부르는 쪽) */
export const KindBatchRows = ({
  sceneId,
  elementIds,
  panelElement,
  t,
}: KindBatchRowsProps) => {
  const { elements, writer, items } = usePanelElements(sceneId, elementIds);
  if (elements.length === 0) return null;
  const definition = elementKindDefinition(elements[0].kind);
  const render = batchRowRenderer({
    sceneId,
    elements,
    items,
    definition,
    writer,
    panelElement,
    t,
  });
  return (definition?.panel ?? []).flatMap((section) =>
    'rows' in section
      ? visibleRows(section.rows, items, true).map((row) => (
          <Fragment key={row.field}>{render(row)}</Fragment>
        ))
      : [],
  );
};

/** 트리 요소 여러 개 - 단일 패널과 같은 선언에서 섞인 값과 함께 그린다 */
const DocumentBatchPanel = ({
  sceneId,
  elementIds,
  panelElement,
  setPanelElement,
  scrollRef,
  legacyHost,
  t,
}: DocumentBatchPanelProps) => {
  const { scene, elements, writer, items } = usePanelElements(
    sceneId,
    elementIds,
  );
  const useCustomCSS = useSettingsStore((state) => state.useCustomCSS);
  // 이름 바꾸기는 그 선택에서만 - 선택이 바뀌면 끝난다
  const selectionKey = `${sceneId}:${[...elementIds].sort().join(',')}`;
  const [renamingFor, setRenamingFor] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameCancelledRef = useRef(false);
  if (elements.length === 0) return null;

  const groupInfo = legacyHost
    ? legacyHost.groupInfo
    : wholeGroupOf(scene, elementIds);
  const isRenaming = groupInfo !== null && renamingFor === selectionKey;
  const totalCount = legacyHost?.totalCount ?? elements.length;

  // 모두 같은 종류면 그 종류의 선언 칸을 섞인 값과 함께 보인다
  const kinds = new Set(elements.map((node) => node.kind));
  const definition =
    kinds.size === 1 ? elementKindDefinition(elements[0].kind) : undefined;
  const usesSurface = elements.every((element) =>
    elementKindDefinition(element.kind)?.bundles?.includes('surface'),
  );
  // 옛 종류의 겉모습 칸 - 종류와 옛 패널이 보던 값
  const legacyItems: LegacyBatchItem[] = elements.map((element, index) => ({
    kind: element.kind,
    position: items[index] as unknown as KeyPosition,
  }));

  // 정렬·분배·간격·크기 - 옛 종류는 옛 일괄 처리기, 트리에만 있는 종류는 트리 틀 연산
  const treeGeometry = documentBatchGeometry(sceneId, elements);
  const geometry: LegacyBatchGeometry = legacyHost?.geometry ?? {
    handleBatchAlign: (direction) =>
      treeGeometry.commit({ kind: 'align', direction }),
    handleBatchDistribute: (direction) =>
      treeGeometry.commit({ kind: 'distribute', direction }),
    handleBatchSpacing: (spacing) =>
      treeGeometry.commit({ kind: 'spacing', spacing }),
    handleBatchSpacingCommit: (spacing) =>
      treeGeometry.commit({ kind: 'spacing', spacing }),
    getBatchSpacingValue: treeGeometry.spacingValue,
    handleBatchResize: (dimension, value) => {
      treeGeometry.clearPreview();
      treeGeometry.commit({ kind: 'resize', dimension, value });
    },
    handleBatchResizePreview: (dimension, value) =>
      treeGeometry.preview({ kind: 'resize', dimension, value }),
  };
  const cancelResizePreview = legacyHost
    ? () => editGestureController.cancel()
    : treeGeometry.clearPreview;
  // 크기 표시 - 옛 종류는 옛 패널이 보던 값(편집 미리보기 포함)
  const size = (dimension: 'width' | 'height') =>
    writer
      ? aggregateMixedValue(items, (item) => item[dimension] as number, 60)
      : aggregateMixedValue(elements, (node) => node.frame[dimension], 60);

  const renderers: PanelSectionRenderers = {
    geometry: () => (
      <PropertySection>
        <BatchGeometrySection
          totalCount={totalCount}
          handleBatchAlign={geometry.handleBatchAlign}
          handleBatchDistribute={geometry.handleBatchDistribute}
          handleBatchSpacing={geometry.handleBatchSpacing}
          handleBatchSpacingCommit={geometry.handleBatchSpacingCommit}
          batchSpacing={geometry.getBatchSpacingValue()}
          t={t}
        />
        <PropertyRow label={t('propertiesPanel.size') || '크기'}>
          {(['width', 'height'] as const).map((dimension) => {
            const state = size(dimension);
            return (
              <NumberInput
                key={dimension}
                value={state.value}
                onChange={(value) =>
                  geometry.handleBatchResize(dimension, value)
                }
                onPreview={(value) =>
                  geometry.handleBatchResizePreview(dimension, value)
                }
                onCancel={cancelResizePreview}
                prefix={dimension === 'width' ? 'W' : 'H'}
                width={AXIS_FIELD_WIDTH}
                min={10}
                max={9999}
                allowDecimal
                decimalScale={1}
                isMixed={state.isMixed}
              />
            );
          })}
        </PropertyRow>
        <SelectionRotationInput
          label={t('propertiesPanel.rotation') || '회전'}
        />
      </PropertySection>
    ),
    customCss: () =>
      useCustomCSS && writer ? (
        <LegacyBatchCustomCssSection
          items={legacyItems}
          writer={writer}
          t={t}
        />
      ) : null,
    bundles: (bundles) => {
      if (writer) {
        return (
          <LegacyBatchStyle
            items={legacyItems}
            writer={writer}
            selectionKey={selectionKey}
            panelElement={panelElement}
            t={t}
          />
        );
      }
      return bundles.includes('surface') && usesSurface ? (
        <PropertySection>
          <SurfaceRows
            surfaces={elements.map(
              (element) => (element.bundles?.surface ?? {}) as Values,
            )}
            panelElement={panelElement}
            t={t}
            onCommit={(fields) =>
              void editDocument(
                elements.map((element) => ({
                  op: 'setBundle' as const,
                  scene: sceneId,
                  id: element.id,
                  bundle: 'surface',
                  fields,
                })),
              )
            }
          />
        </PropertySection>
      ) : null;
    },
    row: batchRowRenderer({
      sceneId,
      elements,
      items,
      definition,
      writer,
      panelElement,
      t,
    }),
  };

  return (
    <div ref={setPanelElement} className={PANEL_ROOT_CLASS}>
      <div className="flex-shrink-0">
        <BatchPanelHeader
          totalCount={totalCount}
          selectedGroupInfo={groupInfo}
          isRenaming={isRenaming}
          renameInputRef={renameInputRef}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          renameCancelledRef={renameCancelledRef}
          handleRenameStart={() => {
            if (!groupInfo) return;
            // Escape로 언마운트된 입력은 blur가 오지 않아 취소 플래그가 남는다
            renameCancelledRef.current = false;
            setRenameValue(groupInfo.name);
            setRenamingFor(selectionKey);
            requestAnimationFrame(() => {
              renameInputRef.current?.focus();
              renameInputRef.current?.select();
            });
          }}
          handleRenameCommit={(value) => {
            setRenamingFor(null);
            const trimmed = value.trim();
            if (!groupInfo || trimmed === '') return;
            // 그룹 이름은 트리 그룹 정보 - 지금 이름과 같으면 쓰지 않는다
            const current = documentGroupNames(scene).find(
              (group) => group.id === groupInfo.id,
            );
            if (!current || current.name === trimmed) return;
            void editDocument([
              {
                op: 'setGroup',
                scene: sceneId,
                id: groupInfo.id,
                name: trimmed,
              },
            ]);
          }}
          handleRenameCancel={() => {
            renameCancelledRef.current = true;
            setRenamingFor(null);
          }}
          t={t}
        />
      </div>
      <div className="flex-1 properties-panel-overlay-scroll">
        <div ref={scrollRef} className="properties-panel-overlay-viewport">
          <EditSessionBoundary>
            <PanelSections
              sections={
                definition
                  ? definition.panel ?? defaultPanel(definition)
                  : [{ common: 'geometry' }]
              }
              items={items}
              batch
              renderers={renderers}
            />
          </EditSessionBoundary>
        </div>
      </div>
    </div>
  );
};

export default DocumentBatchPanel;
