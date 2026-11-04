import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTranslation } from '@contexts/useTranslation';
import { usePopupPresence } from '@hooks/ui/usePopupPresence';
import { useRetainedWhileOpen } from '@hooks/ui/useRetainedValue';
import { useLenis } from '@hooks/useLenis';
import { usePanelHost } from '@contexts/PanelHostContext';
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
import type { Group, Node, Op } from '@src/types/generated/elementDocument';
import {
  resumeCustomCursorHover,
  suspendCustomCursorHover,
} from '@utils/grid/cursorUtils';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import {
  editDocument,
  groupDocumentElements,
  setDocumentCommon,
} from '../../document/documentEditActions';
import { documentGroupActions } from '../../document/documentGroups';
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
import { useLayerCollapseStore } from '@stores/grid/useLayerCollapseStore';

// 끌기로 보지 않는 움직임 (화면 px)
// 예전 레이어 끌기와 같은 시작 거리 (가로·세로 어느 쪽이든)
const DRAG_THRESHOLD = 3;
const DRAG_CURSOR_CLASS = 'dmn-dragging';
const EMPTY_IDS: string[] = [];

type DropPosition = 'above' | 'below' | 'into';

interface DropTarget {
  // 행 순번 - 목록 위·아래 빈 곳이면 'top'·'bottom'
  index: number | 'top' | 'bottom';
  position: DropPosition;
  // 표시선 들여쓰기 - 놓일 부모 기준 (맨 위 단계면 0)
  inset: number;
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

  // 이름이 비었을 때의 기본 이름 - 트리의 슬롯·고유 값·옛 순번 (지금 값)
  const pluginElements = usePluginDisplayElementStore(
    selectPropertyPanelPluginElements,
  );
  const labels = buildLayerLabels({
    scene,
    selectedKeyType: sceneId,
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
  // 끄는 그룹 - 그 그룹 행과 멤버 행을 흐리게 (예전과 같다)
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  // 끄는 중 마지막으로 누른 행 클릭은 선택으로 치지 않는다
  const draggedRef = useRef(false);
  // Shift 범위의 기준 - 마지막으로 보조키 없이·Cmd로 누른 요소(우클릭으로 고른 요소 포함)
  const anchorRef = useRef<string | null>(null);
  // 기준 행을 다시 누르면 잠시 뒤 해제(여럿이면 그 행만) - 끌기·더블클릭·우클릭이 오면 취소 (예전과 같다)
  const pendingDeselectRef = useRef<number | null>(null);
  const cancelPendingDeselect = () => {
    if (pendingDeselectRef.current === null) return;
    (hostWindow ?? window).clearTimeout(pendingDeselectRef.current);
    pendingDeselectRef.current = null;
  };

  const [renaming, setRenaming] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameCancelledRef = useRef(false);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // 패널이 사는 창 - 분리 시 프레임을 자식 창에 싣는다
  const { window: hostWindow } = usePanelHost();

  const { scrollContainerRef: lenisRef, lenisInstance } = useLenis();
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

  // 숨긴 그룹 안 행 - 예전처럼 숨김으로 보인다 (예전 그룹 숨김은 멤버마다 숨김이었다)
  const hiddenAbove = new Set<string>();
  // 끄는 그룹과 그 안 행 - 흐리게
  const dimmedRows = new Set<string>();
  {
    const hiddenGroups = new Set<string>();
    const draggedGroups = new Set<string>();
    for (const { node, parentId } of rows) {
      const underHidden = parentId !== null && hiddenGroups.has(parentId);
      const underDragged = parentId !== null && draggedGroups.has(parentId);
      if (underHidden) hiddenAbove.add(node.id);
      if (underDragged || node.id === draggedGroupId) dimmedRows.add(node.id);
      if (node.type === 'group') {
        if (underHidden || node.hidden) hiddenGroups.add(node.id);
        if (underDragged || node.id === draggedGroupId) {
          draggedGroups.add(node.id);
        }
      }
    }
  }

  const select = (ids: readonly string[]) => {
    onSelectionFromPanel?.();
    setStructureSelection(sceneId, ids);
  };

  const handleRowClick = (
    event: React.MouseEvent,
    row: DocumentLayerRowModel,
  ) => {
    cancelPendingDeselect();
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    // macOS Ctrl 클릭은 contextmenu 뒤에 따라오는 click - 무시한다
    if (isMac() && event.ctrlKey) return;
    const ids = elementIdsOf(row.node);
    const primaryModifier = isMac() ? event.metaKey : event.ctrlKey;
    const anchorIndex = rows.findIndex(
      ({ node }) => node.id === anchorRef.current,
    );
    // Shift - 기준 행과 누른 행 사이 요소 행 전체 (Cmd+Shift는 지금 선택에 더한다). 기준이 없으면 보통 클릭
    if (event.shiftKey && anchorIndex >= 0) {
      const clicked = rows.indexOf(row);
      const [from, to] =
        anchorIndex < clicked ? [anchorIndex, clicked] : [clicked, anchorIndex];
      const range = rows
        .slice(from, to + 1)
        .flatMap(({ node }) => elementIdsOf(node))
        .filter((id, index, all) => all.indexOf(id) === index);
      select(
        primaryModifier
          ? [...selectedIds, ...range.filter((id) => !isSelected(id))]
          : range,
      );
      return;
    }
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
    // 고른 요소 행 - 처음 누르면 기준만 옮기고, 기준 행을 다시 누르면 잠시 뒤 해제(여럿이면 그 행만)
    if (row.node.type === 'element' && isSelected(row.node.id)) {
      if (anchorRef.current !== row.node.id) {
        anchorRef.current = row.node.id;
        return;
      }
      const id = row.node.id;
      const many = selectedIds.length > 1;
      pendingDeselectRef.current = (hostWindow ?? window).setTimeout(() => {
        pendingDeselectRef.current = null;
        select(many ? [id] : []);
      }, 50);
      return;
    }
    // 레이어 행은 그룹 안 요소도 그 요소 하나만 고른다 (그룹째 고르기는 캔버스 규칙)
    anchorRef.current = row.node.id;
    select(ids);
  };

  useEffect(() => {
    const win = hostWindow ?? window;
    return () => {
      if (pendingDeselectRef.current !== null) {
        win.clearTimeout(pendingDeselectRef.current);
      }
    };
  }, [hostWindow]);

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
        // 비우면 기본 이름으로 (기본 이름과 같게 입력해도 그 이름으로 둔다 - 예전과 같다)
        void setDocumentCommon(sceneId, node.id, { name: trimmed || null });
      },
      onCancel: () => setRenaming(null),
    };
  };

  const toggleHidden = (node: Node) => {
    // 숨긴 그룹 안 요소를 보이게 - 예전처럼 그 요소만 보이게(길 위 숨긴 그룹을 풀고 나머지 멤버를 숨긴다)
    if (
      node.type === 'element' &&
      hiddenAbove.has(node.id) &&
      !hiddenOf(node)
    ) {
      // 길 위 숨긴 그룹 (그룹 노드)
      const hiddenPath: Node[] = [];
      let parentId = rows.find((row) => row.node.id === node.id)?.parentId;
      while (parentId) {
        const parentRow = rows.find((row) => row.node.id === parentId);
        if (!parentRow || parentRow.node.type !== 'group') break;
        if (parentRow.node.hidden) hiddenPath.push(parentRow.node);
        parentId = parentRow.parentId;
      }
      const others = new Set(hiddenPath.flatMap(elementIdsOf));
      others.delete(node.id);
      void editDocument([
        ...hiddenPath.map((group) => ({
          op: 'setGroup' as const,
          scene: sceneId,
          id: group.id,
          hidden: false,
        })),
        ...[...others].map((id) => ({
          op: 'setCommon' as const,
          scene: sceneId,
          id,
          hidden: true,
        })),
      ]);
      return;
    }
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
    cancelPendingDeselect();
    // 무엇을 옮기나 (예전과 같다) - 그룹 행은 그 그룹, 고른 요소 행은 고른 요소 전체(그 요소의 그룹을
    // 다 골랐으면 그 요소만), 안 고른 요소 행은 그 행만
    const ownIds = elementIdsOf(row.node);
    const parentGroup =
      row.parentId === null
        ? undefined
        : rows.find(({ node }) => node.id === row.parentId)?.node;
    const moving =
      row.node.type === 'group'
        ? [row.node.id]
        : isSelected(row.node.id) && selectedIds.length > 1
        ? parentGroup && elementIdsOf(parentGroup).every(isSelected)
          ? [row.node.id]
          : selectedIds
        : ownIds.length > 0
        ? [row.node.id]
        : [];
    const startX = event.clientX;
    const startY = event.clientY;
    let started = false;
    let current: DropTarget | null = null;
    let currentOp: Op | null = null;
    const element = event.currentTarget as HTMLElement;
    const ownerDocument = element.ownerDocument;
    element.setPointerCapture(event.pointerId);
    // 누른 동안 전역 grabbing 커서 - WKWebView가 :active 커서 갱신을 놓치는 문제 (예전과 같다)
    ownerDocument.body.classList.add(DRAG_CURSOR_CLASS);
    suspendCustomCursorHover();
    const list = element.closest<HTMLElement>('[data-document-layer-list]');
    const settle = (next: DropTarget | null, op: Op | null) => {
      // 놓아도 그대로인 자리는 표시하지 않는다
      current = op ? next : null;
      currentOp = op;
      setDrop(current);
    };
    const handleMove = (move: PointerEvent) => {
      if (
        !started &&
        Math.abs(move.clientX - startX) < DRAG_THRESHOLD &&
        Math.abs(move.clientY - startY) < DRAG_THRESHOLD
      ) {
        return;
      }
      if (!started) {
        setDragging(true);
        setDraggedGroupId(row.node.type === 'group' ? row.node.id : null);
      }
      started = true;
      const hit = ownerDocument
        .elementFromPoint(move.clientX, move.clientY)
        ?.closest<HTMLElement>('[data-document-layer-index]');
      if (!hit) {
        // 목록 위·아래 빈 곳 - 맨 위·맨 아래(그룹 밖)로
        const bounds = list?.getBoundingClientRect();
        if (!bounds || move.clientY <= bounds.top) {
          settle(
            { index: 'top', position: 'above', inset: 0 },
            topLevelMove(moving, 'top'),
          );
          return;
        }
        if (move.clientY >= bounds.bottom) {
          settle(
            { index: 'bottom', position: 'below', inset: 0 },
            topLevelMove(moving, 'bottom'),
          );
          return;
        }
        settle(null, null);
        return;
      }
      const index = Number(hit.dataset.documentLayerIndex);
      const rect = hit.getBoundingClientRect();
      const ratio = (move.clientY - rect.top) / Math.max(1, rect.height);
      const hovered = rows[index];
      // 그룹을 끌 때는 그룹 안으로 넣지 않는다 (예전과 같다)
      const intoAllowed =
        hovered?.node.type === 'group' && row.node.type !== 'group';
      const position: DropPosition = intoAllowed
        ? ratio < 0.25
          ? 'above'
          : ratio > 0.75
          ? 'below'
          : 'into'
        : ratio < 0.5
        ? 'above'
        : 'below';
      // 펼친 그룹 행 아래 가장자리는 그 그룹 안 첫 자리
      const resolved =
        position === 'below' &&
        hovered?.node.type === 'group' &&
        !collapsed.has(hovered.node.id) &&
        row.node.type !== 'group'
          ? 'into'
          : position;
      const op = documentDropMove(
        scene,
        rows,
        moving,
        index,
        resolved,
        sceneId,
      );
      settle(
        { index, position, inset: dropInset(op) },
        op && !isNoopMove(op) ? op : null,
      );
    };
    const handleUp = () => {
      element.removeEventListener('pointermove', handleMove);
      element.removeEventListener('pointerup', handleUp);
      element.removeEventListener('pointercancel', handleUp);
      ownerDocument.body.classList.remove(DRAG_CURSOR_CLASS);
      resumeCustomCursorHover();
      setDrop(null);
      setDragging(false);
      setDraggedGroupId(null);
      if (!started) return;
      // 끈 뒤 따라오는 click은 선택으로 치지 않는다 - 다음 작업에서 푼다 (예전과 같다)
      draggedRef.current = true;
      (hostWindow ?? window).setTimeout(() => {
        draggedRef.current = false;
      }, 0);
      if (currentOp) void editDocument([currentOp]);
    };
    element.addEventListener('pointermove', handleMove);
    element.addEventListener('pointerup', handleUp);
    element.addEventListener('pointercancel', handleUp);
  };

  // 맨 위·맨 아래(장면 맨 위 단계)로 옮기기
  const topLevelMove = (ids: readonly string[], edge: 'top' | 'bottom') =>
    ids.length === 0
      ? null
      : ({
          op: 'move',
          scene: sceneId,
          ids: [...ids],
          parent: null,
          index: edge === 'top' ? null : 0,
        } satisfies Op);

  // 표시선 들여쓰기 - 놓일 부모의 자식 들여쓰기 (맨 위 단계면 0)
  const dropInset = (op: Op | null) => {
    if (op?.op !== 'move' || op.parent === null) return 0;
    const parentRow = rows.find(({ node }) => node.id === op.parent);
    return parentRow ? layerRowIndent(parentRow.depth + 1) : 0;
  };

  // 놓아도 자리가 그대로인 옮기기 - 한 노드를 지금 자리나 바로 위 자리로
  const isNoopMove = (op: Op) => {
    if (op.op !== 'move' || op.ids.length !== 1) return false;
    const moved = rows.find(({ node }) => node.id === op.ids[0]);
    if (!moved || moved.parentId !== op.parent) return false;
    const siblings =
      op.parent === null
        ? scene?.nodes.length ?? 0
        : (rows.find(({ node }) => node.id === op.parent)?.node as Group)
            ?.children.length ?? 0;
    const index = op.index ?? siblings;
    return index === moved.index || index === moved.index + 1;
  };

  const openContextMenu = (
    event: React.MouseEvent,
    row: DocumentLayerRowModel,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    cancelPendingDeselect();
    // 고른 것 위에서 우클릭하면 선택을 지킨다 - 새로 고르면 Shift 기준도 그 행
    if (row.node.type === 'element' && !isSelected(row.node.id)) {
      anchorRef.current = row.node.id;
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
    // 구독한 선택으로 - 렌더 중 스토어 직접 읽기는 컴파일러가 선택이 바뀌어도 다시 계산하지 않는다.
    // 그룹 안 행에는 내지 않는다 (예전과 같다 - 대신 그룹에서 빼기)
    if (
      row.parentId === null &&
      documentGroupActions(scene, selectedIds).includes('group')
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
    } else if (itemId === 'ungroup' && node.type === 'group') {
      // 그룹 숨김은 멤버 숨김으로 남기고 선택은 푼다 (예전과 같다)
      void editDocument([
        { op: 'ungroup', scene: sceneId, id: node.id },
        ...(node.hidden ? hideOps(node.children) : []),
      ]);
      clearPanelSelection();
    } else if (itemId === 'groupSelected') {
      void groupDocumentElements(
        sceneId,
        structureTargetIds(sceneId),
        t('layerGroup.newGroup') || 'New Group',
      );
    } else if (itemId === 'removeFromGroup' && row.parentId !== null) {
      // 맨 위 멤버는 그룹 바로 위, 나머지는 그룹 바로 아래(그룹의 부모 안)로 - 예전 패널과 같은 자리.
      // 숨긴 그룹에서 빼면 숨김을 이어받고, 선택은 푼다
      const groupRow = rows.find(({ node }) => node.id === row.parentId);
      if (groupRow && groupRow.node.type === 'group') {
        const top = row.index === groupRow.node.children.length - 1;
        void editDocument([
          {
            op: 'move',
            scene: sceneId,
            ids: [node.id],
            parent: groupRow.parentId,
            index: top ? groupRow.index + 1 : groupRow.index,
          },
          ...(groupRow.node.hidden ? hideOps([node]) : []),
        ]);
        clearPanelSelection();
      }
    } else if (itemId === 'delete') {
      onSelectionFromPanel?.();
      void deleteStructureSelection(sceneId).catch(reportElementOpError);
    }
  };

  // 노드들을 숨기는 연산 (그룹은 그룹 숨김)
  const hideOps = (nodes: readonly Node[]) =>
    nodes.map((child) =>
      child.type === 'group'
        ? {
            op: 'setGroup' as const,
            scene: sceneId,
            id: child.id,
            hidden: true,
          }
        : {
            op: 'setCommon' as const,
            scene: sceneId,
            id: child.id,
            hidden: true,
          },
    );

  const clearPanelSelection = () => {
    onSelectionFromPanel?.();
    useDocumentSelectionStore.getState().clearSelection();
    useDocumentSelectionStore.getState().clear();
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
    cancelPendingDeselect();
    anchorRef.current = null;
    clearPanelSelection();
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
          <div className="relative" data-document-layer-list="">
            {drop?.index === 'top' && (
              <div className="absolute left-0 right-0 top-0 h-[2px] bg-accent z-10 pointer-events-none" />
            )}
            {rows.map((row, index) => {
              const indicator =
                drop?.index === index && drop.position !== 'into' ? (
                  <div
                    className={`absolute right-0 ${
                      drop.position === 'above' ? 'top-0' : 'bottom-0'
                    } h-[2px] bg-accent z-10 pointer-events-none`}
                    style={{ left: drop.inset }}
                  />
                ) : null;
              const dimmed = dimmedRows.has(row.node.id);
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
                      dimmed={dimmed}
                      dropInto={
                        drop?.index === index && drop.position === 'into'
                      }
                      rename={renameOf(row)}
                      onToggleCollapsed={() => toggleCollapsed(group.id)}
                      onToggleHidden={() => toggleHidden(group)}
                      // 예전처럼 그룹 행 더블클릭은 이름 바꾸기가 아니다 (메뉴의 이름 바꾸기)
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        cancelPendingDeselect();
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
                    hidden={hiddenOf(node) || hiddenAbove.has(node.id)}
                    selected={isSelected(node.id)}
                    dragging={dragging}
                    dimmed={dimmed}
                    rename={renameOf(row)}
                    onToggleHidden={() => toggleHidden(node)}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      cancelPendingDeselect();
                      // 끈 직후 더블클릭은 무시 (예전과 같다)
                      if (draggedRef.current) return;
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
            {drop?.index === 'bottom' && (
              <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-accent z-10 pointer-events-none" />
            )}
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
