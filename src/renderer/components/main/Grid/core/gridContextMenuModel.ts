import type { ListItem } from '@components/main/Modal/listPopup/ListPopup';
import type {
  IndexedSelectableElementType,
  SelectedElement,
} from '@stores/grid/useGridSelectionStore';
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

export const shouldOpenMixedSelectionMenu = (
  selectedElements: readonly SelectedElement[],
  clickedId: string,
): boolean =>
  selectedElements.length > 1 &&
  selectedElements.some((element) => element.id === clickedId);

export const gridAddTypeForMenuItem = (
  id: string,
): IndexedSelectableElementType | null => {
  if (id === 'add') return 'key';
  return itemTypeForAddId(id);
};
