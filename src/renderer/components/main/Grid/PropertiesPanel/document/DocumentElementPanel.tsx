import React, {
  createElement,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { useDocumentElement } from '@src/renderer/editor/document/elementDocumentRuntime';
import type { GeometryField } from '@src/renderer/editor/runtime/operations/elementOps';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import { useTreeElementPosition } from '@src/renderer/elementKinds/runtime/treeElementPosition';
import type { KeyPosition } from '@src/types/key/keys';
import { useSettingsStore } from '@stores/useSettingsStore';
import {
  setDocumentBundle,
  setDocumentCommon,
  setDocumentFrame,
  setDocumentValues,
} from '../../document/documentEditActions';
import { useDocumentFramePreviewStore } from '@stores/grid/useDocumentFramePreviewStore';
import { PropertySection } from '../controls/PropertyInputs';
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
import { LegacyCustomCssSection, LegacySingleStyle } from './legacyBundleRows';

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
  return <ElementPanelBody {...props} element={stored} />;
};

const ElementPanelBody = ({
  sceneId,
  element,
  panelElement,
  setPanelElement,
  scrollRef,
  t,
}: DocumentElementPanelProps & { element: ElementNode }) => {
  // 옛 종류는 옛 단일 패널과 같은 처리기로 쓰고, 옛 패널이 보던 값(트리 값 + 편집 미리보기, 옛 칸 모양)을 읽는다 -
  // 고르는 중인 값이 다른 칸에도 보인다
  const writer = singlePanelWriterFor(sceneId, element);
  const legacyView = useTreeElementPosition(element, sceneId);
  const useCustomCSS = useSettingsStore((state) => state.useCustomCSS);
  // 이름 바꾸기는 그 요소에서만 - 고른 요소가 바뀌면 끝난다
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const isRenaming = renamingId === element.id;
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameCancelledRef = useRef(false);
  const definition = elementKindDefinition(element.kind);
  const values = (writer ? legacyView : element.values ?? {}) as Values;
  const kindLabel = definition?.label
    ? t(definition.label) || element.kind
    : t('elementKinds.unknownKind') || element.kind;
  const defaultTitle = definition?.title?.(values as never) ?? kindLabel;
  const name = writer
    ? (legacyView.layerName as string | undefined)
    : element.name;
  const title = name || defaultTitle;
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

  const geometry = writer ? (
    // 옛 종류 - 옛 단일 패널과 같은 위치·크기·회전 처리기
    <SingleGeometrySection
      keyPosition={legacyView as unknown as KeyPosition}
      kind={geometryKindOf(element.kind)}
      onGeometryPreview={writer.previewGeometry}
      onGeometryCommit={writer.commitGeometry}
      // 회전 줄은 쓸 수 있는 요소만 (옛 모양 id가 아니면 처리기가 없다)
      {...(writer.commitGeometry
        ? {
            onRotationPreview: (value: number) =>
              writer.previewStyle({ property: 'rotation', value }),
            onRotationCommit: (value: number) =>
              writer.commitStyle({ property: 'rotation', value }),
          }
        : {})}
      t={t}
    />
  ) : (
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
      onGeometryPreview={(field, value) =>
        useDocumentFramePreviewStore.getState().set(element.id, {
          ...element.frame,
          ...lockedFrame(field, value),
        })
      }
      onPreviewCancel={() =>
        useDocumentFramePreviewStore.getState().clear(element.id)
      }
      onGeometryCommit={(field, value) => {
        useDocumentFramePreviewStore.getState().clear(element.id);
        void setDocumentFrame(sceneId, element.id, lockedFrame(field, value));
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

  const renderers: PanelSectionRenderers = {
    geometry: () => geometry,
    custom: (component) => (
      // 편집 화면 전용 섹션은 지연 로딩일 수 있다
      <Suspense fallback={null}>
        {createElement(component, {
          sceneId,
          elementIds: [element.id],
          panelElement,
          t,
        })}
      </Suspense>
    ),
    customCss: () =>
      useCustomCSS && writer ? (
        <LegacyCustomCssSection
          kind={element.kind}
          position={legacyView as unknown as KeyPosition}
          writer={writer}
          t={t}
        />
      ) : null,
    bundles: (bundles) => {
      if (writer) {
        return (
          <LegacySingleStyle
            kind={element.kind}
            sceneId={sceneId}
            position={legacyView as unknown as KeyPosition}
            writer={writer}
            panelElement={panelElement}
            useCustomCSS={useCustomCSS}
            t={t}
          />
        );
      }
      return bundles.includes('surface') ? (
        <PropertySection>
          <SurfaceRows
            surfaces={[(element.bundles?.surface ?? {}) as Values]}
            panelElement={panelElement}
            t={t}
            onCommit={(fields) =>
              void setDocumentBundle(sceneId, element.id, 'surface', fields)
            }
          />
        </PropertySection>
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
        elementIds={[element.id]}
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
          const next = trimmed && trimmed !== defaultTitle ? trimmed : null;
          if (writer) writer.commitField('layerName', next);
          else void setDocumentCommon(sceneId, element.id, { name: next });
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
