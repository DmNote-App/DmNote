import React, { Suspense, useRef, useState } from 'react';

import Checkbox from '@components/main/common/checkbox/Checkbox';
import Dropdown from '@components/main/common/dropdown/Dropdown';
import { useDocumentElement } from '@src/renderer/editor/document/elementDocumentRuntime';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type {
  ElementKindDefinition,
  PanelRowDecl,
  PanelSectionDecl,
} from '@src/renderer/elementKinds/defineElementKind';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import type { JsonValue } from '@src/types/generated/elementDocument';
import type { KeyPosition } from '@src/types/key/keys';
import {
  setDocumentBundle,
  setDocumentCommon,
  setDocumentFrame,
  setDocumentValues,
} from '../../document/documentEditActions';
import { useDocumentFramePreviewStore } from '../../document/useDocumentFramePreviewStore';
import {
  ColorInput,
  NumberInput,
  PropertyRow,
  PropertySection,
} from '../index';
import { PANEL_ROOT_CLASS } from '../navigation/panelChrome';
import EditSessionBoundary from '../selection/EditSessionBoundary';
import SingleGeometrySection from '../single/SingleGeometrySection';
import SinglePanelRenameHeader from '../single/SinglePanelRenameHeader';

type Translate = (key: string) => string | undefined;
type Values = Record<string, JsonValue>;

interface FieldRowProps {
  row: PanelRowDecl<Values>;
  value: JsonValue | undefined;
  onCommit: (value: JsonValue) => void;
  panelElement: HTMLElement | null;
  t: Translate;
}

const FieldRow = ({ row, value, onCommit, panelElement, t }: FieldRowProps) => {
  const label = t(row.label) || row.label;
  const control = row.control;
  if (control.type === 'toggle') {
    return (
      <div className="flex justify-between items-center w-full min-h-[32px]">
        <p className="text-fg-muted text-label">{label}</p>
        <Checkbox
          commitStrategy="after-paint"
          checked={value === true}
          onChange={() => onCommit(!(value === true))}
        />
      </div>
    );
  }
  return (
    <PropertyRow label={label}>
      {control.type === 'number' ? (
        <NumberInput
          value={typeof value === 'number' ? value : 0}
          onChange={(next) => onCommit(next)}
          min={control.min}
          max={control.max}
          suffix={control.suffix}
          allowDecimal={(control.decimalScale ?? 0) > 0}
          decimalScale={control.decimalScale}
        />
      ) : control.type === 'select' ? (
        <Dropdown
          commitStrategy="after-paint"
          options={control.options.map((option) => ({
            value: option.value,
            label: t(option.label) || option.label,
          }))}
          value={typeof value === 'string' ? value : undefined}
          onChange={(next) => onCommit(next)}
        />
      ) : control.type === 'color' ? (
        <ColorInput
          value={typeof value === 'string' ? value : '#FFFFFF'}
          onChange={(next) => onCommit(next)}
          solidOnly
          panelElement={panelElement}
        />
      ) : (
        // 직접 만든 입력은 편집 화면 전용이라 지연 로딩일 수 있다
        <Suspense fallback={null}>
          <control.component value={value} onCommit={onCommit} />
        </Suspense>
      )}
    </PropertyRow>
  );
};

interface SurfaceSectionProps {
  element: ElementNode;
  onCommit: (fields: Values) => void;
  panelElement: HTMLElement | null;
  t: Translate;
}

// 표면 묶음 섹션 - 그래프·노브 패널과 같은 칸 이름·부품
const SurfaceSection = ({
  element,
  onCommit,
  panelElement,
  t,
}: SurfaceSectionProps) => {
  const surface = (element.bundles?.surface ?? {}) as Values;
  const color = (name: string) =>
    typeof surface[name] === 'string' ? (surface[name] as string) : '';
  const number = (name: string, fallback: number) =>
    typeof surface[name] === 'number' ? (surface[name] as number) : fallback;
  return (
    <PropertySection>
      <PropertyRow label={t('propertiesPanel.backgroundColor') || 'Background'}>
        <ColorInput
          value={color('backgroundColor')}
          onChange={(next) => onCommit({ backgroundColor: next })}
          solidOnly
          panelElement={panelElement}
        />
      </PropertyRow>
      <PropertyRow label={t('propertiesPanel.borderColor') || 'Border'}>
        <ColorInput
          value={color('borderColor')}
          onChange={(next) => onCommit({ borderColor: next })}
          solidOnly
          panelElement={panelElement}
        />
      </PropertyRow>
      <PropertyRow label={t('propertiesPanel.borderWidth') || 'Border Width'}>
        <NumberInput
          value={number('borderWidth', 1)}
          onChange={(next) => onCommit({ borderWidth: Math.max(0, next) })}
          min={0}
          max={20}
          suffix="px"
        />
      </PropertyRow>
      <PropertyRow label={t('propertiesPanel.borderRadius') || 'Radius'}>
        <NumberInput
          value={number('borderRadius', 4)}
          onChange={(next) => onCommit({ borderRadius: Math.max(0, next) })}
          min={0}
          max={500}
          suffix="px"
        />
      </PropertyRow>
    </PropertySection>
  );
};

const defaultPanel = (
  definition: ElementKindDefinition,
): PanelSectionDecl<Values>[] => [
  { common: 'geometry' },
  ...(definition.bundles ?? []).map((bundle) => ({ bundle })),
];

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
  if (!element) return null;
  const definition = elementKindDefinition(element.kind);
  const values = (element.values ?? {}) as Values;
  const kindLabel = definition?.label
    ? t(definition.label) || element.kind
    : t('elementKinds.unknownKind') || element.kind;
  const title = element.name || kindLabel;

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
      onGeometryPreview={(field, value) =>
        useDocumentFramePreviewStore.getState().set(element.id, {
          ...element.frame,
          [field === 'dx' ? 'x' : field === 'dy' ? 'y' : field]: value,
        })
      }
      onGeometryCommit={(field, value) => {
        useDocumentFramePreviewStore.getState().clear(element.id);
        const { width, height } = element.frame;
        // 비율을 잠근 종류는 너비·높이를 함께 바꿔 지금 비율을 지킨다
        const locked =
          definition?.lockAspect?.(values as never) === true &&
          width > 0 &&
          height > 0;
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
                    element={element}
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
                      value={values[row.field]}
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
