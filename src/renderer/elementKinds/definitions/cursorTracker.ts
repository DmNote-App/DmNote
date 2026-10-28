import { lazy } from 'react';

import CursorTrackerFace from '../cursorTracker/CursorTrackerFace';
import { resolveMonitor } from '../cursorTracker/cursorTrackerMotion';
import { defineElementKind } from '../defineElementKind';
import { loadPointerMonitors } from '../runtime/pointerInput';

// 편집 화면 전용 입력 - 오버레이 번들에 넣지 않게 나중에 읽는다
const MonitorSelect = lazy(() => import('../cursorTracker/MonitorSelect'));

const motion = (values: { mode: string }) => values.mode === 'motion';
const position = (values: { mode: string }) => values.mode === 'position';
const label = (name: string) => `elementKinds.cursorTracker.${name}`;

// 커서 트래커 (이슈 #222) - 마우스 이동을 점과 궤적으로 그린다
// A(motion): 하드웨어 이동량 × 감도, 점이 중앙으로 돌아온다
// B(position): 모니터 영역을 패드에 대응, 비율 고정(모니터 비율) / 자유(늘려 채우기)
export const cursorTrackerKind = defineElementKind(
  {
    kind: 'cursorTracker',
    version: 1,
    fields: [
      {
        name: 'mode',
        value: { type: 'enum', options: ['motion', 'position'] },
        default: 'motion',
      },
      {
        name: 'sensitivity',
        value: { type: 'number', min: 0.1, max: 10 },
        default: 1,
      },
      {
        name: 'returnMs',
        value: { type: 'number', min: 0, max: 2000, integer: true },
        default: 150,
      },
      {
        name: 'aspect',
        value: { type: 'enum', options: ['locked', 'free'] },
        default: 'locked',
      },
      // 비어 있으면 주 모니터. 저장한 모니터가 없어도 주 모니터로 대체한다
      {
        name: 'monitor',
        value: { type: 'string' },
        default: null,
        nullable: true,
      },
      {
        name: 'trailMs',
        value: { type: 'number', min: 0, max: 2000, integer: true },
        default: 250,
      },
      {
        name: 'dotSize',
        value: { type: 'number', min: 1, max: 200 },
        default: 10,
      },
      { name: 'dotColor', value: { type: 'color' }, default: '#FFFFFF' },
      {
        name: 'trailColor',
        value: { type: 'color' },
        default: 'rgba(255, 255, 255, 0.5)',
      },
      {
        name: 'trailWidth',
        value: { type: 'number', min: 0, max: 50 },
        default: 3,
      },
    ],
    bundles: ['surface'],
    inputs: ['pointer'],
    defaultSize: { width: 120, height: 120 },
    fallbackSize: { width: 120, height: 120 },
  },
  {
    label: label('name'),
    addLabel: label('add'),
    deleteLabel: label('delete'),
    duplicateLabel: label('duplicate'),
    render: CursorTrackerFace,
    // 화면 위치 + 비율 고정이면 패드 크기를 모니터 비율로 잠근다
    lockAspect: (values) =>
      values.mode === 'position' && values.aspect === 'locked',
    adjustFrame: async (values, frame) => {
      if (values.mode !== 'position' || values.aspect !== 'locked') return null;
      const monitor = resolveMonitor(
        await loadPointerMonitors(),
        values.monitor,
      );
      if (!monitor || monitor.width <= 0) return null;
      return {
        height: Math.round((frame.width * monitor.height) / monitor.width),
      };
    },
    panel: [
      {
        rows: [
          {
            field: 'mode',
            label: label('mode'),
            control: {
              type: 'select',
              options: [
                { value: 'motion', label: label('modeMotion') },
                { value: 'position', label: label('modePosition') },
              ],
            },
          },
          {
            field: 'sensitivity',
            label: label('sensitivity'),
            control: {
              type: 'number',
              min: 0.1,
              max: 10,
              suffix: '×',
              decimalScale: 2,
            },
            visible: motion,
          },
          {
            field: 'returnMs',
            label: label('returnMs'),
            control: { type: 'number', min: 0, max: 2000, suffix: 'ms' },
            visible: motion,
          },
          {
            field: 'aspect',
            label: label('aspect'),
            control: {
              type: 'select',
              options: [
                { value: 'locked', label: label('aspectLocked') },
                { value: 'free', label: label('aspectFree') },
              ],
            },
            visible: position,
          },
          {
            field: 'monitor',
            label: label('monitor'),
            control: { type: 'custom', component: MonitorSelect },
            visible: position,
          },
        ],
      },
      { common: 'geometry' },
      {
        rows: [
          {
            field: 'dotSize',
            label: label('dotSize'),
            control: { type: 'number', min: 1, max: 200, suffix: 'px' },
          },
          {
            field: 'dotColor',
            label: label('dotColor'),
            control: { type: 'color' },
          },
        ],
      },
      {
        rows: [
          {
            field: 'trailMs',
            label: label('trailMs'),
            control: { type: 'number', min: 0, max: 2000, suffix: 'ms' },
          },
          {
            field: 'trailColor',
            label: label('trailColor'),
            control: { type: 'color' },
          },
          {
            field: 'trailWidth',
            label: label('trailWidth'),
            control: { type: 'number', min: 0, max: 50, suffix: 'px' },
          },
        ],
      },
      { bundle: 'surface' },
    ],
  },
);
