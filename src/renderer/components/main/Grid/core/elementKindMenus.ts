import { ITEM_ELEMENT_TYPES, type ItemElementType } from '@src/types/editor';
import { SPRITE_CREATION_ENABLED } from '@src/types/key/sprites';

// 키 외 종류별 편집 창 메뉴 정의 - 라벨은 i18n 키
interface ItemKindMenu {
  // 우클릭 그리드·툴바 추가 메뉴 id
  addId: string;
  gridAddLabel: string;
  toolbarAddLabel: string;
  deleteLabel: string;
  duplicateLabel: string;
  // 추가 메뉴 노출 여부
  creatable: boolean;
}

export const ITEM_KIND_MENUS: Record<ItemElementType, ItemKindMenu> = {
  stat: {
    addId: 'addStat',
    gridAddLabel: 'contextMenu.addStat',
    toolbarAddLabel: 'toolbar.addStat',
    deleteLabel: 'contextMenu.deleteStat',
    duplicateLabel: 'contextMenu.duplicateStat',
    creatable: true,
  },
  graph: {
    addId: 'addGraph',
    gridAddLabel: 'contextMenu.addGraph',
    toolbarAddLabel: 'toolbar.addGraph',
    deleteLabel: 'contextMenu.deleteGraph',
    duplicateLabel: 'contextMenu.duplicateGraph',
    creatable: true,
  },
  knob: {
    addId: 'addKnob',
    gridAddLabel: 'contextMenu.addKnob',
    toolbarAddLabel: 'toolbar.addKnob',
    deleteLabel: 'contextMenu.deleteKnob',
    duplicateLabel: 'contextMenu.duplicateKnob',
    creatable: true,
  },
  sprite: {
    addId: 'addSprite',
    gridAddLabel: 'contextMenu.addSprite',
    toolbarAddLabel: 'toolbar.addSprite',
    deleteLabel: 'contextMenu.deleteSprite',
    duplicateLabel: 'contextMenu.duplicateSprite',
    creatable: SPRITE_CREATION_ENABLED,
  },
};

// 추가 메뉴에 노출할 키 외 종류 (종류 순서)
export const CREATABLE_ITEM_TYPES = ITEM_ELEMENT_TYPES.filter(
  (type) => ITEM_KIND_MENUS[type].creatable,
);

export const itemTypeForAddId = (id: string): ItemElementType | null =>
  ITEM_ELEMENT_TYPES.find((type) => ITEM_KIND_MENUS[type].addId === id) ?? null;
