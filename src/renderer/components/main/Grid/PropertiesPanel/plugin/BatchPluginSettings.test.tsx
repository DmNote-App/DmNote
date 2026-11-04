// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  PluginDefinitionInternal,
  PluginPanelElementView,
} from '@src/types/plugin/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  flush: vi.fn(),
}));
vi.mock('@plugins/runtime/displayElement/pluginElementActions', () => ({
  updatePluginElement: mocks.update,
}));
vi.mock('@plugins/runtime/displayElement/instancesCommitQueue', () => ({
  flushPluginInstancesEditSession: mocks.flush,
}));

const { default: BatchPluginSettings } = await import('./BatchPluginSettings');
const { default: PluginSettingsForm } = await import('./PluginSettingsForm');
const { pluginSettingsGroups } = await import('./pluginSettingsGroups');

const timer = {
  id: 'timer',
  pluginId: 'timer-plugin',
  name: 'Timer',
  settings: {
    label: { type: 'string', default: '', label: 'Label' },
    size: { type: 'number', default: 10, label: 'Size' },
    hiddenOnly: {
      type: 'string',
      default: '',
      label: 'Hidden',
      visible: false,
    },
  },
} as unknown as PluginDefinitionInternal;
const hiddenOnly = {
  id: 'hidden',
  pluginId: 'hidden-plugin',
  name: 'Hidden',
  settings: {
    secret: { type: 'string', default: '', label: 'Secret', visible: false },
  },
} as unknown as PluginDefinitionInternal;

const element = (
  fullId: string,
  definitionId: string,
  settings: Record<string, unknown>,
) =>
  ({
    id: fullId,
    fullId,
    pluginId: definitionId,
    definitionId,
    position: { x: 0, y: 0 },
    settings,
  } as PluginPanelElementView);

const setInputValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('플러그인 요소 여럿의 설정 섹션', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.update.mockClear();
    mocks.flush.mockClear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const groups = pluginSettingsGroups(
      [
        element('timer::1', 'timer', { label: 'A' }),
        element('timer::2', 'timer', { label: 'B' }),
        element('hidden::1', 'hidden', {}),
      ],
      new Map([
        ['timer', timer],
        ['hidden', hiddenOnly],
      ]),
    );
    act(() => {
      root.render(
        <BatchPluginSettings
          groups={groups}
          reportNormalizationError={vi.fn()}
          renderPluginSettingsForm={(
            schema,
            values,
            messages,
            pluginId,
            colorIdPrefix,
            onChange,
            batch,
          ) => (
            <PluginSettingsForm
              schema={schema}
              values={values}
              batch={batch}
              messages={messages}
              pluginId={pluginId}
              colorIdPrefix={colorIdPrefix}
              onChange={onChange}
              locale="ko"
              panelElement={null}
              reportNormalizationError={vi.fn()}
              t={(key) => key}
            />
          )}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('정의마다 이름과 설정 칸 - 값이 다른 칸은 Mixed, 보일 칸이 없는 정의는 뺀다', () => {
    expect(host.textContent).toContain('Timer');
    expect(host.textContent).not.toContain('Hidden');
    const [label, size] = host.querySelectorAll('input');
    expect(label.value).toBe('');
    expect(label.placeholder).toBe('Mixed');
    expect(size.value).toBe('10');
  });

  it('고친 값은 그 정의의 고른 요소 모두에 쓰고, 포커스가 나가면 그 플러그인 편집을 확정한다', () => {
    const size = host.querySelectorAll('input')[1];
    act(() => {
      size.focus();
      setInputValue(size, '12');
      size.blur();
    });

    expect(mocks.update.mock.calls).toEqual([
      ['timer::1', { settings: { size: 12 } }],
      ['timer::2', { settings: { size: 12 } }],
    ]);
    expect(mocks.flush).toHaveBeenCalledWith('timer-plugin');
  });
});
