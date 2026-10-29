import React from 'react';

import ListPopup from '@components/main/Modal/listPopup/ListPopup';
import { useTranslation } from '@contexts/useTranslation';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import { duplicateDocumentSelection } from './documentClipboard';
import {
  moveDocumentElementTo,
  removeDocumentElements,
} from './documentEditActions';
import { useDocumentContextMenuStore } from './useDocumentContextMenuStore';
import { useDocumentSelectionStore } from './useDocumentSelectionStore';

/** 트리 요소 우클릭 메뉴 - 옛 종류 요소 메뉴와 같은 항목 이름 */
const DocumentContextMenu = () => {
  const { t } = useTranslation();
  const target = useDocumentContextMenuStore((state) => state.target);
  const close = useDocumentContextMenuStore((state) => state.close);
  const element = target
    ? getElementDocumentStore()?.getElement(target.sceneId, target.id)
    : undefined;
  const definition = element ? elementKindDefinition(element.kind) : undefined;
  const items = [
    {
      id: 'duplicate',
      label: t(definition?.duplicateLabel ?? 'contextMenu.duplicateSelected'),
    },
    {
      id: 'delete',
      label: t(definition?.deleteLabel ?? 'contextMenu.deleteSelected'),
    },
    { id: 'bringToFront', label: t('contextMenu.bringToFront') },
    { id: 'sendToBack', label: t('contextMenu.sendToBack') },
  ];
  return (
    <div className="relative">
      <ListPopup
        open={!!target && !!element}
        ariaLabel={t('common.more')}
        position={target ? { x: target.x, y: target.y } : undefined}
        onClose={close}
        items={items}
        onSelect={(id: string) => {
          if (!target) return;
          const { sceneId } = target;
          // 고른 요소를 우클릭하면 고른 것 전체에, 아니면 그 요소만 (옛 종류 메뉴와 같다)
          const selection = useDocumentSelectionStore.getState();
          const ids =
            selection.sceneId === sceneId &&
            selection.selectedIds.includes(target.id)
              ? selection.selectedIds
              : [target.id];
          if (id === 'delete') {
            selection.clear();
            void removeDocumentElements(sceneId, ids);
          } else if (id === 'duplicate') {
            if (ids.length === 1) selection.select(sceneId, target.id);
            void duplicateDocumentSelection(sceneId);
          } else if (id === 'bringToFront' || id === 'sendToBack') {
            void moveDocumentElementTo(
              sceneId,
              ids,
              id === 'bringToFront' ? 'front' : 'back',
            );
          }
          close();
        }}
      />
    </div>
  );
};

export default DocumentContextMenu;
