import React, { useRef, useState } from 'react';

import IconSwap from '@components/main/common/IconSwap';
import CloseEyeIcon from '@assets/svgs/close_eye.svg';
import OpenEyeIcon from '@assets/svgs/open_eye.svg';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import { setDocumentCommon } from '../../document/documentEditActions';
import { useDocumentContextMenuStore } from '../../document/useDocumentContextMenuStore';
import { useDocumentSelectionStore } from '../../document/useDocumentSelectionStore';
import { PluginIcon } from './LayerIcons';
import LayerRenameInput from './LayerRenameInput';

interface DocumentLayerRowProps {
  sceneId: string;
  element: ElementNode;
  t: (key: string) => string | undefined;
}

/** 트리 문서에만 있는 요소의 레이어 행 - 옛 종류 행과 같은 모양 */
const DocumentLayerRow = ({ sceneId, element, t }: DocumentLayerRowProps) => {
  const selected = useDocumentSelectionStore(
    (state) =>
      state.sceneId === sceneId && state.selectedIds.includes(element.id),
  );
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameCancelledRef = useRef(false);
  const definition = elementKindDefinition(element.kind);
  const kindName = definition?.label
    ? t(definition.label) || element.kind
    : t('elementKinds.unknownKind') || element.kind;
  const name = element.name || kindName;
  const hidden = element.hidden === true;
  return (
    <div
      data-document-layer-row={element.id}
      onClick={() =>
        useDocumentSelectionStore.getState().select(sceneId, element.id)
      }
      onDoubleClick={(event) => {
        event.preventDefault();
        renameCancelledRef.current = false;
        setRenameValue(name);
        setRenaming(true);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        useDocumentSelectionStore.getState().select(sceneId, element.id);
        useDocumentContextMenuStore.getState().open({
          sceneId,
          id: element.id,
          x: event.clientX,
          y: event.clientY,
        });
      }}
      style={{ paddingLeft: 12 }}
      className={`
        group relative flex items-center gap-[8px] pr-[4px] h-[34px] select-none
        ${hidden ? 'opacity-60' : ''}
        ${selected ? 'bg-accent-muted text-fg' : 'hover:bg-fill text-fg-muted'}
      `}
    >
      <div className="flex-shrink-0">
        <PluginIcon />
      </div>
      {renaming ? (
        <LayerRenameInput
          inputRef={renameInputRef}
          value={renameValue}
          cancelledRef={renameCancelledRef}
          onChange={setRenameValue}
          onCommit={(value) => {
            setRenaming(false);
            const trimmed = value.trim();
            void setDocumentCommon(sceneId, element.id, {
              name: trimmed && trimmed !== kindName ? trimmed : null,
            });
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <span className="flex-1 text-body truncate">{name}</span>
      )}
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          void setDocumentCommon(sceneId, element.id, { hidden: !hidden });
        }}
        title={
          hidden
            ? t('propertiesPanel.showLayer') || 'Show'
            : t('propertiesPanel.hideLayer') || 'Hide'
        }
        className={`flex-shrink-0 w-[28px] h-[28px] flex items-center justify-center rounded-md cursor-pointer ${
          hidden ? '' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
        }`}
      >
        <IconSwap
          active={hidden}
          activeIcon={
            <CloseEyeIcon width={14} height={14} fill="currentColor" />
          }
          inactiveIcon={
            <OpenEyeIcon width={14} height={14} fill="currentColor" />
          }
        />
      </button>
    </div>
  );
};

export default DocumentLayerRow;
