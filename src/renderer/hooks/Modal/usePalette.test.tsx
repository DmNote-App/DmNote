// @vitest-environment jsdom
import React, { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@stores/useSettingsStore';
import { usePalette } from './usePalette';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  get: vi.fn(),
  alert: vi.fn(),
}));
vi.mock('@api/modules/app/settingsApi', () => ({ settingsApi: mocks }));
vi.mock('@contexts/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('배경색 저장 실패 복원', () => {
  let root: Root;
  let host: HTMLDivElement;
  let palette: ReturnType<typeof usePalette>;
  const previousApi = window.api;
  const Harness = () => {
    const value = usePalette();
    useLayoutEffect(() => {
      palette = value;
    }, [value]);
    return null;
  };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.update.mockReset();
    mocks.get.mockReset().mockResolvedValue({ backgroundColor: '#111111' });
    mocks.alert.mockReset().mockResolvedValue(undefined);
    window.api = { ui: { dialog: { alert: mocks.alert } } } as never;
    useSettingsStore.setState({ backgroundColor: '#111111' });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    window.api = previousApi;
    vi.restoreAllMocks();
  });

  it('화면만 저장값으로 복원하고 팝업을 다시 열어도 초안과 오류를 유지한다', async () => {
    mocks.update.mockRejectedValue(new Error('disk full'));
    await act(async () => palette.handleColorChange('#222222'));

    expect(useSettingsStore.getState().backgroundColor).toBe('#111111');
    expect(palette.color).toBe('#222222');
    expect(palette.saveError).toBe('common.saveFailed');
    expect(palette.isSaving).toBe(false);
    expect(mocks.alert).not.toHaveBeenCalled();
    act(() => palette.setPalette(true));
    act(() => palette.handlePaletteClose());
    act(() => palette.setPalette(true));
    expect(palette.color).toBe('#222222');
    expect(palette.saveError).toBe('common.saveFailed');
  });

  it('쓰기 복구 후 같은 초안을 재시도하고 이후 외부 변경을 반영한다', async () => {
    mocks.update
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue({});
    await act(async () => palette.handleColorChange('#222222'));
    await act(async () => palette.handleColorChange(palette.color));

    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenLastCalledWith({
      backgroundColor: '#222222',
    });
    expect(useSettingsStore.getState().backgroundColor).toBe('#222222');
    expect(palette.saveError).toBeNull();
    expect(palette.isSaving).toBe(false);
    act(() => useSettingsStore.getState().setBackgroundColor('#555555'));
    expect(palette.color).toBe('#555555');
  });

  it('이전 저장 실패가 나중에 선택한 배경색을 덮지 않는다', async () => {
    let rejectFirst!: (error: Error) => void;
    mocks.update
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValue({ backgroundColor: '#333333' });
    act(() => palette.handleColorChange('#222222'));
    await act(async () => palette.handleColorChange('#333333'));
    await act(async () => rejectFirst(new Error('old write failed')));

    expect(useSettingsStore.getState().backgroundColor).toBe('#333333');
    expect(palette.color).toBe('#333333');
    expect(palette.saveError).toBeNull();
  });

  it('저장값 재조회 중 도착한 외부 배경색을 덮지 않는다', async () => {
    let finishRead!: (value: { backgroundColor: string }) => void;
    mocks.update.mockRejectedValue(new Error('disk full'));
    mocks.get.mockReturnValue(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    await act(async () => palette.handleColorChange('#222222'));
    act(() => useSettingsStore.getState().setBackgroundColor('#444444'));
    await act(async () => finishRead({ backgroundColor: '#111111' }));

    expect(useSettingsStore.getState().backgroundColor).toBe('#444444');
    expect(palette.color).toBe('#222222');
  });
});
