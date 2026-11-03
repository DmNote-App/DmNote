import { defineElementKind } from '../defineElementKind';
import KnobElementFace from './knob/KnobElementFace';

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
  },
);
