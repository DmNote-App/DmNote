import { defineElementKind } from '../defineElementKind';
import KeyEditorFace from './key/KeyEditorFace';

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
    // 편집 화면은 옛 키 겉모습 (오버레이·OBS 키는 아직 옛 배열)
    render: KeyEditorFace as never,
    faceOwnsClassName: true,
  },
);
