import { defineElementKind } from '../defineElementKind';

// 노브 - HID 축 값을 회전으로 그린다
export const knobKind = defineElementKind({
  kind: 'knob',
  version: 1,
  fields: [
    { name: 'sensitivity', value: { type: 'number', min: 0 }, default: 1 },
    { name: 'reverse', value: { type: 'bool' }, default: false },
  ],
  bundles: ['surface', 'image'],
  inputs: ['axis'],
  defaultSize: { width: 60, height: 60 },
  fallbackSize: { width: 60, height: 60 },
});
