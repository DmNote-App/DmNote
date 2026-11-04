import React from 'react';
import Checkbox from '@components/main/common/checkbox/Checkbox';
import Dropdown from '@components/main/common/dropdown/Dropdown';
import {
  normalizeSettingsSections,
  normalizeSettingsSectionsOfMany,
  type SettingsNormalizationErrorKind,
} from '@plugins/runtime/settingsSections';
import type {
  PluginMessages,
  PluginSettingSchema,
} from '@src/types/plugin/api';
import { translatePluginMessage } from '@utils/plugin/pluginI18n';
import {
  ColorInput,
  NumberInput,
  PropertyRow,
  PropertySection,
  TextInput,
} from '../controls/PropertyInputs';

// 같은 정의의 요소 여럿 - 값이 다른 칸은 Mixed, 어느 요소에서라도 보이는 칸을 보인다
export interface PluginSettingsBatch {
  mixedKeys: ReadonlySet<string>;
  // 요소마다 보일 설정 값 (values는 첫 요소 값)
  valuesList: readonly Record<string, unknown>[];
}

export type PluginSettingsFormRenderer = (
  schema: Record<string, PluginSettingSchema> | undefined,
  values: Record<string, unknown>,
  messages: PluginMessages | undefined,
  pluginId: string,
  colorIdPrefix: string,
  onChange: (key: string, value: unknown) => void,
  batch?: PluginSettingsBatch,
) => React.ReactNode;

interface PluginSettingsFormProps {
  schema: Record<string, PluginSettingSchema> | undefined;
  values: Record<string, unknown>;
  batch?: PluginSettingsBatch;
  messages: PluginMessages | undefined;
  pluginId: string;
  colorIdPrefix: string;
  onChange: (key: string, value: unknown) => void;
  locale: string;
  panelElement: HTMLDivElement | null;
  reportNormalizationError: (
    pluginId: string,
    key: string,
    error: unknown,
    kind: SettingsNormalizationErrorKind,
  ) => void;
  t: (key: string) => string | undefined;
}

const getPluginInputWidth = (
  type: 'string' | 'number',
  value: unknown,
): string => {
  if (type === 'number') return '60px';
  const stringValue = String(value ?? '');
  if (stringValue.length <= 4) return '60px';
  if (stringValue.length <= 10) return '100px';
  return '200px';
};

const MixedLabel = () => (
  <span className="text-fg-faint text-body italic">Mixed</span>
);

const PluginSettingsForm = ({
  schema,
  values,
  batch,
  messages,
  pluginId,
  colorIdPrefix,
  onChange,
  locale,
  panelElement,
  reportNormalizationError,
  t,
}: PluginSettingsFormProps) => {
  const report = (
    key: string,
    error: unknown,
    kind: SettingsNormalizationErrorKind,
  ) => reportNormalizationError(pluginId, key, error, kind);
  const sections = batch
    ? normalizeSettingsSectionsOfMany(schema, batch.valuesList, report)
    : normalizeSettingsSections(schema, values, report);
  if (!sections.some((section) => section.renderVisible)) {
    return (
      <p className="text-fg-caption text-body text-center">
        {t('propertiesPanel.pluginNoSettings') || '설정할 항목이 없습니다.'}
      </p>
    );
  }

  const translate = (key?: string, fallback?: string) => {
    if (!key) return fallback || '';
    return translatePluginMessage({
      messages,
      locale,
      key,
      fallback,
    });
  };

  const renderEntry = (
    key: string,
    schemaValue: Exclude<PluginSettingSchema, { type: 'section' }>,
    renderVisible: boolean,
  ) => {
    if (!renderVisible) return null;
    const mixed = batch?.mixedKeys.has(key) ?? false;
    const rawValue =
      values[key] !== undefined ? values[key] : schemaValue.default;
    const labelText = translate(schemaValue.label, schemaValue.label);
    const placeholderText =
      typeof schemaValue.placeholder === 'string'
        ? translate(schemaValue.placeholder, schemaValue.placeholder)
        : schemaValue.placeholder;

    let control: React.ReactNode = null;

    if (schemaValue.type === 'boolean') {
      const checked = !!rawValue;
      control = (
        <Checkbox
          commitStrategy="after-paint"
          checked={checked}
          onChange={() => onChange(key, !checked)}
        />
      );
    } else if (schemaValue.type === 'color') {
      const colorValue =
        typeof rawValue === 'string'
          ? rawValue
          : (schemaValue.default as string) || '#FFFFFF';
      control = (
        <ColorInput
          value={colorValue}
          onChange={(color) => onChange(key, color)}
          colorId={`${colorIdPrefix}-${key}`}
          panelElement={panelElement}
          solidOnly={true}
          hexMixed={mixed}
          alphaMixed={mixed}
        />
      );
    } else if (schemaValue.type === 'number') {
      const numericValue = Number(rawValue);
      const normalizedValue = Number.isFinite(numericValue)
        ? numericValue
        : typeof schemaValue.default === 'number'
        ? schemaValue.default
        : 0;
      const stepString =
        schemaValue.step != null ? String(schemaValue.step) : '';
      const dotIndex = stepString.indexOf('.');
      const hasDecimal = dotIndex !== -1;
      const decimalScale = hasDecimal ? stepString.length - dotIndex - 1 : 0;
      control = (
        <NumberInput
          value={normalizedValue}
          min={schemaValue.min}
          max={schemaValue.max}
          allowDecimal={hasDecimal}
          decimalScale={decimalScale}
          step={schemaValue.step}
          onChange={(nextValue) => onChange(key, nextValue)}
          width={getPluginInputWidth('number', rawValue)}
          isMixed={mixed}
        />
      );
    } else if (schemaValue.type === 'string') {
      const stringValue =
        mixed || rawValue === undefined || rawValue === null
          ? ''
          : String(rawValue);
      control = (
        <TextInput
          value={stringValue}
          onChange={(nextValue) => onChange(key, nextValue)}
          placeholder={
            mixed
              ? 'Mixed'
              : typeof placeholderText === 'string'
              ? placeholderText
              : undefined
          }
          width={getPluginInputWidth('string', stringValue)}
          isMixed={mixed}
        />
      );
    } else if (schemaValue.type === 'select') {
      const options = (schemaValue.options || []).map((option) => ({
        label: translate(option.label, option.label),
        value: String(option.value),
      }));
      const optionMap = new Map(
        (schemaValue.options || []).map((option) => [
          String(option.value),
          option.value,
        ]),
      );
      const selectedValue = optionMap.has(String(rawValue))
        ? String(rawValue)
        : String(schemaValue.default ?? '');
      control = (
        <Dropdown
          commitStrategy="after-paint"
          value={selectedValue}
          mixed={mixed}
          options={options}
          placeholder={
            typeof placeholderText === 'string' &&
            placeholderText.trim().length > 0
              ? placeholderText
              : undefined
          }
          onChange={(nextValue) =>
            onChange(key, optionMap.get(nextValue) ?? nextValue)
          }
        />
      );
    }

    if (schemaValue.type === 'boolean') {
      return (
        <div
          key={key}
          className="flex justify-between items-center w-full min-h-[32px]"
        >
          <p className="text-fg-muted text-label">{labelText}</p>
          <div className="flex items-center gap-[10.5px]">
            {mixed && <MixedLabel />}
            {control}
          </div>
        </div>
      );
    }

    return (
      <PropertyRow key={key} label={labelText}>
        {mixed && schemaValue.type === 'select' && <MixedLabel />}
        {control}
      </PropertyRow>
    );
  };

  return (
    // 대상 전환 시 입력 인스턴스도 교체해 이전 편집값의 오확정을 방지
    <div key={colorIdPrefix} className="flex flex-col gap-[12px]">
      {sections.map((section) => {
        if (!section.renderVisible) return null;
        const sectionLabel = translate(section.label, section.label);
        return (
          <div
            key={section.key ?? 'implicit'}
            className="flex flex-col gap-[6px]"
          >
            {section.label && (
              <p className="text-fg-caption text-body text-left px-[2px]">
                {sectionLabel}
              </p>
            )}
            <PropertySection>
              {section.entries.map((entry) =>
                renderEntry(entry.key, entry.schema, entry.renderVisible),
              )}
            </PropertySection>
          </div>
        );
      })}
    </div>
  );
};

export default PluginSettingsForm;
