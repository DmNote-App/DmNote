import { useKeyStore } from '@stores/data/useKeyStore';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { JsonValue } from '@src/types/generated/elementDocument';
import type { KeySlot } from '@src/types/key/keys';

/** 트리 키 요소의 입력 슬롯 - 키 입력이 아니면 null */
export const treeKeySlot = (element: ElementNode | undefined): KeySlot | null =>
  element?.input?.type === 'key' ? (element.input.slot as KeySlot) : null;

/** 키 슬롯 바꾸기 - 트리 입력 연산 하나 (트리 낙관 적용으로 바로 보이고, 백엔드가 옛 keys를 맞춘다).
 * 대상이 없거나 거부되면 false */
export const rebindKeySlotById = async (
  positionId: string,
  newSlot: KeySlot,
): Promise<boolean> => {
  const store = getElementDocumentStore();
  if (!store?.edit) return false;
  const current = useKeyStore.getState().selectedKeyType;
  const sceneId = store.getElement(current, positionId)
    ? current
    : store.getSceneIds().find((scene) => store.getElement(scene, positionId));
  if (!sceneId || store.getElement(sceneId, positionId)?.kind !== 'key') {
    return false;
  }
  const result = await store.edit([
    {
      op: 'setInput',
      scene: sceneId,
      id: positionId,
      input: { type: 'key', slot: newSlot as JsonValue },
    },
  ]);
  return result.status === 'committed';
};
