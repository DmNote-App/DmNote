import OverlayGraphItem from '@components/overlay/counters/OverlayGraphItem';
import { defineElementKind } from '../defineElementKind';
import GraphEditorFace from './graph/GraphEditorFace';

// 그래프 - 스탯 수치의 시간 흐름을 선·막대로 그린다
export const graphKind = defineElementKind(
  {
    kind: 'graph',
    version: 1,
    fields: [
      {
        name: 'statType',
        value: { type: 'enum', options: ['kps', 'kpsAvg', 'kpsMax', 'total'] },
        default: 'kps',
      },
      {
        name: 'graphType',
        value: { type: 'enum', options: ['line', 'bar'] },
        default: 'line',
      },
      {
        name: 'graphSpeed',
        value: { type: 'number', min: 500, max: 60000, integer: true },
        default: 1000,
      },
      { name: 'graphColor', value: { type: 'color' }, default: '#86EFAC' },
      { name: 'showAvgLine', value: { type: 'bool' }, default: true },
      {
        name: 'graphAnimationEnabled',
        value: { type: 'bool' },
        default: null,
        nullable: true,
      },
    ],
    bundles: ['surface'],
    defaultSize: { width: 120, height: 60 },
    fallbackSize: { width: 200, height: 100 },
  },
  {
    // 편집 화면은 옛 그래프 겉모습, 오버레이·OBS는 트리에서 옛 그래프를 그대로 그린다
    render: GraphEditorFace as never,
    legacyOverlay: OverlayGraphItem as never,
  },
);
