import { afterEach, describe, expect, it } from 'vitest';

import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import {
  beginPluginWork,
  notePluginFetchSettled,
  resetPluginRuntimeReadiness,
} from '../pluginRuntimeReadiness';
import { pluginRendersKind } from './pluginKindPresence';

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
