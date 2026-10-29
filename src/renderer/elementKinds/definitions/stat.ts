import OverlayStatItem from '@components/overlay/counters/OverlayStatItem';
import { defineElementKind } from '../defineElementKind';

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
    // 오버레이·OBS는 트리에서 옛 스탯을 그대로 그린다(바깥 카운터는 아직 옛 배열). 편집 화면은 옛 경로
    legacyOverlay: OverlayStatItem as never,
  },
);
