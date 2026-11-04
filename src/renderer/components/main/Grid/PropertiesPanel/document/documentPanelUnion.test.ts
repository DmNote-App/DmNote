import { describe, expect, it } from 'vitest';

import { BUILTIN_ELEMENT_KINDS } from '@src/renderer/elementKinds/builtinKinds';
import type { BundleName } from '@src/renderer/elementKinds/defineElementKind';
import { supportsActiveVisualState } from '@stores/grid/useGradientEditStore';
import {
  canEditBundleField,
  unionBatchSections,
  unionBatchTabs,
} from './documentPanelUnion';

// 섹션 이름:가진 종류 - 칸 묶음은 그 종류의 칸 이름
const layout = (kinds: readonly string[]) =>
  unionBatchSections(kinds).map(({ section, kinds: owners }) => {
    const name =
      'common' in section
        ? section.common
        : 'bundle' in section
        ? section.bundle
        : 'rows' in section
        ? `[${section.rows.map((row) => row.field).join(',')}]`
        : 'custom';
    return `${name}${section.tab ? `@${section.tab}` : ''}:${owners.join('+')}`;
  });

const KEY_STAT = [
  'custom:key',
  'custom:stat',
  'geometry:key+stat',
  'surface:key+stat',
  'font:key+stat',
  'image:key+stat',
  'sound:key',
  'customCss:key+stat',
  'note@note:key',
  'counter@counter:key+stat',
];

describe('고른 종류들의 일괄 패널 합', () => {
  it('섹션은 종류 순서(키·스탯·그래프·노브·스프라이트)로 합친다 - 고른 순서와 상관없다', () => {
    expect(layout(['key', 'stat'])).toEqual(KEY_STAT);
    expect(layout(['stat', 'key'])).toEqual(KEY_STAT);
  });

  it('하나에만 쓰는 섹션은 빼고, 여럿에만 쓰는 섹션은 넣는다 (스프라이트 - 이미지 카드·위치·크기·기준점과 반응)', () => {
    expect(layout(['sprite'])).toEqual([
      'custom:sprite',
      'geometry:sprite',
      'custom:sprite',
    ]);
  });

  it('다음 섹션이 없는 고유 섹션은 그 종류의 앞 섹션 뒤 - 끝(사용자 CSS·탭 뒤)으로 밀리지 않는다', () => {
    expect(layout(['key', 'sprite'])).toEqual([
      'custom:key',
      'custom:sprite',
      'geometry:key+sprite',
      'custom:sprite',
      'surface:key',
      'font:key',
      'image:key',
      'sound:key',
      'customCss:key',
      'note@note:key',
      'counter@counter:key',
    ]);
    // 앞선 종류(그래프)가 위치·크기 뒤에 붙인 고유 섹션 다음 - 종류 순서
    expect(layout(['sprite', 'graph', 'key'])).toEqual([
      'custom:key',
      'custom:sprite',
      'geometry:key+graph+sprite',
      '[graphType,showAvgLine,graphSpeed,graphColor,graphAnimationEnabled]:graph',
      'custom:sprite',
      'surface:key+graph',
      'font:key',
      'image:key+graph',
      'sound:key',
      'customCss:key+graph',
      'note@note:key',
      'counter@counter:key',
    ]);
  });

  it('한 종류에만 있는 칸 묶음은 그 종류의 다음 공유 섹션 바로 앞에 (노브 칸은 위치·크기 아래)', () => {
    expect(layout(['key', 'knob'])).toEqual([
      'custom:key',
      '[axisId]:knob',
      'geometry:key+knob',
      '[sensitivity,reverse]:knob',
      'surface:key+knob',
      'font:key',
      'image:key+knob',
      'sound:key',
      'customCss:key+knob',
      'note@note:key',
      'counter@counter:key',
    ]);
    expect(layout(['knob', 'graph'])).toEqual([
      '[axisId]:knob',
      'geometry:graph+knob',
      '[graphType,showAvgLine,graphSpeed,graphColor,graphAnimationEnabled]:graph',
      '[sensitivity,reverse]:knob',
      'surface:graph+knob',
      'image:graph+knob',
      'customCss:graph+knob',
    ]);
  });

  it('탭은 합친 섹션이 놓인 탭 - 탭 순서대로', () => {
    expect(unionBatchTabs(['key', 'stat'])).toEqual([
      'style',
      'note',
      'counter',
    ]);
    expect(unionBatchTabs(['key', 'sprite'])).toEqual([
      'style',
      'note',
      'counter',
    ]);
    expect(unionBatchTabs(['stat', 'sprite'])).toEqual(['style', 'counter']);
    expect(unionBatchTabs(['graph', 'knob'])).toEqual(['style']);
  });
});

describe('기능 묶음 칸을 고칠 수 있는 종류', () => {
  const owners = (
    bundle: BundleName,
    options?: { active?: boolean; shadow?: boolean },
  ) =>
    ['key', 'stat', 'graph', 'knob', 'sprite'].filter((kind) =>
      canEditBundleField(kind, bundle, options),
    );

  it('눌림 그림은 정의의 선언 - 옛 눌림 판정(supportsActiveVisualState)과 같다', () => {
    for (const { kind } of BUILTIN_ELEMENT_KINDS) {
      expect(canEditBundleField(kind, 'surface', { active: true }), kind).toBe(
        supportsActiveVisualState(kind),
      );
    }
  });

  // 옛 일괄 패널의 종류 거르기와 같은 집합
  it('겉모습 칠 - 대기는 표면이 있는 종류, 눌림은 눌림 그림이 있는 종류 (paintRelevantTargets)', () => {
    expect(owners('surface')).toEqual(['key', 'stat', 'graph', 'knob']);
    expect(owners('surface', { active: true })).toEqual(['key', 'knob']);
  });

  it('글자 칠 - 대기는 키·스탯, 눌림은 키 (paintRelevantTargets)', () => {
    expect(owners('font')).toEqual(['key', 'stat']);
    expect(owners('font', { active: true })).toEqual(['key']);
  });

  it('그림자 - 그래프는 그리지 않고, 눌림 그림자는 키·노브 (createShadowCommitHandler)', () => {
    expect(owners('surface', { shadow: true })).toEqual([
      'key',
      'stat',
      'knob',
    ]);
    expect(owners('surface', { shadow: true, active: true })).toEqual([
      'key',
      'knob',
    ]);
  });

  it('이미지 - 눌림 이미지·투명은 키·노브', () => {
    expect(owners('image')).toEqual(['key', 'stat', 'graph', 'knob']);
    expect(owners('image', { active: true })).toEqual(['key', 'knob']);
  });

  it('사운드·노트는 키, 카운터는 키·스탯이고 눌림 카운터 채움은 키', () => {
    expect(owners('sound')).toEqual(['key']);
    expect(owners('note')).toEqual(['key']);
    expect(owners('counter')).toEqual(['key', 'stat']);
    expect(owners('counter', { active: true })).toEqual(['key']);
  });
});
