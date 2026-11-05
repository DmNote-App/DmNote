import { describe, expect, it } from 'vitest';

import type {
  PluginDefinitionInternal,
  PluginPanelElementView,
} from '@src/types/plugin/api';
import { pluginSettingsGroups } from './pluginSettingsGroups';

const definition = (
  id: string,
  extra: Partial<PluginDefinitionInternal> = {},
): PluginDefinitionInternal =>
  ({
    id,
    pluginId: id,
    name: id.toUpperCase(),
    settings: {
      color: { type: 'color', default: '#FFFFFF', label: 'Color' },
      size: { type: 'number', default: 10, label: 'Size' },
      x: { type: 'section', label: 'Layout' },
    },
    ...extra,
  } as PluginDefinitionInternal);

const element = (
  fullId: string,
  definitionId: string,
  settings: Record<string, unknown> = {},
): PluginPanelElementView =>
  ({
    id: fullId,
    fullId,
    pluginId: definitionId,
    position: { x: 0, y: 0 },
    definitionId,
    settings,
  } as PluginPanelElementView);

describe('플러그인 요소 여럿의 설정 묶음', () => {
  const definitions = new Map([
    ['timer', definition('timer')],
    ['clock', definition('clock')],
    ['modal', definition('modal', { settingsUI: 'modal' })],
  ]);

  it('정의마다 하나 - 고른 순서, 기본값을 채운 값과 값이 다른 칸', () => {
    const groups = pluginSettingsGroups(
      [
        element('clock::1', 'clock', { size: 12 }),
        element('timer::1', 'timer', { color: '#000000', size: 10 }),
        element('timer::2', 'timer', { color: '#FF0000' }),
      ],
      definitions,
    );

    expect(groups.map(({ definition: { id } }) => id)).toEqual([
      'clock',
      'timer',
    ]);
    const [clock, timer] = groups;
    expect(clock.elements.map(({ fullId }) => fullId)).toEqual(['clock::1']);
    expect(clock.valuesList).toEqual([{ color: '#FFFFFF', size: 12 }]);
    expect([...clock.mixedKeys]).toEqual([]);
    expect(timer.valuesList).toEqual([
      { color: '#000000', size: 10 },
      { color: '#FF0000', size: 10 },
    ]);
    expect([...timer.mixedKeys]).toEqual(['color']);
  });

  it('보일 조건이 있는 칸은 그 칸이 보이는 요소끼리 - 보일 값·섞임·쓸 요소', () => {
    const modal = definition('modes', {
      settings: {
        mode: {
          type: 'select',
          default: 'a',
          label: 'Mode',
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
          ],
        },
        extra: {
          type: 'number',
          default: 0,
          label: 'Extra',
          visible: (values: Record<string, unknown>) => values.mode === 'b',
        },
      },
    } as Partial<PluginDefinitionInternal>);
    const [group] = pluginSettingsGroups(
      [
        element('modes::a', 'modes', { mode: 'a', extra: 1 }),
        element('modes::b', 'modes', { mode: 'b', extra: 5 }),
      ],
      new Map([['modes', modal]]),
    );
    // extra는 B에만 보인다 - B 값을 보이고 섞이지 않았으며 B에만 쓴다
    expect(group.displayValues).toMatchObject({ mode: 'a', extra: 5 });
    expect([...group.mixedKeys]).toEqual(['mode']);
    expect(group.ownersOf('extra').map(({ fullId }) => fullId)).toEqual([
      'modes::b',
    ]);
    expect(group.ownersOf('mode').map(({ fullId }) => fullId)).toEqual([
      'modes::a',
      'modes::b',
    ]);
  });

  it('설정 모달을 쓰는 정의·정의를 못 찾은 요소·설정 스키마가 없는 정의는 뺀다', () => {
    expect(
      pluginSettingsGroups(
        [
          element('modal::1', 'modal'),
          element('ghost::1', 'ghost'),
          element('plain::1', 'plain'),
        ],
        new Map([
          ...definitions,
          ['plain', definition('plain', { settings: undefined })],
        ]),
      ),
    ).toEqual([]);
  });
});
