import { createElement } from 'react';

import { Key } from '@components/shared/key/LiveKey';
import type { KeySlot } from '@src/types/key/keys';
import { slotCanonical, slotDisplayName } from '@utils/keySlot';
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
    // 편집 화면은 옛 키 겉모습, 오버레이·OBS는 트리에서 옛 키를 그대로 그린다(키 이름·입력은 트리 입력 슬롯)
    render: KeyEditorFace as never,
    faceOwnsClassName: true,
    legacyOverlay: ({ position, context, element }) => {
      const slot = (
        element.input?.type === 'key' ? element.input.slot : ''
      ) as KeySlot;
      return createElement(Key, {
        position: position as never,
        keyName: slotDisplayName(slot),
        globalKey: slotCanonical(slot),
        mode: context.mode,
        counterEnabled: context.keyCounterEnabled,
      });
    },
  },
);
