import { defineElementKind, type FieldDecl } from '../defineElementKind';

// 반응형 스프라이트 - 담당 키를 누르는 동안 자세가 바뀌는 이미지 레이어

const transformFields = [
  { name: 'x', value: { type: 'number', min: -2000, max: 2000 }, default: 0 },
  { name: 'y', value: { type: 'number', min: -2000, max: 2000 }, default: 0 },
  {
    name: 'rotation',
    value: { type: 'number', min: -180, max: 180 },
    default: 0,
  },
  { name: 'scale', value: { type: 'number', min: 0.1, max: 10 }, default: 1 },
] as const satisfies readonly FieldDecl[];

const anchorFields = [
  { name: 'x', value: { type: 'number', min: 0, max: 1 }, default: 0.5 },
  { name: 'y', value: { type: 'number', min: 0, max: 1 }, default: 0.5 },
] as const satisfies readonly FieldDecl[];

const imageMetricsFields = [
  { name: 'source', value: { type: 'string' }, default: '' },
  {
    name: 'width',
    value: { type: 'number', min: 1, max: 32768, integer: true },
    default: 1,
  },
  {
    name: 'height',
    value: { type: 'number', min: 1, max: 32768, integer: true },
    default: 1,
  },
] as const satisfies readonly FieldDecl[];

export const spriteKind = defineElementKind({
  kind: 'sprite',
  version: 1,
  fields: [
    {
      name: 'baseImage',
      value: { type: 'file', asset: 'image' },
      default: null,
      nullable: true,
    },
    {
      name: 'referenceNaturalSize',
      value: {
        type: 'object',
        fields: [
          {
            name: 'source',
            value: { type: 'string' },
            default: null,
            nullable: true,
          },
          {
            name: 'width',
            value: { type: 'number', min: 1, max: 32768, integer: true },
            default: 1,
          },
          {
            name: 'height',
            value: { type: 'number', min: 1, max: 32768, integer: true },
            default: 1,
          },
        ],
      },
      default: null,
      nullable: true,
    },
    {
      name: 'pivot',
      value: { type: 'object', fields: anchorFields },
      default: { x: 0.5, y: 0.5 },
    },
    {
      name: 'idleTransform',
      value: { type: 'object', fields: transformFields },
      default: { x: 0, y: 0, rotation: 0, scale: 1 },
    },
    {
      name: 'poses',
      value: {
        type: 'list',
        maxItems: 64,
        item: {
          type: 'object',
          fields: [
            { name: 'poseId', value: { type: 'id' }, default: '' },
            {
              name: 'name',
              value: { type: 'string' },
              default: null,
              nullable: true,
            },
            {
              name: 'triggers',
              value: {
                type: 'list',
                item: { type: 'elementRef', kinds: ['key'] },
                maxItems: 512,
                unique: true,
              },
              default: [],
            },
            {
              name: 'transform',
              value: { type: 'object', fields: transformFields },
              default: { x: 0, y: 0, rotation: 0, scale: 1 },
            },
            {
              name: 'pivot',
              value: { type: 'object', fields: anchorFields },
              default: null,
              nullable: true,
            },
            {
              name: 'imageOverride',
              value: { type: 'file', asset: 'image' },
              default: null,
              nullable: true,
            },
            {
              name: 'imageOverrideMetrics',
              value: { type: 'object', fields: imageMetricsFields },
              default: null,
              nullable: true,
            },
          ],
        },
      },
      default: [],
    },
    {
      name: 'activation',
      value: { type: 'enum', options: ['whileHeld', 'onPress'] },
      default: 'whileHeld',
    },
    {
      name: 'pressDurationMs',
      value: { type: 'number', min: 1, max: 5000, integer: true },
      default: 300,
    },
    {
      name: 'transitionMs',
      value: { type: 'number', min: 0, max: 1000, integer: true },
      default: 0,
    },
    {
      name: 'transitionEasing',
      value: { type: 'string' },
      default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  ],
  defaultSize: { width: 200, height: 200 },
  fallbackSize: { width: 200, height: 200 },
  rotatable: false,
});
