import { defineElementKind } from '../defineElementKind';
import { lazyPanelControl } from '../runtime/lazyPanelControl';
import KeyElementFace from './key/KeyElementFace';
import { keyTitleOf } from './key/keySlotInfo';

// 편집 화면 전용 섹션 - 오버레이 번들에 넣지 않게 나중에 읽는다
const KeySlotSection = lazyPanelControl(() => import('./key/KeySlotSection'));

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
    title: (_values, element) => keyTitleOf(element),
    // 옛 키 패널 배치 - 겉모습 묶음(표면·글자·이미지·사운드)은 옛 스타일 탭 부품 하나가 사용자 CSS를
    // 글자와 사운드 사이에 함께 그린다 (색 피커 하나를 같이 쓰고, 사운드를 열면 피커를 닫는다)
    panel: [
      { custom: KeySlotSection, only: 'single' },
      { common: 'geometry' },
      { bundle: 'surface' },
      { bundle: 'font' },
      { bundle: 'image' },
      { bundle: 'sound' },
      { common: 'customCss' },
      { bundle: 'note', tab: 'note' },
      { bundle: 'counter', tab: 'counter' },
    ],
  },
);
