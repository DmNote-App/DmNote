import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { KeySlot } from '@src/types/key/keys';
import { getKeyInfoByGlobalKey, type KeyInfo } from '@utils/input/KeyMaps';
import { slotCanonical, slotDisplayName } from '@utils/keySlot';

/** 키 요소의 입력 슬롯 - 키 입력이 아니면 null */
export const keySlotOf = (element: ElementNode | undefined): KeySlot | null =>
  element?.input?.type === 'key' ? (element.input.slot as KeySlot) : null;

/** 슬롯의 이름 정보 - 키 하나면 키 표, 여러 키면 슬롯 이름 (비면 null) */
export const keySlotInfoOf = (slot: KeySlot | null): KeyInfo | null => {
  if (slot == null) return null;
  const code = slotCanonical(slot);
  if (!code) return null;
  return typeof slot === 'string'
    ? getKeyInfoByGlobalKey(slot)
    : { browserKey: code, globalKey: code, displayName: slotDisplayName(slot) };
};

/** 키 패널 제목 - 슬롯 이름, 없으면 슬롯 코드, 없으면 Key */
export const keyTitleOf = (element: ElementNode): string => {
  const slot = keySlotOf(element);
  return (
    keySlotInfoOf(slot)?.displayName ||
    (slot != null ? slotCanonical(slot) : '') ||
    'Key'
  );
};
