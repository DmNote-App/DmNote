// 플러그인 요소 종류 정의 - defineElement 설정 선언을 트리 종류 정의로 옮긴다 (플러그인 하나 = 종류 하나).
// 저장된 값을 다시 쓰거나 거부하지 않게 너그럽게: 값 칸은 검사 없는 json, 범위·선택지는 패널이 맡는다.
// 인스턴스 수 제한(maxInstances)은 메뉴의 막기로 남긴다 - 정의 제한은 이미 넘은 장면의 편집까지 막는다
import type { PluginSettingSchema } from '@src/types/plugin/api';
import type { KindSchema } from '@src/types/generated/elementDocument';
import { PLUGIN_KIND_PREFIX } from '@src/types/elementKinds';
import { isValueSetting } from '../settingsSections';

export const pluginKindName = (pluginId: string) =>
  `${PLUGIN_KIND_PREFIX}${pluginId}`;

// 크기를 모를 때 - 크기 조절 플러그인의 기본 크기와 같다 (측정 크기가 없는 인스턴스의 틀).
// 백엔드는 이 값을 뽑은 src-tauri/kinds/plugin-kind.json을 읽는다 (npm run kinds:extract)
export const PLUGIN_FALLBACK_SIZE = { width: 200, height: 150 };

export const pluginKindSchema = (
  pluginId: string,
  settings: Record<string, PluginSettingSchema> | undefined,
): KindSchema => ({
  kind: pluginKindName(pluginId),
  version: 1,
  fields: Object.entries(settings ?? {}).flatMap(([name, setting]) =>
    isValueSetting(setting)
      ? [
          {
            name,
            value: { type: 'json' },
            default: setting.default,
            nullable: true,
          },
        ]
      : [],
  ),
  bundles: [],
  inputs: [],
  defaultSize: PLUGIN_FALLBACK_SIZE,
  fallbackSize: PLUGIN_FALLBACK_SIZE,
  rotatable: false,
  migrations: [],
});
