import { defineElementKind } from '../defineElementKind';

// 그래프 - 스탯 수치의 시간 흐름을 선·막대로 그린다
export const graphKind = defineElementKind({
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
});
