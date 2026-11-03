import { afterEach, describe, expect, it } from 'vitest';

import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import {
  beginPluginWork,
  notePluginFetchSettled,
  resetPluginRuntimeReadiness,
} from '../pluginRuntimeReadiness';
import { isKindResizable, pluginRendersKind } from './pluginKindPresence';

const ready = () => {
  resetPluginRuntimeReadiness();
  notePluginFetchSettled();
  notePluginFetchSettled();
};

describe('편집 화면의 플러그인 요소 그리기 주체', () => {
  afterEach(() => {
    resetPluginRuntimeReadiness();
    usePluginDisplayElementStore.setState({ definitions: new Map() });
  });

  it('플러그인을 불러오는 중에는 플러그인 렌더러 몫으로 둔다', () => {
    resetPluginRuntimeReadiness();
    expect(pluginRendersKind('plugin:demo')).toBe(true);
    ready();
    const end = beginPluginWork();
    expect(pluginRendersKind('plugin:demo')).toBe(true);
    end();
  });

  it('준비가 끝난 뒤 정의가 없는 플러그인(지움·끔)의 요소는 트리 편집기가 모르는 종류로 맡는다', () => {
    ready();
    expect(pluginRendersKind('plugin:demo')).toBe(false);
    usePluginDisplayElementStore.setState({
      definitions: new Map([['demo', { id: 'demo' } as never]]),
    });
    expect(pluginRendersKind('plugin:demo')).toBe(true);
    expect(pluginRendersKind('cursorTracker')).toBe(false);
  });
});

describe('편집 화면의 크기 조절 가능', () => {
  afterEach(() => {
    usePluginDisplayElementStore.setState({ definitions: new Map() });
  });

  it('플러그인 종류는 정의가 resizable일 때만, 정의가 없으면(모르는 종류) 된다, 나머지 종류는 된다', () => {
    usePluginDisplayElementStore.setState({
      definitions: new Map([
        ['fixed', { id: 'fixed', pluginId: 'fixed' } as never],
        ['free', { id: 'free', pluginId: 'free', resizable: true } as never],
      ]),
    });
    expect(isKindResizable('plugin:fixed')).toBe(false);
    expect(isKindResizable('plugin:free')).toBe(true);
    expect(isKindResizable('plugin:gone')).toBe(true);
    expect(isKindResizable('key')).toBe(true);
  });
});
