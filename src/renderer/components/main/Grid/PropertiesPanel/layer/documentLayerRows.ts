import type { DocumentElementSlot } from '@src/renderer/elementKinds/runtime/documentElementOrder';
import type { DisplayItem } from '../types';

export interface DocumentLayerPlacement {
  // 이 표시 순번의 옛 행 바로 앞(위)에 둘 트리 요소
  before: Map<number, DocumentElementSlot[]>;
  // 목록 맨 끝(가장 아래)
  after: DocumentElementSlot[];
}

/**
 * 트리 문서에만 있는 요소를 레이어 목록(위→아래)의 겹침 순서 자리에 끼운다.
 * 옛 행 목록은 그대로 두고 그릴 때만 섞는다 - 끌어서 순서 바꾸기는 아직 옛 종류 전용
 */
export function placeDocumentLayerRows(
  displayItems: readonly DisplayItem[],
  slots: readonly DocumentElementSlot[],
): DocumentLayerPlacement {
  const groupTop = new Map<string, number>();
  for (const item of displayItems) {
    if (item.displayType !== 'layer' || !item.item.groupId) continue;
    const current = groupTop.get(item.item.groupId) ?? -Infinity;
    groupTop.set(item.item.groupId, Math.max(current, item.item.zIndex));
  }
  // 위쪽 행부터 보며 처음으로 자기보다 낮은 행 앞에 놓는다. 같은 z면 옛 요소 위
  const topLevel = displayItems.flatMap((item, index) => {
    if (item.displayType === 'group-header') {
      return [{ index, zIndex: groupTop.get(item.groupId) ?? -Infinity }];
    }
    return item.groupDepth === 0 ? [{ index, zIndex: item.item.zIndex }] : [];
  });
  const before = new Map<number, DocumentElementSlot[]>();
  const after: DocumentElementSlot[] = [];
  // 위→아래로 그리므로 트리 순서(아래→위)를 뒤집는다
  for (const slot of [...slots].reverse()) {
    const target = slot.aboveLegacy
      ? topLevel.find((entry) => entry.zIndex <= slot.zIndex)
      : undefined;
    if (!target) {
      after.push(slot);
      continue;
    }
    const list = before.get(target.index) ?? [];
    list.push(slot);
    before.set(target.index, list);
  }
  return { before, after };
}
