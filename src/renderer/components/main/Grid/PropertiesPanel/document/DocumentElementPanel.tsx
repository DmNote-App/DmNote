import React, { useEffect, useRef, useState } from 'react';

import { useDocumentElement } from '@src/renderer/editor/document/elementDocumentRuntime';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import type { KeyPosition } from '@src/types/key/keys';
import {
  setDocumentBundle,
  setDocumentCommon,
  setDocumentFrame,
  setDocumentValues,
} from '../../document/documentEditActions';
import { useDocumentFramePreviewStore } from '../../document/useDocumentFramePreviewStore';
import { PropertySection } from '../index';
import { PANEL_ROOT_CLASS } from '../navigation/panelChrome';
import EditSessionBoundary from '../selection/EditSessionBoundary';
import SingleGeometrySection from '../single/SingleGeometrySection';
import SinglePanelRenameHeader from '../single/SinglePanelRenameHeader';
import {
  defaultPanel,
  type Translate,
  type Values,
} from './documentPanelModel';
import { FieldRow, SurfaceSection } from './documentPanelRows';

interface DocumentElementPanelProps {
  sceneId: string;
  elementId: string;
  panelElement: HTMLElement | null;
  setPanelElement: (element: HTMLDivElement | null) => void;
  t: Translate;
}

/** 트리 문서 종류의 속성 패널 - 정의의 패널 선언을 지금 패널 부품으로 그린다 */
const DocumentElementPanel = ({
  sceneId,
  elementId,
  panelElement,
  setPanelElement,
  t,
}: DocumentElementPanelProps) => {
  const element = useDocumentElement(sceneId, elementId);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameCancelledRef = useRef(false);
  // 다른 요소로 바뀌거나 패널이 닫히면 확정 안 된 미리보기를 걷는다
  useEffect(
    () => () => useDocumentFramePreviewStore.getState().clear(elementId),
    [elementId],
  );
  if (!element) return null;
  const definition = elementKindDefinition(element.kind);
  const values = (element.values ?? {}) as Values;
  const kindLabel = definition?.label
    ? t(definition.label) || element.kind
    : t('elementKinds.unknownKind') || element.kind;
  const title = element.name || kindLabel;
  const aspectLocked = definition?.lockAspect?.(values as never) === true;

  const commitValues = (next: Values) => {
    const merged = { ...values, ...next };
    const adjusted = definition?.adjustFrame?.(merged as never, element.frame);
    void Promise.resolve(adjusted).then((frame) =>
      setDocumentValues(sceneId, element.id, next, frame ?? undefined),
    );
  };

  const geometry = (
    <SingleGeometrySection
      key="geometry"
      keyPosition={
        {
          dx: element.frame.x,
          dy: element.frame.y,
          width: element.frame.width,
          height: element.frame.height,
          rotation: element.frame.rotation,
        } as unknown as KeyPosition
      }
      kind="knob"
      onGeometryPreview={(field, value) => {
        const { width, height } = element.frame;
        const locked = aspectLocked && width > 0 && height > 0;
        useDocumentFramePreviewStore.getState().set(element.id, {
          ...element.frame,
          ...(locked && field === 'width'
            ? {
                width: value,
                height: Math.max(1, Math.round((value * height) / width)),
              }
            : locked && field === 'height'
            ? {
                width: Math.max(1, Math.round((value * width) / height)),
                height: value,
              }
            : { [field === 'dx' ? 'x' : field === 'dy' ? 'y' : field]: value }),
        });
      }}
      onPreviewCancel={() =>
        useDocumentFramePreviewStore.getState().clear(element.id)
      }
      onGeometryCommit={(field, value) => {
        useDocumentFramePreviewStore.getState().clear(element.id);
        const { width, height } = element.frame;
        // 비율을 잠근 종류는 너비·높이를 함께 바꿔 지금 비율을 지킨다
        const locked = aspectLocked && width > 0 && height > 0;
        if (locked && field === 'width') {
          void setDocumentFrame(sceneId, element.id, {
            width: value,
            height: Math.max(1, Math.round((value * height) / width)),
          });
          return;
        }
        if (locked && field === 'height') {
          void setDocumentFrame(sceneId, element.id, {
            width: Math.max(1, Math.round((value * width) / height)),
            height: value,
          });
          return;
        }
        void setDocumentFrame(sceneId, element.id, {
          [field === 'dx' ? 'x' : field === 'dy' ? 'y' : field]: value,
        });
      }}
      onRotationPreview={(value) =>
        useDocumentFramePreviewStore
          .getState()
          .set(element.id, { ...element.frame, rotation: value })
      }
      onRotationCommit={(value) => {
        useDocumentFramePreviewStore.getState().clear(element.id);
        void setDocumentFrame(sceneId, element.id, { rotation: value });
      }}
      t={t}
    />
  );

  const sections = definition
    ? definition.panel ?? defaultPanel(definition)
    : [{ common: 'geometry' as const }];

  return (
    <div ref={setPanelElement} className={PANEL_ROOT_CLASS}>
      <SinglePanelRenameHeader
        title={title}
        titleClassName="text-fg text-label truncate max-w-[110px] cursor-default"
        renameButtonTitle={
          isRenaming ? '' : t('contextMenu.rename') || 'Rename'
        }
        isRenaming={isRenaming}
        renameInputRef={renameInputRef}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        renameCancelledRef={renameCancelledRef}
        handleRenameStart={() => {
          renameCancelledRef.current = false;
          setRenameValue(title);
          setIsRenaming(true);
        }}
        handleRenameCommit={(value) => {
          setIsRenaming(false);
          const trimmed = value.trim();
          void setDocumentCommon(sceneId, element.id, {
            name: trimmed && trimmed !== kindLabel ? trimmed : null,
          });
        }}
        handleRenameCancel={() => setIsRenaming(false)}
      />
      <div className="flex-1 properties-panel-overlay-scroll">
        <div className="properties-panel-overlay-viewport">
          <EditSessionBoundary>
            {sections.map((section, index) => {
              if ('common' in section) return geometry;
              if ('bundle' in section) {
                return section.bundle === 'surface' ? (
                  <SurfaceSection
                    key={`bundle-${section.bundle}`}
                    surfaces={[(element.bundles?.surface ?? {}) as Values]}
                    panelElement={panelElement}
                    t={t}
                    onCommit={(fields) =>
                      void setDocumentBundle(
                        sceneId,
                        element.id,
                        'surface',
                        fields,
                      )
                    }
                  />
                ) : null;
              }
              const rows = section.rows.filter(
                (row) => !row.visible || row.visible(values as never),
              );
              if (rows.length === 0) return null;
              return (
                <PropertySection key={`rows-${index}`}>
                  {rows.map((row) => (
                    <FieldRow
                      key={row.field}
                      row={row}
                      state={{ value: values[row.field], isMixed: false }}
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

export default DocumentElementPanel;
