import { getStatTypeLabel } from '@utils/grid/statTypeLabel';
import { defineElementKind } from '../defineElementKind';
import { lazyPanelControl } from '../runtime/lazyPanelControl';
import StatElementFace from './stat/StatElementFace';

// 편집 화면 전용 섹션 - 오버레이 번들에 넣지 않게 나중에 읽는다
const StatTypeSection = lazyPanelControl(
  () => import('./stat/StatTypeSection'),
);

// 스탯 - KPS·누적 수치를 글자로 그린다
export const statKind = defineElementKind(
  {
    kind: 'stat',
    version: 1,
    fields: [
      {
        name: 'statType',
        value: { type: 'enum', options: ['kps', 'kpsAvg', 'kpsMax', 'total'] },
        default: 'kps',
      },
      {
        name: 'displayText',
        value: { type: 'string' },
        default: null,
        nullable: true,
      },
      {
        name: 'count',
        value: { type: 'number', min: 0, integer: true },
        default: 0,
      },
    ],
    bundles: ['surface', 'font', 'image', 'counter'],
    defaultSize: { width: 60, height: 60 },
    fallbackSize: { width: 60, height: 60 },
  },
  {
    // 편집 화면은 편집 미리보기, 오버레이·OBS는 수치 신호로 같은 겉모습 계산을 그린다 (바깥 카운터는 카운터 층)
    render: StatElementFace as never,
    faceOwnsClassName: true,
    placesItself: true,
    title: (values) => getStatTypeLabel(values.statType),
    // 옛 스탯 패널 배치 - 겉모습 묶음은 옛 스타일 탭 부품 하나가 사용자 CSS와 함께 그린다
    panel: [
      { custom: StatTypeSection, only: 'single' },
      { common: 'geometry' },
      { bundle: 'surface' },
      { bundle: 'font' },
      { bundle: 'image' },
      { common: 'customCss' },
      { bundle: 'counter', tab: 'counter' },
    ],
  },
);
