import { getStatTypeLabel } from '@utils/grid/statTypeLabel';
import { defineElementKind } from '../defineElementKind';
import GraphFace from './graph/GraphFace';

const label = (name: string) => `propertiesPanel.${name}`;

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
        // 옛 모양이 받던 범위(u32) - 패널은 500~60000으로 맞춘다
        value: { type: 'number', min: 0, max: 4294967295, integer: true },
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
    bundles: ['surface', 'image'],
    defaultSize: { width: 120, height: 60 },
    fallbackSize: { width: 200, height: 100 },
  },
  {
    // 편집 화면은 고정 미리보기 기록, 오버레이·OBS는 스탯 신호로 쌓은 기록을 같은 그리기로 그린다
    render: GraphFace as never,
    surfaceShadow: false,
    faceOwnsClassName: true,
    placesItself: true,
    title: (values) => `${getStatTypeLabel(values.statType)} Graph`,
    panel: [
      { common: 'geometry' },
      {
        rows: [
          {
            field: 'graphType',
            label: label('graphShape'),
            control: {
              type: 'select',
              options: [
                { value: 'line', label: label('graphShapeLine') },
                { value: 'bar', label: label('graphShapeBar') },
              ],
            },
          },
          {
            field: 'showAvgLine',
            label: label('graphShowAverageLine'),
            control: { type: 'toggle', nullValue: true },
            visible: (values) => values.graphType === 'line',
          },
          {
            field: 'graphSpeed',
            label: label('graphSpeed'),
            control: {
              type: 'number',
              min: 500,
              max: 60000,
              snap: 100,
              suffix: 'ms',
              width: '62px',
              fallback: 1000,
            },
          },
          {
            field: 'graphColor',
            label: label('graphColor'),
            control: { type: 'color', fallback: '#86EFAC', preview: true },
          },
          {
            field: 'graphAnimationEnabled',
            label: label('graphAnimation'),
            control: { type: 'toggle', nullValue: true },
          },
        ],
      },
      { bundle: 'surface' },
      { bundle: 'image' },
      { common: 'customCss' },
    ],
  },
);
