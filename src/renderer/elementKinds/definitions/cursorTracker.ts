import CursorTrackerFace from '../cursorTracker/CursorTrackerFace';
import { defineElementKind } from '../defineElementKind';

// 커서 트래커 (이슈 #222) - 마우스 이동을 점과 궤적으로 그린다
// A(motion): 하드웨어 이동량 × 감도, 점이 중앙으로 돌아온다
// B(position): 모니터 영역을 패드에 대응, 비율 고정(모니터 비율) / 자유(늘려 채우기)
export const cursorTrackerKind = defineElementKind({
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
  label: 'elementKinds.cursorTracker.name',
  render: CursorTrackerFace,
});
