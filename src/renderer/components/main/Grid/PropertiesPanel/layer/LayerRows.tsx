import React from 'react';

import IconSwap from '@components/main/common/IconSwap';
import CloseEyeIcon from '@assets/svgs/close_eye.svg';
import OpenEyeIcon from '@assets/svgs/open_eye.svg';
import type { Group } from '@src/types/generated/elementDocument';
import {
  GraphIcon,
  KeyIcon,
  KnobIcon,
  PluginIcon,
  SpriteIcon,
  StatIcon,
} from './LayerIcons';
import {
  LayerGroupDisclosure,
  LayerGroupVisibilityButton,
} from './LayerGroupControls';
import LayerRenameInput from './LayerRenameInput';
import { layerRowIndent } from './documentLayerModel';

const KindIcon = ({ kind }: { kind: string }) =>
  kind === 'key' ? (
    <KeyIcon />
  ) : kind === 'stat' ? (
    <StatIcon />
  ) : kind === 'graph' ? (
    <GraphIcon />
  ) : kind === 'knob' ? (
    <KnobIcon />
  ) : kind === 'sprite' ? (
    <SpriteIcon />
  ) : (
    <PluginIcon />
  );

export interface LayerRowRename {
  inputRef: React.RefObject<HTMLInputElement | null>;
  cancelledRef: React.MutableRefObject<boolean>;
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

interface LayerRowHandlers {
  onClick: (event: React.MouseEvent) => void;
  onDoubleClick: (event: React.MouseEvent) => void;
  onPointerDown: (event: React.PointerEvent) => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

const rowClass = (selected: boolean, hidden: boolean, dragging: boolean) => `
  group relative flex items-center gap-[8px] pr-[4px] h-[34px] select-none dmn-row-grabbable
  ${hidden ? 'opacity-60' : ''}
  ${
    selected
      ? 'bg-accent-muted text-fg'
      : dragging
      ? 'text-fg-muted'
      : 'hover:bg-fill text-fg-muted'
  }
`;

interface LayerElementRowProps extends LayerRowHandlers {
  id: string;
  kind: string;
  name: string;
  depth: number;
  rowIndex: number;
  hidden: boolean;
  selected: boolean;
  dragging: boolean;
  rename: LayerRowRename | null;
  onToggleHidden: () => void;
  t: (key: string) => string | undefined;
}

/** 요소 레이어 행 - 옛 종류·플러그인·트리 전용 요소 */
export const LayerElementRow = ({
  id,
  kind,
  name,
  depth,
  rowIndex,
  hidden,
  selected,
  dragging,
  rename,
  onToggleHidden,
  onClick,
  onDoubleClick,
  onPointerDown,
  onContextMenu,
  t,
}: LayerElementRowProps) => (
  <div
    data-document-layer-row={id}
    data-document-layer-index={rowIndex}
    onClick={onClick}
    onDoubleClick={onDoubleClick}
    onPointerDown={onPointerDown}
    onContextMenu={onContextMenu}
    style={{ paddingLeft: layerRowIndent(depth) }}
    className={rowClass(selected, hidden, dragging)}
  >
    <div className="flex-shrink-0">
      <KindIcon kind={kind} />
    </div>
    {rename ? (
      <LayerRenameInput {...rename} />
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
        onToggleHidden();
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
        activeIcon={<CloseEyeIcon width={14} height={14} fill="currentColor" />}
        inactiveIcon={
          <OpenEyeIcon width={14} height={14} fill="currentColor" />
        }
      />
    </button>
  </div>
);

interface LayerGroupRowProps extends LayerRowHandlers {
  group: Group;
  depth: number;
  rowIndex: number;
  collapsed: boolean;
  selected: boolean;
  dragging: boolean;
  dropInto: boolean;
  rename: LayerRowRename | null;
  onToggleCollapsed: () => void;
  onToggleHidden: () => void;
}

/** 그룹 레이어 행 */
export const LayerGroupRow = ({
  group,
  depth,
  rowIndex,
  collapsed,
  selected,
  dragging,
  dropInto,
  rename,
  onToggleCollapsed,
  onToggleHidden,
  onClick,
  onDoubleClick,
  onPointerDown,
  onContextMenu,
}: LayerGroupRowProps) => {
  const hidden = group.hidden === true;
  return (
    <div
      data-document-layer-group={group.id}
      data-document-layer-index={rowIndex}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      style={{ paddingLeft: layerRowIndent(depth) + 22 }}
      className={
        dropInto
          ? 'group relative flex items-center gap-[8px] pr-[4px] h-[34px] select-none bg-fill-hover text-fg-muted'
          : rowClass(selected, hidden, dragging)
      }
    >
      <LayerGroupDisclosure
        collapsed={collapsed}
        onToggle={onToggleCollapsed}
      />
      {rename ? (
        <LayerRenameInput {...rename} />
      ) : (
        <span className="flex-1 text-body truncate font-medium">
          {group.name}
        </span>
      )}
      <LayerGroupVisibilityButton
        groupId={group.id}
        allHidden={hidden}
        onToggle={onToggleHidden}
      />
    </div>
  );
};
