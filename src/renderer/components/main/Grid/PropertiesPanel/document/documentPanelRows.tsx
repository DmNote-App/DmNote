import React, { Fragment, Suspense, type ReactNode } from 'react';

import Checkbox from '@components/main/common/checkbox/Checkbox';
import Dropdown from '@components/main/common/dropdown/Dropdown';
import type {
  BundleName,
  PanelRowDecl,
  PanelSectionDecl,
} from '@src/renderer/elementKinds/defineElementKind';
import type { JsonValue } from '@src/types/generated/elementDocument';
import {
  fieldState,
  visibleRows,
  type FieldState,
  type Translate,
  type Values,
} from './documentPanelModel';
import {
  ColorInput,
  NumberInput,
  PropertyRow,
  PropertySection,
} from '../controls/PropertyInputs';

const MixedLabel = () => (
  <span className="text-fg-faint text-body italic">Mixed</span>
);

interface FieldRowProps {
  row: PanelRowDecl<Values>;
  // 보일 값 (displayValueOf를 거친 값) - 여러 개면 첫 값과 섞임
  state: FieldState;
  // 여러 개를 고른 패널 - 섞임 표시를 옛 일괄 패널과 같게 입력 앞에 둔다
  batch?: boolean;
  // settlesPreview - 미리보기를 보인 칸의 확정 (그 미리보기 제스처를 이 커밋으로 정산)
  onCommit: (value: JsonValue, options?: { settlesPreview?: boolean }) => void;
  // 색 칸 미리보기·취소 - 미리보기를 쓰는 칸만
  onPreview?: (value: JsonValue) => void;
  onCancelPreview?: () => void;
  colorId?: string;
  panelElement: HTMLElement | null;
  t: Translate;
}

/** 정의의 패널 칸 하나 - 지금 패널 부품으로 그린다 */
export const FieldRow = ({
  row,
  state,
  batch = false,
  onCommit,
  onPreview,
  onCancelPreview,
  colorId,
  panelElement,
  t,
}: FieldRowProps) => {
  const { value, isMixed } = state;
  const label = t(row.label) || row.label;
  const control = row.control;
  const mixedLabel = isMixed ? <MixedLabel /> : null;
  if (control.type === 'toggle') {
    const checked = value === true;
    const checkbox = (
      <Checkbox
        commitStrategy="after-paint"
        checked={checked}
        onChange={() => onCommit(!checked)}
      />
    );
    return (
      <div className="flex justify-between items-center w-full min-h-[32px]">
        <p className="text-fg-muted text-label">{label}</p>
        {batch ? (
          <div className="flex items-center gap-[6px]">
            {mixedLabel}
            {checkbox}
          </div>
        ) : (
          checkbox
        )}
      </div>
    );
  }
  const colorValue = (typeof value === 'string' ? value : '') || '#FFFFFF';
  return (
    <PropertyRow label={label}>
      {control.type === 'custom' ? null : mixedLabel}
      {control.type === 'number' ? (
        <NumberInput
          value={typeof value === 'number' ? value : 0}
          width={control.width}
          onChange={(next) => {
            if (control.snap === undefined) {
              onCommit(next);
              return;
            }
            // 범위로 자른 뒤 단위로 맞춘다
            const clamped = Math.max(
              control.min ?? -Infinity,
              Math.min(control.max ?? Infinity, next),
            );
            onCommit(Math.round(clamped / control.snap) * control.snap);
          }}
          min={control.min}
          max={control.max}
          suffix={control.suffix}
          allowDecimal={(control.decimalScale ?? 0) > 0}
          decimalScale={control.decimalScale}
          isMixed={isMixed}
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
      ) : control.type === 'color' && control.preview && onPreview ? (
        // 고르는 동안 화면에 먼저 보이고 놓을 때 확정, Esc는 되돌린다
        <ColorInput
          value={colorValue}
          hexMixed={state.hexMixed}
          alphaMixed={state.alphaMixed}
          onChange={() => {}}
          onPreview={(next) => onPreview(next)}
          onChangeComplete={(next) => onCommit(next, { settlesPreview: true })}
          onCancel={onCancelPreview}
          colorId={colorId}
          panelElement={panelElement}
        />
      ) : control.type === 'color' ? (
        <ColorInput
          value={colorValue}
          onChange={(next) => onCommit(next)}
          solidOnly
          panelElement={panelElement}
          hexMixed={state.hexMixed}
          alphaMixed={state.alphaMixed}
        />
      ) : (
        // 직접 만든 입력은 편집 화면 전용이라 지연 로딩일 수 있다
        <Suspense fallback={null}>
          {mixedLabel}
          <control.component value={value} onCommit={onCommit} />
        </Suspense>
      )}
    </PropertyRow>
  );
};

interface SurfaceRowsProps {
  // 고른 요소들의 표면 묶음
  surfaces: readonly Values[];
  onCommit: (fields: Values) => void;
  panelElement: HTMLElement | null;
  t: Translate;
}

/** 표면 묶음 칸 - 그래프·노브 패널과 같은 칸 이름·부품 (섹션 상자는 패널이 감싼다) */
export const SurfaceRows = ({
  surfaces,
  onCommit,
  panelElement,
  t,
}: SurfaceRowsProps) => {
  const color = (name: string) => {
    const { value, isMixed } = fieldState(surfaces, name);
    return { value: typeof value === 'string' ? value : '', isMixed };
  };
  const number = (name: string, fallback: number) => {
    const { value, isMixed } = fieldState(surfaces, name);
    return { value: typeof value === 'number' ? value : fallback, isMixed };
  };
  const background = color('backgroundColor');
  const border = color('borderColor');
  const borderWidth = number('borderWidth', 1);
  const borderRadius = number('borderRadius', 4);
  return (
    <>
      <PropertyRow label={t('propertiesPanel.backgroundColor') || 'Background'}>
        <ColorInput
          value={background.value}
          onChange={(next) => onCommit({ backgroundColor: next })}
          solidOnly
          panelElement={panelElement}
          hexMixed={background.isMixed}
          alphaMixed={background.isMixed}
        />
      </PropertyRow>
      <PropertyRow label={t('propertiesPanel.borderColor') || 'Border'}>
        <ColorInput
          value={border.value}
          onChange={(next) => onCommit({ borderColor: next })}
          solidOnly
          panelElement={panelElement}
          hexMixed={border.isMixed}
          alphaMixed={border.isMixed}
        />
      </PropertyRow>
      <PropertyRow label={t('propertiesPanel.borderWidth') || 'Border Width'}>
        <NumberInput
          value={borderWidth.value}
          onChange={(next) => onCommit({ borderWidth: Math.max(0, next) })}
          min={0}
          max={20}
          suffix="px"
          isMixed={borderWidth.isMixed}
        />
      </PropertyRow>
      <PropertyRow label={t('propertiesPanel.borderRadius') || 'Radius'}>
        <NumberInput
          value={borderRadius.value}
          onChange={(next) => onCommit({ borderRadius: Math.max(0, next) })}
          min={0}
          max={500}
          suffix="px"
          isMixed={borderRadius.isMixed}
        />
      </PropertyRow>
    </>
  );
};

// 섹션마다 그리는 쪽 - 단일·여러 개 패널이 공통 섹션·기능 묶음·칸을 자기 방식으로 그린다
export interface PanelSectionRenderers {
  geometry: () => ReactNode;
  customCss: () => ReactNode;
  // 그리지 않는 묶음은 null
  bundle: (bundle: BundleName) => ReactNode;
  row: (row: PanelRowDecl<Values>) => ReactNode;
}

type SectionGroup =
  | { kind: 'single'; section: PanelSectionDecl<Values> }
  | { kind: 'bundles'; bundles: BundleName[] };

// 이어진 기능 묶음 섹션은 한 섹션 상자에 그린다 (옛 패널의 스타일 섹션과 같은 모양)
const groupSections = (
  sections: readonly PanelSectionDecl<Values>[],
): SectionGroup[] => {
  const groups: SectionGroup[] = [];
  for (const section of sections) {
    const last = groups[groups.length - 1];
    if ('bundle' in section) {
      if (last?.kind === 'bundles') last.bundles.push(section.bundle);
      else groups.push({ kind: 'bundles', bundles: [section.bundle] });
      continue;
    }
    groups.push({ kind: 'single', section });
  }
  return groups;
};

interface PanelSectionsProps {
  sections: readonly PanelSectionDecl<Values>[];
  // 고른 요소들의 고유 값 - 칸 보이기 판단
  items: readonly Values[];
  renderers: PanelSectionRenderers;
}

/** 정의의 섹션 순서대로 그린다 */
export const PanelSections = ({
  sections,
  items,
  renderers,
}: PanelSectionsProps) =>
  groupSections(sections).map((group, index) => {
    if (group.kind === 'bundles') {
      const rows = group.bundles.map(
        (bundle) => [bundle, renderers.bundle(bundle)] as const,
      );
      if (rows.every(([, node]) => node == null)) return null;
      return (
        <PropertySection key={`bundles-${index}`}>
          {rows.map(([bundle, node]) => (
            <Fragment key={bundle}>{node}</Fragment>
          ))}
        </PropertySection>
      );
    }
    const { section } = group;
    if ('bundle' in section) return null;
    if ('common' in section) {
      return (
        <Fragment key={`common-${index}`}>
          {section.common === 'geometry'
            ? renderers.geometry()
            : renderers.customCss()}
        </Fragment>
      );
    }
    const rows = visibleRows(section.rows, items);
    if (rows.length === 0) return null;
    return (
      <PropertySection key={`rows-${index}`}>
        {rows.map((row) => (
          <Fragment key={row.field}>{renderers.row(row)}</Fragment>
        ))}
      </PropertySection>
    );
  });
