import { defineElementKind } from '../defineElementKind';
import KeyElementFace from './key/KeyElementFace';

// 키 - 키 슬롯 하나를 누름 상태로 그린다
export const keyKind = defineElementKind(
  {
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
  },
  {
    // 편집 화면은 편집 미리보기, 오버레이·OBS는 키 신호로 같은 겉모습 계산을 그린다 (키 이름·입력은 트리 입력 슬롯)
    render: KeyElementFace as never,
    faceOwnsClassName: true,
    placesItself: true,
  },
);
