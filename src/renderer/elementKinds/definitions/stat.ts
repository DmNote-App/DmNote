import { defineElementKind } from '../defineElementKind';

// 스탯 - KPS·누적 수치를 글자로 그린다
export const statKind = defineElementKind({
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
});
