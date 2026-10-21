import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@contexts/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@hooks/useIconMotion', () => ({
  useIconMotion: () => ({ motionProps: {} }),
}));
vi.mock('@api/modules/editor/keysApi', () => ({
  keysApi: { tabs: { swap: vi.fn(() => Promise.resolve({})) } },
}));
vi.mock('@hooks/useLenis', () => ({ scrollLenisBy: vi.fn() }));
vi.mock('./icons/TabGridIcon', () => ({ default: () => null }));
vi.mock('../Modal/floatingPopup/FloatingPopup', () => ({
  default: () => null,
}));
vi.mock('../Modal/content/settings/TabList', () => ({ default: () => null }));
vi.mock('../Modal/tooltip/FloatingTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../Modal/tooltip/TooltipGroup', () => ({
  TooltipGroup: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../Modal/listPopup/ListPopup', () => ({ default: () => null }));
vi.mock('./tabActions', () => ({
  TabActionsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./tabActionsContext', () => ({
  useTabActions: () => ({ requestRename: vi.fn(), requestDelete: vi.fn() }),
}));

import TabTool from './TabTool';
import { useKeyStore } from '@stores/data/useKeyStore';

describe('TabTool 접근성 이름', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useKeyStore.setState({
      customTabs: [],
      tabOrder: ['4key', '5key', '6key', '8key'],
      barCount: 4,
      selectedKeyType: '4key',
      isBootstrapped: true,
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('커스텀 레이아웃 아이콘 버튼에 번역된 이름과 힌트를 제공한다', () => {
    act(() => root.render(<TabTool />));

    const button = host.querySelector<HTMLButtonElement>(
      '[aria-label="tabs.title"]',
    );
    expect(button).not.toBeNull();
    expect(button?.title).toBe('tabs.title');
  });
});
