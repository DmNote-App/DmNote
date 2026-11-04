import React, { useEffect } from 'react';
import { flushPluginInstancesEditSession } from '@plugins/runtime/displayElement/instancesCommitQueue';
import type { PluginGeometryField } from '@hooks/Grid/usePluginGeometryGesture';
import type {
  PluginSettingSchema,
  PluginMessages,
  PluginDefinitionInternal,
  PluginPanelElementView,
} from '@src/types/plugin/api';
import {
  PANEL_ROOT_CLASS,
  PANEL_HEADER_CLASS,
} from '../navigation/panelChrome';
import {
  hasRenderableSettings,
  type SettingsNormalizationErrorKind,
} from '@plugins/runtime/settingsSections';
import {
  PropertyRow,
  NumberInput,
  PropertySection,
} from '../controls/PropertyInputs';
import { AXIS_FIELD_WIDTH } from '@utils/cardRecipes';
import EditSessionBoundary from '../selection/EditSessionBoundary';

// ============================================================================
// Plugin Selection Panel
// ============================================================================

interface PluginSelectionPanelProps {
  setPanelElement: (el: HTMLDivElement | null) => void;
  pluginTitle: string;
  setPluginScrollRef: (node: HTMLDivElement | null) => void;
  isPluginResizable: boolean;
  selectedPluginElement: PluginPanelElementView | null;
  pluginDisplaySize: { width: number; height: number };
  handlePluginGeometryPreview: (
    field: PluginGeometryField,
    value: number,
  ) => void;
  handlePluginGeometryCommit: (
    field: PluginGeometryField,
    value: number,
  ) => void;
  handlePluginGeometryCancel: () => void;
  hasSinglePluginSelection: boolean;
  showModalHint: boolean;
  showSettings: boolean;
  renderPluginSettingsForm: (
    schema: Record<string, PluginSettingSchema> | undefined,
    values: Record<string, unknown>,
    messages: PluginMessages | undefined,
    pluginId: string,
    colorIdPrefix: string,
    onChange: (key: string, value: unknown) => void,
  ) => React.ReactNode;
  reportNormalizationError: (
    pluginId: string,
    key: string,
    error: unknown,
    kind: SettingsNormalizationErrorKind,
  ) => void;
  selectedPluginDefinition: PluginDefinitionInternal | null;
  resolvedPluginSettings: Record<string, unknown>;
  handlePluginSettingChange: (key: string, value: unknown) => void;
  t: (key: string) => string | undefined;
}

interface PluginGeometrySectionProps {
  position: { x: number; y: number };
  size: { width: number; height: number };
  onPreview: (field: PluginGeometryField, value: number) => void;
  onCommit: (field: PluginGeometryField, value: number) => void;
  onCancel: () => void;
  t: (key: string) => string | undefined;
}

// 입력 트리와 세션 취소 경계를 같은 서브트리에 둔다 - 선택 지문이 같아도
// 라우트 전환으로 이 섹션만 언마운트되면 미확정 세션을 닫아야 한다
const PluginGeometrySection = ({
  position,
  size,
  onPreview,
  onCommit,
  onCancel,
  t,
}: PluginGeometrySectionProps) => {
  useEffect(() => () => onCancel(), [onCancel]);
  return (
    <PropertySection>
      <PropertyRow label={t('propertiesPanel.position') || '위치'}>
        <NumberInput
          value={position.x}
          onChange={(value) => onCommit('x', value)}
          onPreview={(value) => onPreview('x', value)}
          onCancel={onCancel}
          prefix="X"
          width={AXIS_FIELD_WIDTH}
          min={-9999}
          max={9999}
          allowDecimal
          decimalScale={1}
        />
        <NumberInput
          value={position.y}
          onChange={(value) => onCommit('y', value)}
          onPreview={(value) => onPreview('y', value)}
          onCancel={onCancel}
          prefix="Y"
          width={AXIS_FIELD_WIDTH}
          min={-9999}
          max={9999}
          allowDecimal
          decimalScale={1}
        />
      </PropertyRow>
      <PropertyRow label={t('propertiesPanel.size') || '크기'}>
        <NumberInput
          value={size.width}
          onChange={(value) => onCommit('width', value)}
          onPreview={(value) => onPreview('width', value)}
          onCancel={onCancel}
          prefix="W"
          width={AXIS_FIELD_WIDTH}
          min={10}
          max={9999}
          allowDecimal
          decimalScale={1}
        />
        <NumberInput
          value={size.height}
          onChange={(value) => onCommit('height', value)}
          onPreview={(value) => onPreview('height', value)}
          onCancel={onCancel}
          prefix="H"
          width={AXIS_FIELD_WIDTH}
          min={10}
          max={9999}
          allowDecimal
          decimalScale={1}
        />
      </PropertyRow>
    </PropertySection>
  );
};

export const PluginSelectionPanel: React.FC<PluginSelectionPanelProps> = ({
  setPanelElement,
  pluginTitle,
  setPluginScrollRef,
  isPluginResizable,
  selectedPluginElement,
  pluginDisplaySize,
  handlePluginGeometryPreview,
  handlePluginGeometryCommit,
  handlePluginGeometryCancel,
  hasSinglePluginSelection,
  showModalHint,
  showSettings,
  renderPluginSettingsForm,
  reportNormalizationError,
  selectedPluginDefinition,
  resolvedPluginSettings,
  handlePluginSettingChange,
  t,
}) => {
  // 위치 섹션도 설정 폼도 없을 때는 안내 문구만 남음 — 패널 세로 중앙에 배치
  // notice-only로 단락돼도 visibility 예외가 기록되도록 폼과 같은 리포터 전달
  const settingsRenderable =
    showSettings &&
    hasRenderableSettings(
      selectedPluginDefinition?.settings,
      resolvedPluginSettings,
      (key, error, kind) =>
        reportNormalizationError(
          selectedPluginDefinition?.pluginId ?? 'unknown',
          key,
          error,
          kind,
        ),
    );
  const noticeOnly = !isPluginResizable && !settingsRenderable;
  const noticeText = !hasSinglePluginSelection
    ? t('propertiesPanel.pluginMultiSelection') ||
      '플러그인 요소는 한 번에 하나만 편집할 수 있습니다.'
    : showModalHint
    ? t('propertiesPanel.pluginModalHint') ||
      '이 플러그인은 설정 모달을 사용합니다. 요소를 클릭해 설정하세요.'
    : t('propertiesPanel.pluginNoSettings') || '설정할 항목이 없습니다.';

  if (noticeOnly) {
    return (
      <div ref={setPanelElement} className={PANEL_ROOT_CLASS}>
        <div className={PANEL_HEADER_CLASS}>
          <span className="text-fg text-label leading-none truncate max-w-[120px]">
            {pluginTitle}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center px-[24px] pb-[48px]">
          <p className="text-fg-caption text-body text-center">{noticeText}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={setPanelElement} className={PANEL_ROOT_CLASS}>
      <div className={PANEL_HEADER_CLASS}>
        <span className="text-fg text-label leading-none truncate max-w-[120px]">
          {pluginTitle}
        </span>
      </div>
      <div className="flex-1 properties-panel-overlay-scroll">
        <div
          ref={setPluginScrollRef}
          className="properties-panel-overlay-viewport"
          // blur가 확정 경계 - keystroke 단위가 아니라 포커스 이탈 시 즉시 커밋
          onBlurCapture={() => {
            const pluginId =
              selectedPluginElement?.pluginId ??
              selectedPluginDefinition?.pluginId;
            if (pluginId) flushPluginInstancesEditSession(pluginId);
          }}
        >
          <EditSessionBoundary>
            {isPluginResizable && (
              <PluginGeometrySection
                position={selectedPluginElement?.position ?? { x: 0, y: 0 }}
                size={pluginDisplaySize}
                onPreview={handlePluginGeometryPreview}
                onCommit={handlePluginGeometryCommit}
                onCancel={handlePluginGeometryCancel}
                t={t}
              />
            )}
            {!hasSinglePluginSelection && (
              <p className="text-fg-caption text-body text-center">
                {t('propertiesPanel.pluginMultiSelection') ||
                  '플러그인 요소는 한 번에 하나만 편집할 수 있습니다.'}
              </p>
            )}
            {hasSinglePluginSelection && showModalHint && (
              <p className="text-fg-caption text-body text-center">
                {t('propertiesPanel.pluginModalHint') ||
                  '이 플러그인은 설정 모달을 사용합니다. 요소를 클릭해 설정하세요.'}
              </p>
            )}
            {settingsRenderable &&
              renderPluginSettingsForm(
                selectedPluginDefinition?.settings,
                resolvedPluginSettings,
                selectedPluginDefinition?.messages,
                selectedPluginDefinition?.pluginId ?? 'unknown',
                `plugin-element-${selectedPluginElement?.fullId ?? 'unknown'}`,
                handlePluginSettingChange,
              )}
          </EditSessionBoundary>
        </div>
      </div>
    </div>
  );
};
