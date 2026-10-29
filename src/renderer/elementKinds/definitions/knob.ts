import { defineElementKind } from '../defineElementKind';

// 노브 - HID 축 값을 회전으로 그린다
export const knobKind = defineElementKind({
  kind: 'knob',
  version: 1,
  fields: [
    { name: 'sensitivity', value: { type: 'number', min: 0 }, default: 1 },
    { name: 'reverse', value: { type: 'bool' }, default: false },
  ],
  // 이미지 칸은 옛 칸(legacy.fields)에 있다 - 묶음으로 올리려면 종류 버전과 옮기기가 필요
  bundles: ['surface'],
  inputs: ['axis'],
  defaultSize: { width: 60, height: 60 },
  fallbackSize: { width: 60, height: 60 },
});
