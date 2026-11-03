import React, { useEffect, useRef, useState } from 'react';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { useDocumentElement } from '@src/renderer/editor/document/elementDocumentRuntime';
import type { GeometryField } from '@src/renderer/editor/runtime/operations/elementOps';
import { useEditorPreviewElement } from '@src/renderer/elementKinds/runtime/editorPreviewElement';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import type { KeyPosition } from '@src/types/key/keys';
import { useSettingsStore } from '@stores/useSettingsStore';
import {
  setDocumentBundle,
  setDocumentCommon,
  setDocumentFrame,
  setDocumentValues,
} from '../../document/documentEditActions';
import { useDocumentFramePreviewStore } from '@stores/grid/useDocumentFramePreviewStore';
import { PANEL_ROOT_CLASS } from '../navigation/panelChrome';
import EditSessionBoundary from '../selection/EditSessionBoundary';
import SingleGeometrySection from '../single/SingleGeometrySection';
import SinglePanelRenameHeader from '../single/SinglePanelRenameHeader';
import {
  defaultPanel,
  rowState,
  type Translate,
  type Values,
} from './documentPanelModel';
import {
  FieldRow,
  PanelSections,
  SurfaceRows,
  type PanelSectionRenderers,
} from './documentPanelRows';
import { singlePanelWriterFor } from './documentPanelWriter';
import {
  LegacyCustomCssSection,
  LegacyImageRow,
  LegacySurfaceRows,
} from './legacyBundleRows';

interface DocumentElementPanelProps {
  sceneId: string;
  elementId: string;
  panelElement: HTMLElement | null;
  setPanelElement: (element: HTMLDivElement | null) => void;
  // 패널 스크롤 (Lenis) - 고른 요소가 바뀌어도 같은 뷰포트를 쓴다 (스크롤 자리를 지킨다)
  scrollRef?: (node: HTMLDivElement | null) => void;
  t: Translate;
}

// 위치·크기 섹션의 크기 정책 (최소·최대·기본 크기, 표시 반올림) - 옛 종류는 옛 패널과 같다
const geometryKindOf = (kind: string) =>
  kind === 'key' || kind === 'stat'
    ? ('key-or-stat' as const)
    : kind === 'graph'
    ? ('graph' as const)
    : ('knob' as const);

// 제목 칸 너비 - 옛 그래프·노브·스프라이트 패널은 100px
const TITLE_CLASS_NARROW =
  'text-fg text-label truncate max-w-[100px] cursor-default';
const TITLE_CLASS = 'text-fg text-label truncate max-w-[110px] cursor-default';
const narrowTitle = (kind: string) =>
  kind === 'graph' || kind === 'knob' || kind === 'sprite';

// 위치·크기 칸 이름 → 트리 틀 칸
const frameField = (field: GeometryField) =>
  field === 'dx' ? 'x' : field === 'dy' ? 'y' : field;

/** 트리 문서 종류의 속성 패널 - 정의의 패널 선언을 지금 패널 부품으로 그린다 */
const DocumentElementPanel = (props: DocumentElementPanelProps) => {
  const stored = useDocumentElement(props.sceneId, props.elementId);
  // 다른 요소로 바뀌거나 패널이 닫히면 확정 안 된 미리보기를 걷는다
  useEffect(
    () => () => useDocumentFramePreviewStore.getState().clear(props.elementId),
    [props.elementId],
  );
  if (!stored) return null;
  return <ElementPanelBody {...props} stored={stored} />;
};

const ElementPanelBody = ({
  sceneId,
  stored,
  panelElement,
  setPanelElement,
  scrollRef,
  t,
}: DocumentElementPanelProps & { stored: ElementNode }) => {
  // 보이는 값은 편집 미리보기를 얹은 값 - 고르는 중인 값이 다른 칸에도 보인다 (옛 패널과 같다)
  const element = useEditorPreviewElement(stored, sceneId);
  const useCustomCSS = useSettingsStore((state) => state.useCustomCSS);
  // 이름 바꾸기는 그 요소에서만 - 고른 요소가 바뀌면 끝난다
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const isRenaming = renamingId === stored.id;
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameCancelledRef = useRef(false);
  const definition = elementKindDefinition(element.kind);
  // 옛 종류는 옛 단일 패널과 같은 처리기로 쓴다
  const writer = singlePanelWriterFor(sceneId, element);
  const values = (element.values ?? {}) as Values;
  const kindLabel = definition?.label
    ? t(definition.label) || element.kind
    : t('elementKinds.unknownKind') || element.kind;
  const defaultTitle = definition?.title?.(values as never) ?? kindLabel;
  const title = element.name || defaultTitle;
  const aspectLocked = definition?.lockAspect?.(values as never) === true;

  const commitValues = (next: Values) => {
    const merged = { ...values, ...next };
    const adjusted = definition?.adjustFrame?.(merged as never, element.frame);
    void Promise.resolve(adjusted).then((frame) =>
      setDocumentValues(sceneId, element.id, next, frame ?? undefined),
    );
  };

  // 트리에만 있는 종류 - 비율을 잠근 종류는 너비·높이를 함께 바꿔 지금 비율을 지킨다
  const lockedFrame = (field: GeometryField, value: number) => {
    const { width, height } = element.frame;
    const locked = aspectLocked && width > 0 && height > 0;
    if (locked && field === 'width') {
      return {
        width: value,
        height: Math.max(1, Math.round((value * height) / width)),
      };
    }
    if (locked && field === 'height') {
      return {
        width: Math.max(1, Math.round((value * width) / height)),
        height: value,
      };
    }
    return { [frameField(field)]: value };
  };

  const geometry = (
    <SingleGeometrySection
      keyPosition={
        {
          dx: element.frame.x,
          dy: element.frame.y,
          width: element.frame.width,
          height: element.frame.height,
          rotation: element.frame.rotation,
        } as unknown as KeyPosition
      }
      kind={geometryKindOf(element.kind)}
      {...(writer
        ? {
            // 옛 종류 - 옛 단일 패널과 같은 위치·크기·회전 처리기
            onGeometryPreview: writer.previewGeometry,
            onGeometryCommit: writer.commitGeometry,
            onRotationPreview: (value: number) =>
              writer.previewStyle({ property: 'rotation', value }),
            onRotationCommit: (value: number) =>
              writer.commitStyle({ property: 'rotation', value }),
          }
        : {
            onGeometryPreview: (field: GeometryField, value: number) =>
              useDocumentFramePreviewStore.getState().set(element.id, {
                ...element.frame,
                ...lockedFrame(field, value),
              }),
            onPreviewCancel: () =>
              useDocumentFramePreviewStore.getState().clear(element.id),
            onGeometryCommit: (field: GeometryField, value: number) => {
              useDocumentFramePreviewStore.getState().clear(element.id);
              void setDocumentFrame(
                sceneId,
                element.id,
                lockedFrame(field, value),
              );
            },
            onRotationPreview: (value: number) =>
              useDocumentFramePreviewStore
                .getState()
                .set(element.id, { ...element.frame, rotation: value }),
            onRotationCommit: (value: number) => {
              useDocumentFramePreviewStore.getState().clear(element.id);
              void setDocumentFrame(sceneId, element.id, { rotation: value });
            },
          })}
      t={t}
    />
  );

  const renderers: PanelSectionRenderers = {
    geometry: () => geometry,
    customCss: () =>
      useCustomCSS && writer ? (
        <LegacyCustomCssSection element={element} writer={writer} t={t} />
      ) : null,
    bundle: (bundle) => {
      if (writer) {
        const rowProps = { sceneId, element, writer, panelElement, t };
        return bundle === 'surface' ? (
          <LegacySurfaceRows {...rowProps} />
        ) : bundle === 'image' ? (
          <LegacyImageRow {...rowProps} />
        ) : null;
      }
      return bundle === 'surface' ? (
        <SurfaceRows
          surfaces={[(element.bundles?.surface ?? {}) as Values]}
          panelElement={panelElement}
          t={t}
          onCommit={(fields) =>
            void setDocumentBundle(sceneId, element.id, 'surface', fields)
          }
        />
      ) : null;
    },
    row: (row) => (
      <FieldRow
        row={row}
        state={rowState(definition, row, [values])}
        onCommit={(value, options) =>
          writer
            ? writer.commitField(row.field, value, options)
            : commitValues({ [row.field]: value })
        }
        onPreview={
          writer ? (value) => writer.previewField(row.field, value) : undefined
        }
        onCancelPreview={writer?.cancelPreview}
        colorId={`${element.kind}-${row.field}-${sceneId}-${element.id}`}
        panelElement={panelElement}
        t={t}
      />
    ),
  };

  return (
    <div ref={setPanelElement} className={PANEL_ROOT_CLASS}>
      <SinglePanelRenameHeader
        title={title}
        titleClassName={
          narrowTitle(element.kind) ? TITLE_CLASS_NARROW : TITLE_CLASS
        }
        renameButtonTitle={
          isRenaming ? '' : t('contextMenu.rename') || 'Rename'
        }
        isRenaming={isRenaming}
        renameInputRef={renameInputRef}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        renameCancelledRef={renameCancelledRef}
        handleRenameStart={() => {
          // Escape로 언마운트된 입력은 blur가 오지 않아 취소 플래그가 남는다 - 다음 입력의 커밋이 삼켜지지 않게
          renameCancelledRef.current = false;
          setRenameValue(title);
          setRenamingId(element.id);
          requestAnimationFrame(() => {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
          });
        }}
        handleRenameCommit={(value) => {
          setRenamingId(null);
          const trimmed = value.trim();
          // 기본 제목과 같거나 비면 이름을 지운다
          const name = trimmed && trimmed !== defaultTitle ? trimmed : null;
          if (writer) writer.commitField('layerName', name);
          else void setDocumentCommon(sceneId, element.id, { name });
        }}
        handleRenameCancel={() => {
          renameCancelledRef.current = true;
          setRenamingId(null);
        }}
      />
      <div className="flex-1 properties-panel-overlay-scroll">
        <div ref={scrollRef} className="properties-panel-overlay-viewport">
          <EditSessionBoundary>
            <PanelSections
              sections={
                definition
                  ? definition.panel ?? defaultPanel(definition)
                  : [{ common: 'geometry' }]
              }
              items={[values]}
              renderers={renderers}
            />
          </EditSessionBoundary>
        </div>
      </div>
    </div>
  );
};

export default DocumentElementPanel;
