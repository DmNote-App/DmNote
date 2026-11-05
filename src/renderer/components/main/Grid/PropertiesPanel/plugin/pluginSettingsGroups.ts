// 플러그인 요소 여럿의 설정 - 정의마다 하나로 묶어 섞인 값과 함께 보이고, 고친 값은 그 정의의 요소 모두에
import {
  getDefaultSettings,
  omitLayoutSettingValues,
  visibleSettingKeysOf,
} from '@plugins/runtime/settingsSections';
import type {
  PluginDefinitionInternal,
  PluginPanelElementView,
} from '@src/types/plugin/api';
import { stableStringify } from '@utils/core/stableStringify';

export interface PluginSettingsGroup {
  definition: PluginDefinitionInternal;
  // 그 정의의 고른 요소 - 고른 순서
  elements: PluginPanelElementView[];
  // 요소마다 보일 설정 값 (기본값 위에 요소 값, 위치·크기 칸 제외) - 하나 고를 때와 같은 값
  valuesList: Record<string, unknown>[];
  // 칸마다 보일 값 - 그 칸이 보이는 첫 요소의 값
  displayValues: Record<string, unknown>;
  // 그 칸이 보이는 요소끼리 값이 다른 칸
  mixedKeys: Set<string>;
  // 그 칸을 고칠 요소 - 그 칸이 보이는 요소 (보이는 요소가 없으면 전부)
  ownersOf: (key: string) => PluginPanelElementView[];
}

/** 그 정의 요소의 보일 설정 값 - 하나 고를 때와 같다 */
export const pluginSettingValuesOf = (
  definition: PluginDefinitionInternal,
  element: Pick<PluginPanelElementView, 'settings'>,
): Record<string, unknown> => ({
  ...getDefaultSettings(definition.settings),
  ...omitLayoutSettingValues(definition.settings, element.settings || {}),
});

/** 고른 플러그인 요소의 정의별 설정 묶음 - 고른 순서. 설정 모달을 쓰는 정의(하나씩 연다)·설정이 없는 정의·
 * 정의를 못 찾은 요소는 뺀다 */
export const pluginSettingsGroups = (
  elements: readonly PluginPanelElementView[],
  definitions: ReadonlyMap<string, PluginDefinitionInternal>,
): PluginSettingsGroup[] => {
  const groups = new Map<string, PluginSettingsGroup>();
  for (const element of elements) {
    const definition = element.definitionId
      ? definitions.get(element.definitionId)
      : undefined;
    if (!definition?.settings || definition.settingsUI === 'modal') continue;
    const group = groups.get(definition.id) ?? {
      definition,
      elements: [],
      valuesList: [],
      displayValues: {},
      mixedKeys: new Set<string>(),
      ownersOf: () => [],
    };
    group.elements.push(element);
    group.valuesList.push(pluginSettingValuesOf(definition, element));
    groups.set(definition.id, group);
  }
  for (const group of groups.values()) {
    const visible = group.valuesList.map((values) =>
      visibleSettingKeysOf(group.definition.settings, values),
    );
    // 그 칸이 보이는 요소 순번 - 없으면 전부
    const ownerIndices = (key: string) => {
      const owners = visible.flatMap((keys, index) =>
        keys.has(key) ? [index] : [],
      );
      return owners.length > 0 ? owners : group.valuesList.map((_, i) => i);
    };
    group.ownersOf = (key) =>
      ownerIndices(key).map((index) => group.elements[index]);
    const keys = new Set(group.valuesList.flatMap(Object.keys));
    for (const key of keys) {
      const [first, ...rest] = ownerIndices(key).map(
        (index) => group.valuesList[index][key],
      );
      group.displayValues[key] = first;
      const shown = stableStringify(first);
      if (rest.some((value) => stableStringify(value) !== shown)) {
        group.mixedKeys.add(key);
      }
    }
  }
  return [...groups.values()];
};
