import React from 'react';

import ListPopup from '@components/main/Modal/listPopup/ListPopup';
import { useTranslation } from '@contexts/useTranslation';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import {
  duplicateDocumentElement,
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
          if (id === 'delete') {
            useDocumentSelectionStore.getState().clear();
            void removeDocumentElements(sceneId, [target.id]);
          } else if (id === 'duplicate') {
            void duplicateDocumentElement(sceneId, target.id).then((copy) => {
              if (copy)
                useDocumentSelectionStore.getState().select(sceneId, copy);
            });
          } else if (id === 'bringToFront' || id === 'sendToBack') {
            void moveDocumentElementTo(
              sceneId,
              target.id,
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
