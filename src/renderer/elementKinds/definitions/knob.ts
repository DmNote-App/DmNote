import { defineElementKind } from '../defineElementKind';
import { lazyPanelControl } from '../runtime/lazyPanelControl';
import KnobElementFace from './knob/KnobElementFace';

// 편집 화면 전용 입력 - 오버레이 번들에 넣지 않게 나중에 읽는다
const KnobAxisControl = lazyPanelControl(
  () => import('./knob/KnobAxisControl'),
);

const label = (name: string) => `propertiesPanel.${name}`;

// 노브 - HID 축 값을 회전으로 그린다
export const knobKind = defineElementKind(
  {
    kind: 'knob',
    version: 1,
    fields: [
      // 옛 모양이 받던 범위(유한한 수 - 음수 포함)
      { name: 'sensitivity', value: { type: 'number' }, default: 1 },
      { name: 'reverse', value: { type: 'bool' }, default: false },
    ],
    // 이미지 묶음 - 전에 저장한 노브의 이미지 칸은 읽을 때 옛 칸에서 올린다
    bundles: ['surface', 'image'],
    inputs: ['axis'],
    defaultSize: { width: 60, height: 60 },
    fallbackSize: { width: 60, height: 60 },
  },
  {
    // 편집 화면은 눌림 미리보기 상태, 오버레이·OBS는 축 입력으로 돌리는 같은 그리기
    render: KnobElementFace as never,
    placesItself: true,
    title: () => 'Knob',
    // 축 매핑이 위치·크기보다 위에 온다
    panel: [
      {
        rows: [
          {
            field: 'axisId',
            label: label('knobAxis'),
            control: { type: 'custom', component: KnobAxisControl },
            only: 'single',
          },
        ],
      },
      { common: 'geometry' },
      {
        rows: [
          {
            // 회전 배율: 1 = 물리 1회전당 화면 1회전 (축 해상도 무관). 화면 미리보기가 없어 입력 중 값은 패널에만
            field: 'sensitivity',
            label: label('knobSensitivity'),
            control: {
              type: 'number',
              min: 0,
              max: 100,
              decimalScale: 2,
              suffix: '×',
              draft: true,
            },
          },
          {
            field: 'reverse',
            label: label('knobReverse'),
            control: { type: 'toggle' },
          },
        ],
      },
      { bundle: 'surface' },
      { bundle: 'image' },
      { common: 'customCss' },
    ],
  },
);
