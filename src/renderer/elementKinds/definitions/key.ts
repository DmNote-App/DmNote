import { defineElementKind } from '../defineElementKind';

// 키 - 키 슬롯 하나를 누름 상태로 그린다
export const keyKind = defineElementKind({
  kind: 'key',
  version: 1,
  fields: [
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
  bundles: ['surface', 'font', 'image', 'note', 'counter', 'sound'],
  inputs: ['keySlot'],
  defaultSize: { width: 60, height: 60 },
  fallbackSize: { width: 60, height: 60 },
});
