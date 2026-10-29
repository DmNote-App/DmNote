import React from 'react';

import ListPopup from '@components/main/Modal/listPopup/ListPopup';
import { useTranslation } from '@contexts/useTranslation';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import { duplicateDocumentSelection } from './documentClipboard';
import {
  groupDocumentElements,
  moveDocumentElementTo,
  removeDocumentElements,
  ungroupDocumentElements,
} from './documentEditActions';
import { documentGroupRoots, documentGroupsOf } from './documentGroups';
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
  // 고른 요소를 우클릭하면 고른 것 전체에, 아니면 그 요소만 (옛 종류 메뉴와 같다)
  const selectedSceneId = useDocumentSelectionStore((state) => state.sceneId);
  const selectedIds = useDocumentSelectionStore((state) => state.selectedIds);
  const ids =
    target &&
    selectedSceneId === target.sceneId &&
    selectedIds.includes(target.id)
      ? selectedIds
      : target
      ? [target.id]
      : [];
  const scene = target
    ? getElementDocumentStore()?.getScene(target.sceneId)
    : undefined;
  // 둘 이상이면 묶기·풀기 - 모두 한 그룹이면 풀기만, 아무 그룹도 아니면 묶기만
  const groupItems = (() => {
    if (ids.length < 2) return [];
    const groups = documentGroupsOf(scene, ids);
    const roots = documentGroupRoots(scene, ids);
    const group = {
      id: 'groupSelected',
      label: t('contextMenu.groupSelected'),
    };
    const ungroup = { id: 'ungroupSelected', label: t('contextMenu.ungroup') };
    if (groups.length === 0) return [group];
    if (groups.length === 1 && roots.length === 1 && roots[0] === groups[0]) {
      return [ungroup];
    }
    return [group, ungroup];
  })();
  const items = [
    {
      id: 'delete',
      label: t(definition?.deleteLabel ?? 'contextMenu.deleteSelected'),
    },
    {
      id: 'duplicate',
      label: t(definition?.duplicateLabel ?? 'contextMenu.duplicateSelected'),
    },
    ...groupItems,
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
            void removeDocumentElements(sceneId, ids);
          } else if (id === 'duplicate') {
            if (ids.length === 1)
              useDocumentSelectionStore.getState().select(sceneId, target.id);
            void duplicateDocumentSelection(sceneId);
          } else if (id === 'groupSelected') {
            void groupDocumentElements(
              sceneId,
              ids,
              t('layerGroup.newGroup') || 'New Group',
            );
          } else if (id === 'ungroupSelected') {
            void ungroupDocumentElements(sceneId, ids);
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
