import OverlayKnobItem from '@components/overlay/counters/OverlayKnobItem';
import { defineElementKind } from '../defineElementKind';
import KnobEditorFace from './knob/KnobEditorFace';

// 노브 - HID 축 값을 회전으로 그린다
export const knobKind = defineElementKind(
  {
    kind: 'knob',
    version: 1,
    fields: [
      { name: 'sensitivity', value: { type: 'number', min: 0 }, default: 1 },
      { name: 'reverse', value: { type: 'bool' }, default: false },
    ],
    // 이미지 묶음 - 전에 저장한 노브의 이미지 칸은 읽을 때 옛 칸에서 올린다
    bundles: ['surface', 'image'],
    inputs: ['axis'],
    defaultSize: { width: 60, height: 60 },
    fallbackSize: { width: 60, height: 60 },
  },
  {
    // 편집 화면은 옛 노브 겉모습, 오버레이·OBS는 옛 노브(축 입력·회전)를 트리에서 그대로 그린다
    render: KnobEditorFace as never,
    legacyOverlay: OverlayKnobItem as never,
  },
);
