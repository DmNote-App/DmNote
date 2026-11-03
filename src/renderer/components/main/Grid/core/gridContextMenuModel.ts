import type { ListItem } from '@components/main/Modal/listPopup/ListPopup';
import type { IndexedSelectableElementType } from '@stores/grid/useGridSelectionStore';
import { itemTypeForAddId } from './elementKindMenus';

type Translate = (key: string) => string;

/** 섞인 선택 메뉴 - 묶기·풀기는 트리 그룹 기준으로 정한 것 (documentGroupActions) */
export const buildMixedSelectionMenuItems = (
  groupActions: readonly ('group' | 'ungroup')[],
  t: Translate,
): ListItem[] => [
  { id: 'delete', label: t('contextMenu.deleteSelected') },
  { id: 'duplicate', label: t('contextMenu.duplicateSelected') },
  ...groupActions.map((action) =>
    action === 'group'
      ? { id: 'groupSelected', label: t('contextMenu.groupSelected') }
      : { id: 'ungroupSelected', label: t('contextMenu.ungroup') },
  ),
  { id: 'bringToFront', label: t('contextMenu.bringToFront') },
  { id: 'sendToBack', label: t('contextMenu.sendToBack') },
];

/** 고른 것 전체를 다루는 메뉴 - 누른 요소가 여럿 고른 것(트리 선택 + 런타임 요소 선택) 중 하나일 때 */
export const shouldOpenMixedSelectionMenu = (
  selectedIds: readonly string[],
  clickedId: string,
): boolean => selectedIds.length > 1 && selectedIds.includes(clickedId);

export const gridAddTypeForMenuItem = (
  id: string,
): IndexedSelectableElementType | null => {
  if (id === 'add') return 'key';
  return itemTypeForAddId(id);
};
