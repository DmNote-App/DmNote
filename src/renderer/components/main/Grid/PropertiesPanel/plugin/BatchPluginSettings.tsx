import React from 'react';
import { flushPluginInstancesEditSession } from '@plugins/runtime/displayElement/instancesCommitQueue';
import { updatePluginElement } from '@plugins/runtime/displayElement/pluginElementActions';
import {
  normalizeSettingsSectionsOfMany,
  type SettingsNormalizationErrorKind,
} from '@plugins/runtime/settingsSections';
import type { PluginSettingsGroup } from './pluginSettingsGroups';
import type { PluginSettingsFormRenderer } from './PluginSettingsForm';

interface BatchPluginSettingsProps {
  groups: readonly PluginSettingsGroup[];
  renderPluginSettingsForm: PluginSettingsFormRenderer;
  reportNormalizationError: (
    pluginId: string,
    key: string,
    error: unknown,
    kind: SettingsNormalizationErrorKind,
  ) => void;
}

/** 플러그인 요소 여럿의 설정 - 정의마다 이름과 설정 칸 (값이 다르면 Mixed). 고친 값은 그 정의의 고른 요소 모두에 */
const BatchPluginSettings = ({
  groups,
  renderPluginSettingsForm,
  reportNormalizationError,
}: BatchPluginSettingsProps) => (
  <>
    {groups.map(({ definition, elements, valuesList, mixedKeys }) => {
      // 보일 칸이 없는 정의는 빼되, 칸을 가린 visibility 예외는 폼과 같은 리포터로 남긴다
      const renderable = normalizeSettingsSectionsOfMany(
        definition.settings,
        valuesList,
        (key, error, kind) =>
          reportNormalizationError(definition.pluginId, key, error, kind),
      ).some((section) => section.renderVisible);
      if (!renderable) return null;
      return (
        <div
          key={definition.id}
          className="flex flex-col gap-[6px]"
          // blur가 확정 경계 - 하나 고를 때와 같다
          onBlurCapture={() =>
            flushPluginInstancesEditSession(definition.pluginId)
          }
        >
          <p className="text-fg-caption text-body text-left px-[2px]">
            {definition.name || definition.id}
          </p>
          {renderPluginSettingsForm(
            definition.settings,
            valuesList[0],
            definition.messages,
            definition.pluginId,
            // 고른 요소가 바뀌면 입력도 바꾼다 (앞 대상의 편집값을 다음 대상에 확정하지 않게)
            `plugin-batch-${elements.map(({ fullId }) => fullId).join('|')}`,
            (key, value) => {
              for (const element of elements) {
                updatePluginElement(element.fullId, {
                  settings: { [key]: value },
                });
              }
            },
            { mixedKeys, valuesList },
          )}
        </div>
      );
    })}
  </>
);

export default BatchPluginSettings;
