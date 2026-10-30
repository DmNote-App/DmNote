import React, { useRef } from 'react';

import { useElementDocumentScene } from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  sceneElements,
  type ElementNode,
} from '@src/renderer/editor/document/documentPatch';
import type { BatchGeometryOperation } from '@src/renderer/editor/runtime/geometry/batchGeometryPlan';
import { documentBatchGeometry } from '../../document/documentBatchGeometry';
import type { PanelSectionDecl } from '@src/renderer/elementKinds/defineElementKind';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import type { Op } from '@src/types/generated/elementDocument';
import { AXIS_FIELD_WIDTH } from '@utils/cardRecipes';
import { editDocument } from '../../document/documentEditActions';
import { aggregateMixedValue } from '../batch/mixedValue';
import BatchPanelHeader from '../batch/BatchPanelHeader';
import BatchGeometrySection from '../batch/geometry/BatchGeometrySection';
import { NumberInput, PropertyRow, PropertySection } from '../index';
import { PANEL_ROOT_CLASS } from '../navigation/panelChrome';
import EditSessionBoundary from '../selection/EditSessionBoundary';
import {
  defaultPanel,
  fieldState,
  type Translate,
  type Values,
} from './documentPanelModel';
import { FieldRow, SurfaceSection } from './documentPanelRows';

const noop = () => undefined;

const valuesOf = (element: ElementNode) => (element.values ?? {}) as Values;

interface DocumentBatchPanelProps {
  sceneId: string;
  elementIds: readonly string[];
  panelElement: HTMLElement | null;
  setPanelElement: (element: HTMLDivElement | null) => void;
  t: Translate;
}

/** 트리 요소 여러 개 - 단일 패널과 같은 선언에서 섞인 값과 함께 그린다 */
const DocumentBatchPanel = ({
  sceneId,
  elementIds,
  panelElement,
  setPanelElement,
  t,
}: DocumentBatchPanelProps) => {
  const scene = useElementDocumentScene(sceneId);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameCancelledRef = useRef(false);
  const all = scene ? sceneElements(scene) : [];
  const elements = elementIds.flatMap((id) => {
    const element = all.find((node) => node.id === id);
    return element ? [element] : [];
  });
  if (elements.length === 0) return null;

  const geometry = documentBatchGeometry(sceneId, elements);
  const commitGeometry = (operation: BatchGeometryOperation) =>
    geometry.commit(operation);
  const previewGeometry = geometry.preview;
  const clearPreview = geometry.clearPreview;
  const width = aggregateMixedValue(elements, (node) => node.frame.width, 0);
  const height = aggregateMixedValue(elements, (node) => node.frame.height, 0);

  // 모두 같은 종류면 그 종류의 선언 칸을 섞인 값과 함께 보인다
  const kinds = new Set(elements.map((node) => node.kind));
  const definition =
    kinds.size === 1 ? elementKindDefinition(elements[0].kind) : undefined;
  const sections: readonly PanelSectionDecl<Values>[] = definition
    ? definition.panel ?? defaultPanel(definition)
    : [];
  const items = elements.map(valuesOf);
  const commitValues = (next: Values) => {
    void Promise.all(
      elements.map(async (element) => {
        const merged = { ...valuesOf(element), ...next };
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
  const usesSurface = elements.every((element) =>
    elementKindDefinition(element.kind)?.bundles?.includes('surface'),
  );

  return (
    <div ref={setPanelElement} className={PANEL_ROOT_CLASS}>
      <div className="flex-shrink-0">
        <BatchPanelHeader
          totalCount={elements.length}
          selectedGroupInfo={null}
          isRenaming={false}
          renameInputRef={renameInputRef}
          renameValue=""
          setRenameValue={noop}
          renameCancelledRef={renameCancelledRef}
          handleRenameCommit={noop}
          handleRenameCancel={noop}
          handleRenameStart={noop}
          t={t}
        />
      </div>
      <div className="flex-1 properties-panel-overlay-scroll">
        <div className="properties-panel-overlay-viewport">
          <EditSessionBoundary>
            <PropertySection>
              <BatchGeometrySection
                totalCount={elements.length}
                handleBatchAlign={(direction) =>
                  commitGeometry({ kind: 'align', direction })
                }
                handleBatchDistribute={(direction) =>
                  commitGeometry({ kind: 'distribute', direction })
                }
                handleBatchSpacing={(spacing) =>
                  commitGeometry({ kind: 'spacing', spacing })
                }
                batchSpacing={geometry.spacingValue()}
                t={t}
              />
              <PropertyRow label={t('propertiesPanel.size') || '크기'}>
                {(['width', 'height'] as const).map((dimension) => {
                  const state = dimension === 'width' ? width : height;
                  return (
                    <NumberInput
                      key={dimension}
                      value={state.value}
                      onChange={(value) => {
                        clearPreview();
                        commitGeometry({ kind: 'resize', dimension, value });
                      }}
                      onPreview={(value) =>
                        previewGeometry({ kind: 'resize', dimension, value })
                      }
                      onCancel={clearPreview}
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
            </PropertySection>
            {sections.map((section, index) => {
              if ('common' in section) return null;
              if ('bundle' in section) {
                return section.bundle === 'surface' && usesSurface ? (
                  <SurfaceSection
                    key={`bundle-${section.bundle}`}
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
                ) : null;
              }
              // 고른 요소 모두에서 보이는 칸만
              const rows = section.rows.filter(
                (row) =>
                  !row.visible ||
                  items.every((values) => row.visible?.(values as never)),
              );
              if (rows.length === 0) return null;
              return (
                <PropertySection key={`rows-${index}`}>
                  {rows.map((row) => (
                    <FieldRow
                      key={row.field}
                      row={row}
                      state={fieldState(items, row.field)}
                      onCommit={(value) => commitValues({ [row.field]: value })}
                      panelElement={panelElement}
                      t={t}
                    />
                  ))}
                </PropertySection>
              );
            })}
          </EditSessionBoundary>
        </div>
      </div>
    </div>
  );
};

export default DocumentBatchPanel;
