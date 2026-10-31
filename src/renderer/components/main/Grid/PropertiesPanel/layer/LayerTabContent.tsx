import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTranslation } from '@contexts/useTranslation';
import { usePopupPresence } from '@hooks/ui/usePopupPresence';
import { useRetainedWhileOpen } from '@hooks/ui/useRetainedValue';
import { useLenis } from '@hooks/useLenis';
import { usePanelHost } from '@contexts/PanelHostContext';
import { treePanelRecords } from '@src/renderer/elementKinds/runtime/treePanelRecords';
import ListPopup, {
  type ListItem,
} from '@components/main/Modal/listPopup/ListPopup';
import { useKeyStore } from '@stores/data/useKeyStore';
import {
  selectPropertyPanelPluginElements,
  usePluginDisplayElementStore,
} from '@stores/plugin/usePluginDisplayElementStore';
import { isMac } from '@utils/core/platform';
import { useElementDocumentScene } from '@src/renderer/editor/document/elementDocumentRuntime';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import { setPluginElementHiddenInTree } from '@plugins/runtime/displayElement/pluginTreeGeometry';
import { reportElementOpError } from '@src/renderer/editor/runtime/intent/elementIntent';
import { isPluginKind } from '@src/types/elementKinds';
import type { Node } from '@src/types/generated/elementDocument';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import {
  editDocument,
  groupDocumentElements,
  setDocumentCommon,
} from '../../document/documentEditActions';
import {
  documentGroupActions,
  documentGroupRoots,
} from '../../document/documentGroups';
import { deleteStructureSelection } from '../../document/deleteStructureSelection';
import { toggleDocumentId } from '../../document/documentSelection';
import {
  setStructureSelection,
  structureTargetIds,
} from '../../document/treeEditedSelection';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import {
  documentDropMove,
  documentLayerRows,
  layerRowIndent,
  type DocumentLayerRowModel,
} from './documentLayerModel';
import { buildLayerLabels } from './layerPanelModel';
import { slotDisplayName } from '@utils/keySlot';
import { treeKeySlot } from '@src/renderer/editor/runtime/operations/keySlotOps';
import {
  LayerElementRow,
  LayerGroupRow,
  type LayerRowRename,
} from './LayerRows';
import { useLayerCollapseStore } from './useLayerCollapseStore';

// 끌기로 보지 않는 움직임 (화면 px)
const DRAG_THRESHOLD = 4;
const EMPTY_IDS: string[] = [];

type DropPosition = 'above' | 'below' | 'into';

interface DropTarget {
  index: number;
  position: DropPosition;
}

interface ContextMenuState {
  row: DocumentLayerRowModel;
  x: number;
  y: number;
}

const elementIdsOf = (node: Node): string[] =>
  node.type === 'group' ? node.children.flatMap(elementIdsOf) : [node.id];

interface LayerTabContentProps {
  onSwitchToProperty?: () => void;
  onSelectionFromPanel?: () => void;
}

/** 레이어 탭 - 장면 트리 하나를 위→아래 겹침 순서로 보인다.
 * 묶기·풀기·끌어 옮기기·이름·숨김은 트리 연산 (옛 종류·플러그인·트리 전용 요소 함께) */
const LayerTabContent = ({
  onSwitchToProperty,
  onSelectionFromPanel,
}: LayerTabContentProps) => {
  const { t } = useTranslation();
  const sceneId = useKeyStore((state) => state.selectedKeyType);
  const scene = useElementDocumentScene(sceneId);
  const collapsed = useLayerCollapseStore((state) => state.collapsed);
  const toggleCollapsed = useLayerCollapseStore((state) => state.toggle);
  const rows = documentLayerRows(scene, collapsed);

  // 이름이 비었을 때의 기본 이름 - 트리의 슬롯·종류 이름 (지금 값)
  const records = treePanelRecords(scene, sceneId);
  const pluginElements = usePluginDisplayElementStore(
    selectPropertyPanelPluginElements,
  );
  const labels = buildLayerLabels({
    selectedKeyType: sceneId,
    positions: records.canonicalPositions as never,
    keyMappings: records.keyMappings as never,
    statPositions: records.canonicalStatItemPositions as never,
    graphPositions: records.canonicalGraphItemPositions as never,
    knobPositions: records.canonicalKnobItemPositions as never,
    spritePositions: records.canonicalSpritePositions as never,
    pluginElements,
  });

  const documentSelected = useDocumentSelectionStore((state) =>
    state.sceneId === sceneId ? state.selectedIds : EMPTY_IDS,
  );
  const legacySelected = useDocumentSelectionStore(
    (state) => state.selectedElements,
  );
  const selectedIds = [
    ...documentSelected,
    ...legacySelected
      .map(({ id }) => id)
      .filter((id) => !documentSelected.includes(id)),
  ];
  const isSelected = (id: string) => selectedIds.includes(id);

  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [dragging, setDragging] = useState(false);
  // 끄는 중 마지막으로 누른 행 클릭은 선택으로 치지 않는다
  const draggedRef = useRef(false);
  // Shift 범위의 기준 - 마지막으로 보조키 없이·Cmd로 누른 요소
  const anchorRef = useRef<string | null>(null);

  const [renaming, setRenaming] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameCancelledRef = useRef(false);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const { scrollContainerRef: lenisRef, lenisInstance } = useLenis();
  // 패널이 사는 창 - 분리 시 프레임을 자식 창에 싣는다
  const { window: hostWindow } = usePanelHost();
  // 콘텐츠 높이 변경 시 Lenis 갱신
  useEffect(() => {
    const win = hostWindow ?? window;
    const rafId = win.requestAnimationFrame(() => {
      lenisInstance.current?.resize();
    });
    return () => win.cancelAnimationFrame(rafId);
  });

  // 이름이 비었을 때 보이는 이름
  const defaultNameOf = (node: ElementNode) => {
    // 키는 트리 입력 슬롯 이름 (슬롯 바꾸기가 트리 연산 - 낙관 적용)
    const slot = slotDisplayName(treeKeySlot(node) ?? '');
    if (slot) return slot;
    const fallback = labels.defaultNames.get(node.id);
    if (fallback) return fallback;
    const label = elementKindDefinition(node.kind)?.label;
    return label
      ? t(label) || node.kind
      : t('elementKinds.unknownKind') || node.kind;
  };
  const nameOf = (node: Node) =>
    node.type === 'group' ? node.name : node.name || defaultNameOf(node);
  const hiddenOf = (node: Node) =>
    node.type === 'element' && isPluginKind(node.kind)
      ? labels.pluginHidden.get(node.id) ?? node.hidden === true
      : node.hidden === true;

  const select = (ids: readonly string[]) => {
    onSelectionFromPanel?.();
    setStructureSelection(sceneId, ids);
  };

  const handleRowClick = (
    event: React.MouseEvent,
    row: DocumentLayerRowModel,
  ) => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    // macOS Ctrl 클릭은 contextmenu 뒤에 따라오는 click - 무시한다
    if (isMac() && event.ctrlKey) return;
    const ids = elementIdsOf(row.node);
    const primaryModifier = isMac() ? event.metaKey : event.ctrlKey;
    if (primaryModifier) {
      anchorRef.current = row.node.id;
      // 그룹 행은 그룹 전체를 넣거나 뺀다
      const allSelected = ids.every(isSelected);
      select(
        row.node.type === 'group'
          ? allSelected
            ? selectedIds.filter((id) => !ids.includes(id))
            : [...selectedIds, ...ids.filter((id) => !isSelected(id))]
          : toggleDocumentId(selectedIds, row.node.id),
      );
      return;
    }
    // Shift - 기준 행과 누른 행 사이 요소 행 전체
    if (event.shiftKey && selectedIds.length > 0) {
      const anchorOf = (id: string | null | undefined) =>
        rows.findIndex(({ node }) => node.id === id);
      const remembered = anchorOf(anchorRef.current);
      const anchor = remembered >= 0 ? remembered : anchorOf(selectedIds[0]);
      const clicked = rows.indexOf(row);
      if (anchor >= 0) {
        const [from, to] =
          anchor < clicked ? [anchor, clicked] : [clicked, anchor];
        select(
          rows
            .slice(from, to + 1)
            .flatMap(({ node }) => elementIdsOf(node))
            .filter((id, index, all) => all.indexOf(id) === index),
        );
        return;
      }
    }
    // 레이어 행은 그룹 안 요소도 그 요소 하나만 고른다 (그룹째 고르기는 캔버스 규칙)
    anchorRef.current = row.node.id;
    select(ids);
  };

  const startRename = (id: string, value: string) => {
    renameCancelledRef.current = false;
    setRenaming({ id, value });
    (hostWindow ?? window).requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  };

  const renameOf = (row: DocumentLayerRowModel): LayerRowRename | null => {
    if (renaming?.id !== row.node.id) return null;
    const node = row.node;
    return {
      inputRef: renameInputRef,
      cancelledRef: renameCancelledRef,
      value: renaming.value,
      onChange: (value) => setRenaming({ id: node.id, value }),
      onCommit: (value) => {
        setRenaming(null);
        const trimmed = value.trim();
        if (node.type === 'group') {
          if (!trimmed || trimmed === node.name) return;
          void editDocument([
            { op: 'setGroup', scene: sceneId, id: node.id, name: trimmed },
          ]);
          return;
        }
        // 기본 이름과 같거나 비우면 이름을 지운다
        const fallback = defaultNameOf(node);
        void setDocumentCommon(sceneId, node.id, {
          name: trimmed && trimmed !== fallback ? trimmed : null,
        });
      },
      onCancel: () => setRenaming(null),
    };
  };

  const toggleHidden = (node: Node) => {
    const hidden = hiddenOf(node);
    if (node.type === 'group') {
      void editDocument([
        { op: 'setGroup', scene: sceneId, id: node.id, hidden: !hidden },
      ]);
      return;
    }
    // 플러그인 요소는 런타임 스토어에 바로 반영하고 트리 연산으로 저장한다
    if (isPluginKind(node.kind)) {
      void setPluginElementHiddenInTree(sceneId, node.id, !hidden).catch(
        reportElementOpError,
      );
      return;
    }
    void setDocumentCommon(sceneId, node.id, { hidden: !hidden });
  };

  const startDrag = (event: React.PointerEvent, row: DocumentLayerRowModel) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input')) return;
    // 고른 행을 끌면 고른 것 전체(다 고른 그룹은 그룹째), 아니면 그 행만
    const ownIds = elementIdsOf(row.node);
    const moving =
      ownIds.length > 0 && ownIds.every(isSelected)
        ? documentGroupRoots(scene, selectedIds)
        : [row.node.id];
    const startY = event.clientY;
    let started = false;
    let current: DropTarget | null = null;
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    const handleMove = (move: PointerEvent) => {
      if (!started && Math.abs(move.clientY - startY) < DRAG_THRESHOLD) {
        return;
      }
      if (!started) setDragging(true);
      started = true;
      const hit = element.ownerDocument
        .elementFromPoint(move.clientX, move.clientY)
        ?.closest<HTMLElement>('[data-document-layer-index]');
      if (!hit) {
        current = null;
        setDrop(null);
        return;
      }
      const index = Number(hit.dataset.documentLayerIndex);
      const rect = hit.getBoundingClientRect();
      const ratio = (move.clientY - rect.top) / Math.max(1, rect.height);
      const isGroup = rows[index]?.node.type === 'group';
      const position: DropPosition = isGroup
        ? ratio < 0.25
          ? 'above'
          : ratio > 0.75
          ? 'below'
          : 'into'
        : ratio < 0.5
        ? 'above'
        : 'below';
      current = { index, position };
      setDrop(current);
    };
    const handleUp = () => {
      element.removeEventListener('pointermove', handleMove);
      element.removeEventListener('pointerup', handleUp);
      element.removeEventListener('pointercancel', handleUp);
      setDrop(null);
      setDragging(false);
      if (!started) return;
      draggedRef.current = true;
      if (!current) return;
      // 펼친 그룹 행 아래 가장자리는 그 그룹 안 첫 자리
      const dropRow = rows[current.index];
      const position =
        current.position === 'below' &&
        dropRow?.node.type === 'group' &&
        !collapsed.has(dropRow.node.id)
          ? 'into'
          : current.position;
      const op = documentDropMove(
        scene,
        rows,
        moving,
        current.index,
        position,
        sceneId,
      );
      if (op) void editDocument([op]);
    };
    element.addEventListener('pointermove', handleMove);
    element.addEventListener('pointerup', handleUp);
    element.addEventListener('pointercancel', handleUp);
  };

  const openContextMenu = (
    event: React.MouseEvent,
    row: DocumentLayerRowModel,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    // 고른 것 위에서 우클릭하면 선택을 지킨다
    if (row.node.type === 'element' && !isSelected(row.node.id)) {
      select([row.node.id]);
    }
    setContextMenu({ row, x: event.clientX, y: event.clientY });
  };

  const contextMenuItems: ListItem[] = (() => {
    const row = contextMenu?.row;
    if (!row) return [];
    if (row.node.type === 'group') {
      return [
        { id: 'renameGroup', label: t('contextMenu.renameGroup') || 'Rename' },
        { id: 'ungroup', label: t('contextMenu.ungroup') || 'Ungroup' },
      ];
    }
    const items: ListItem[] = isPluginKind(row.node.kind)
      ? []
      : [{ id: 'rename', label: t('contextMenu.rename') || 'Rename' }];
    if (
      documentGroupActions(scene, structureTargetIds(sceneId)).includes('group')
    ) {
      items.push({
        id: 'groupSelected',
        label: t('contextMenu.groupSelected') || 'Group',
      });
    }
    if (row.parentId !== null) {
      items.push({
        id: 'removeFromGroup',
        label: t('contextMenu.removeFromGroup') || 'Remove from Group',
      });
    }
    items.push({
      id: 'delete',
      label: t('propertiesPanel.delete') || 'Delete',
    });
    return items;
  })();

  const handleContextMenuSelect = (itemId: string) => {
    const row = contextMenu?.row;
    setContextMenu(null);
    if (!row) return;
    const node = row.node;
    if (itemId === 'rename' || itemId === 'renameGroup') {
      startRename(node.id, nameOf(node));
    } else if (itemId === 'ungroup') {
      void editDocument([{ op: 'ungroup', scene: sceneId, id: node.id }]);
    } else if (itemId === 'groupSelected') {
      void groupDocumentElements(
        sceneId,
        structureTargetIds(sceneId),
        t('layerGroup.newGroup') || 'New Group',
      );
    } else if (itemId === 'removeFromGroup' && row.parentId !== null) {
      // 그룹 바로 위(그룹의 부모 안)로 꺼낸다
      const groupRow = rows.find(({ node }) => node.id === row.parentId);
      if (groupRow) {
        void editDocument([
          {
            op: 'move',
            scene: sceneId,
            ids: [node.id],
            parent: groupRow.parentId,
            index: groupRow.index + 1,
          },
        ]);
      }
    } else if (itemId === 'delete') {
      onSelectionFromPanel?.();
      void deleteStructureSelection(sceneId).catch(reportElementOpError);
    }
  };

  const contextMenuPresence = usePopupPresence(contextMenu !== null);
  const contextMenuShown = useRetainedWhileOpen(contextMenu !== null, {
    position: contextMenu ? { x: contextMenu.x, y: contextMenu.y } : undefined,
    items: contextMenuItems,
  });

  // 빈 공간 클릭 시 선택 해제
  const handleEmptySpaceMouseDown = (event: React.MouseEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.button !== 0) return;
    onSelectionFromPanel?.();
    useDocumentSelectionStore.getState().clearSelection();
    useDocumentSelectionStore.getState().clear();
  };

  return (
    <div
      className="flex-1 properties-panel-overlay-scroll group/panel"
      onMouseDown={handleEmptySpaceMouseDown}
    >
      <div
        ref={lenisRef}
        className="properties-panel-overlay-viewport"
        onMouseDown={handleEmptySpaceMouseDown}
      >
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-full p-[16px]">
            <p className="text-fg-caption text-body text-center">
              {t('propertiesPanel.noLayers') || 'No layers'}
            </p>
          </div>
        ) : (
          <div className="relative">
            {rows.map((row, index) => {
              const indicator =
                drop?.index === index && drop.position !== 'into' ? (
                  <div
                    className={`absolute right-0 ${
                      drop.position === 'above' ? 'top-0' : 'bottom-0'
                    } h-[2px] bg-accent z-10 pointer-events-none`}
                    style={{ left: layerRowIndent(row.depth) }}
                  />
                ) : null;
              const handlers = {
                onClick: (event: React.MouseEvent) =>
                  handleRowClick(event, row),
                onPointerDown: (event: React.PointerEvent) =>
                  startDrag(event, row),
                onContextMenu: (event: React.MouseEvent) =>
                  openContextMenu(event, row),
              };
              if (row.node.type === 'group') {
                const group = row.node;
                const members = elementIdsOf(group);
                return (
                  <div key={`group:${group.id}`} className="relative">
                    <LayerGroupRow
                      group={group}
                      depth={row.depth}
                      rowIndex={index}
                      collapsed={collapsed.has(group.id)}
                      selected={members.length > 0 && members.every(isSelected)}
                      dragging={dragging}
                      dropInto={
                        drop?.index === index && drop.position === 'into'
                      }
                      rename={renameOf(row)}
                      onToggleCollapsed={() => toggleCollapsed(group.id)}
                      onToggleHidden={() => toggleHidden(group)}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        startRename(group.id, group.name);
                      }}
                      {...handlers}
                    />
                    {indicator}
                  </div>
                );
              }
              const node = row.node;
              return (
                <div key={node.id} className="relative">
                  <LayerElementRow
                    id={node.id}
                    kind={node.kind}
                    name={nameOf(node)}
                    depth={row.depth}
                    rowIndex={index}
                    hidden={hiddenOf(node)}
                    selected={isSelected(node.id)}
                    dragging={dragging}
                    rename={renameOf(row)}
                    onToggleHidden={() => toggleHidden(node)}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      // 그 요소만 고르고 속성 탭으로
                      select([node.id]);
                      onSwitchToProperty?.();
                    }}
                    t={t}
                    {...handlers}
                  />
                  {indicator}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {contextMenuPresence.mounted &&
        createPortal(
          <ListPopup
            open={contextMenu !== null}
            ariaLabel={t('common.more')}
            position={contextMenuShown.position}
            onClose={() => setContextMenu(null)}
            items={contextMenuShown.items}
            onSelect={handleContextMenuSelect}
          />,
          document.body,
        )}
    </div>
  );
};

export default LayerTabContent;
