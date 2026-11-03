import { describe, expect, it } from 'vitest';

import type { PanelSectionDecl } from '@src/renderer/elementKinds/defineElementKind';
import { panelTabsOf, sectionsOfTab, type Values } from './documentPanelModel';

const SECTIONS: PanelSectionDecl<Values>[] = [
  { common: 'geometry' },
  { bundle: 'surface' },
  { bundle: 'counter', tab: 'counter' },
  { bundle: 'note', tab: 'note', only: 'single' },
];

describe('선언 패널 탭', () => {
  it('섹션이 놓인 탭을 옛 패널 순서(스타일·노트·카운터)로 낸다', () => {
    expect(panelTabsOf(SECTIONS)).toEqual(['style', 'note', 'counter']);
  });

  it('하나·여럿 범위에 맞지 않는 섹션만 있는 탭은 빼고, 탭이 없는 섹션은 스타일', () => {
    expect(panelTabsOf(SECTIONS, true)).toEqual(['style', 'counter']);
    expect(panelTabsOf([{ common: 'geometry' }])).toEqual(['style']);
  });

  it('탭 하나의 섹션을 선언 순서대로 고른다', () => {
    expect(sectionsOfTab(SECTIONS, 'style')).toEqual([
      { common: 'geometry' },
      { bundle: 'surface' },
    ]);
    expect(sectionsOfTab(SECTIONS, 'note')).toEqual([
      { bundle: 'note', tab: 'note', only: 'single' },
    ]);
  });
});
