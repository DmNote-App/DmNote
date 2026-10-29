import React, { useRef, useState } from 'react';

import { useElementDocumentScene } from '@src/renderer/editor/document/elementDocumentRuntime';
import type { Group, Node } from '@src/types/generated/elementDocument';
import { isMac } from '@utils/core/platform';
import { editDocument } from '../../document/documentEditActions';
import { documentGroupRoots } from '../../document/documentGroups';
import { toggleDocumentId } from '../../document/documentSelection';
import { useDocumentSelectionStore } from '../../document/useDocumentSelectionStore';
import DocumentLayerRow from './DocumentLayerRow';
import {
  documentDropMove,
  documentLayerRows,
  layerRowIndent,
  type DocumentLayerRowModel,
} from './documentLayerModel';
import {
  LayerGroupDisclosure,
  LayerGroupVisibilityButton,
} from './LayerGroupControls';
import LayerRenameInput from './LayerRenameInput';

// 끌기로 보지 않는 움직임 (화면 px)
const DRAG_THRESHOLD = 4;
const EMPTY_IDS: string[] = [];

type DropPosition = 'above' | 'below' | 'into';

interface DropTarget {
  index: number;
  position: DropPosition;
}

const elementIdsOf = (node: Node): string[] =>
  node.type === 'group' ? node.children.flatMap(elementIdsOf) : [node.id];

interface DocumentGroupRowProps {
  sceneId: string;
  group: Group;
  depth: number;
  rowIndex: number;
  collapsed: boolean;
  selected: boolean;
  onToggleCollapsed: () => void;
  onRowClick: (event: React.MouseEvent) => void;
  onRowPointerDown: (event: React.PointerEvent) => void;
}

/** 트리 전용 그룹 행 - 옛 그룹 행과 같은 모양 */
const DocumentGroupRow = ({
  sceneId,
  group,
  depth,
  rowIndex,
  collapsed,
  selected,
  onToggleCollapsed,
  onRowClick,
  onRowPointerDown,
}: DocumentGroupRowProps) => {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameCancelledRef = useRef(false);
  const hidden = group.hidden === true;
  return (
    <div
      data-document-layer-group={group.id}
      data-document-layer-index={rowIndex}
      onClick={onRowClick}
      onPointerDown={onRowPointerDown}
      onDoubleClick={(event) => {
        event.preventDefault();
        renameCancelledRef.current = false;
        setRenameValue(group.name);
        setRenaming(true);
      }}
      style={{ paddingLeft: layerRowIndent(depth) + 22 }}
      className={`
        group relative flex items-center gap-[8px] pr-[4px] h-[34px] select-none
        ${hidden ? 'opacity-60' : ''}
        ${selected ? 'bg-accent-muted text-fg' : 'hover:bg-fill text-fg-muted'}
      `}
    >
      <LayerGroupDisclosure
        collapsed={collapsed}
        onToggle={onToggleCollapsed}
      />
      {renaming ? (
        <LayerRenameInput
          inputRef={renameInputRef}
          value={renameValue}
          cancelledRef={renameCancelledRef}
          onChange={setRenameValue}
          onCommit={(value) => {
            setRenaming(false);
            const trimmed = value.trim();
            if (!trimmed || trimmed === group.name) return;
            void editDocument([
              { op: 'setGroup', scene: sceneId, id: group.id, name: trimmed },
            ]);
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <span className="flex-1 text-body truncate">{group.name}</span>
      )}
      <LayerGroupVisibilityButton
        groupId={group.id}
        allHidden={hidden}
        onToggle={() =>
          void editDocument([
            { op: 'setGroup', scene: sceneId, id: group.id, hidden: !hidden },
          ])
        }
      />
    </div>
  );
};

interface DocumentLayerSectionProps {
  sceneId: string;
  t: (key: string) => string | undefined;
}

/** 레이어 패널의 트리 요소 구역 - 옛 목록 아래에 위→아래 겹침 순서로 둔다
 * (옛 행의 끌기 계산(행 높이 × 순번)을 흔들지 않게 옛 목록과 섞지 않는다) */
const DocumentLayerSection = ({ sceneId, t }: DocumentLayerSectionProps) => {
  const scene = useElementDocumentScene(sceneId);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const selectedIds = useDocumentSelectionStore((state) =>
    state.sceneId === sceneId ? state.selectedIds : EMPTY_IDS,
  );
  const rows = documentLayerRows(scene, collapsed);
  // 끄는 중 마지막으로 누른 행 클릭은 선택으로 치지 않는다
  const draggedRef = useRef(false);

  const select = (event: React.MouseEvent, row: DocumentLayerRowModel) => {
    // macOS Ctrl 클릭은 contextmenu 뒤에 따라오는 click - 무시한다 (옛 행과 같다)
    if (isMac() && event.ctrlKey) return;
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    const selection = useDocumentSelectionStore.getState();
    const ids =
      row.node.type === 'group' ? elementIdsOf(row.node) : [row.node.id];
    const primaryModifier = isMac() ? event.metaKey : event.ctrlKey;
    if (primaryModifier) {
      // 그룹 행은 그룹 전체를 넣거나 뺀다
      const allSelected = ids.every((id) => selectedIds.includes(id));
      const next =
        row.node.type === 'group'
          ? allSelected
            ? selectedIds.filter((id) => !ids.includes(id))
            : [...selectedIds, ...ids.filter((id) => !selectedIds.includes(id))]
          : toggleDocumentId(selectedIds, row.node.id);
      selection.setSelection(sceneId, next);
      return;
    }
    // Shift - 기준 행과 누른 행 사이 요소 행 전체
    if (event.shiftKey && selectedIds.length > 0) {
      const anchor = rows.findIndex(
        ({ node }) => node.type === 'element' && node.id === selectedIds[0],
      );
      const clicked = rows.indexOf(row);
      if (anchor >= 0) {
        const [from, to] =
          anchor < clicked ? [anchor, clicked] : [clicked, anchor];
        selection.setSelection(
          sceneId,
          rows
            .slice(from, to + 1)
            .flatMap(({ node }) => elementIdsOf(node))
            .filter((id, index, all) => all.indexOf(id) === index),
        );
        return;
      }
    }
    // 레이어 행은 그룹 안 요소도 그 요소 하나만 고른다 (그룹째 고르기는 캔버스 규칙)
    selection.setSelection(sceneId, ids);
  };

  const startDrag = (event: React.PointerEvent, row: DocumentLayerRowModel) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input')) return;
    // 고른 행을 끌면 고른 것 전체(다 고른 그룹은 그룹째), 아니면 그 행만
    const ownIds =
      row.node.type === 'group' ? elementIdsOf(row.node) : [row.node.id];
    const moving =
      ownIds.length > 0 && ownIds.every((id) => selectedIds.includes(id))
        ? documentGroupRoots(scene, selectedIds)
        : [row.node.id];
    const startY = event.clientY;
    let dragging = false;
    let current: DropTarget | null = null;
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    const handleMove = (move: PointerEvent) => {
      if (!dragging && Math.abs(move.clientY - startY) < DRAG_THRESHOLD) {
        return;
      }
      dragging = true;
      const hit = document
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
      if (!dragging) return;
      draggedRef.current = true;
      if (!current) return;
      // 펼친 그룹 행 아래 가장자리는 그 그룹 안 첫 자리 (옛 끌기와 같다)
      const target = rows[current.index];
      const position =
        current.position === 'below' &&
        target?.node.type === 'group' &&
        !collapsed.has(target.node.id)
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

  return (
    <>
      {rows.map((row, index) => {
        const indicator =
          drop?.index === index ? (
            drop.position === 'into' ? (
              <div className="absolute inset-0 border-2 border-accent rounded-md pointer-events-none z-10" />
            ) : (
              <div
                className={`absolute right-0 ${
                  drop.position === 'above' ? 'top-0' : 'bottom-0'
                } h-[2px] bg-accent z-10 pointer-events-none`}
                style={{ left: layerRowIndent(row.depth) }}
              />
            )
          ) : null;
        if (row.node.type === 'group') {
          const group = row.node;
          const members = elementIdsOf(group);
          return (
            <div key={`document-group:${group.id}`} className="relative">
              <DocumentGroupRow
                sceneId={sceneId}
                group={group}
                depth={row.depth}
                rowIndex={index}
                collapsed={collapsed.has(group.id)}
                selected={
                  members.length > 0 &&
                  members.every((id) => selectedIds.includes(id))
                }
                onToggleCollapsed={() =>
                  setCollapsed((previous) => {
                    const next = new Set(previous);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
                onRowClick={(event) => select(event, row)}
                onRowPointerDown={(event) => startDrag(event, row)}
              />
              {indicator}
            </div>
          );
        }
        return (
          <div key={`document:${row.node.id}`} className="relative">
            <DocumentLayerRow
              sceneId={sceneId}
              element={row.node}
              depth={row.depth}
              rowIndex={index}
              onRowClick={(event) => select(event, row)}
              onRowPointerDown={(event) => startDrag(event, row)}
              t={t}
            />
            {indicator}
          </div>
        );
      })}
    </>
  );
};

export default DocumentLayerSection;
