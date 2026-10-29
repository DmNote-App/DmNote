import React, { Suspense } from 'react';

import Checkbox from '@components/main/common/checkbox/Checkbox';
import Dropdown from '@components/main/common/dropdown/Dropdown';
import type { PanelRowDecl } from '@src/renderer/elementKinds/defineElementKind';
import type { JsonValue } from '@src/types/generated/elementDocument';
import {
  fieldState,
  type FieldState,
  type Translate,
  type Values,
} from './documentPanelModel';
import {
  ColorInput,
  NumberInput,
  PropertyRow,
  PropertySection,
} from '../index';

const MixedLabel = () => (
  <span className="text-fg-faint text-body italic">Mixed</span>
);

interface FieldRowProps {
  row: PanelRowDecl<Values>;
  state: FieldState;
  onCommit: (value: JsonValue) => void;
  panelElement: HTMLElement | null;
  t: Translate;
}

/** 정의의 패널 칸 하나 - 지금 패널 부품으로 그린다 */
export const FieldRow = ({
  row,
  state,
  onCommit,
  panelElement,
  t,
}: FieldRowProps) => {
  const { value, isMixed } = state;
  const label = t(row.label) || row.label;
  const control = row.control;
  if (control.type === 'toggle') {
    return (
      <div className="flex justify-between items-center w-full min-h-[32px]">
        <p className="text-fg-muted text-label">{label}</p>
        <div className="flex items-center gap-[6px]">
          {isMixed ? <MixedLabel /> : null}
          <Checkbox
            commitStrategy="after-paint"
            checked={value === true}
            onChange={() => onCommit(!(value === true))}
          />
        </div>
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
          isMixed={isMixed}
        />
      ) : control.type === 'select' ? (
        <Dropdown
          commitStrategy="after-paint"
          options={control.options.map((option) => ({
            value: option.value,
            label: t(option.label) || option.label,
          }))}
          value={!isMixed && typeof value === 'string' ? value : undefined}
          placeholder={isMixed ? 'Mixed' : undefined}
          onChange={(next) => onCommit(next)}
        />
      ) : control.type === 'color' ? (
        <ColorInput
          value={typeof value === 'string' ? value : '#FFFFFF'}
          onChange={(next) => onCommit(next)}
          solidOnly
          panelElement={panelElement}
          hexMixed={isMixed}
          alphaMixed={isMixed}
        />
      ) : (
        // 직접 만든 입력은 편집 화면 전용이라 지연 로딩일 수 있다
        <Suspense fallback={null}>
          {isMixed ? <MixedLabel /> : null}
          <control.component value={value} onCommit={onCommit} />
        </Suspense>
      )}
    </PropertyRow>
  );
};

interface SurfaceSectionProps {
  // 고른 요소들의 표면 묶음
  surfaces: readonly Values[];
  onCommit: (fields: Values) => void;
  panelElement: HTMLElement | null;
  t: Translate;
}

/** 표면 묶음 섹션 - 그래프·노브 패널과 같은 칸 이름·부품 */
export const SurfaceSection = ({
  surfaces,
  onCommit,
  panelElement,
  t,
}: SurfaceSectionProps) => {
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
    <PropertySection>
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
    </PropertySection>
  );
};
