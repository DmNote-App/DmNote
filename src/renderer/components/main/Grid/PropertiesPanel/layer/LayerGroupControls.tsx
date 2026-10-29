import React, { useRef } from 'react';

import IconSwap from '@components/main/common/IconSwap';
import CloseEyeIcon from '@assets/svgs/close_eye.svg';
import OpenEyeIcon from '@assets/svgs/open_eye.svg';
import { useOptimisticBooleanCommit } from '@hooks/useOptimisticBooleanCommit';
import { ChevronIcon, FolderIcon } from './LayerIcons';

// 레이어 그룹 행의 접기·보이기 버튼 - 옛 그룹 행과 트리 그룹 행이 같이 쓴다
interface LayerGroupDisclosureProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const LayerGroupDisclosure = ({
  collapsed,
  onToggle,
}: LayerGroupDisclosureProps) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { value: visualCollapsed, toggle } = useOptimisticBooleanCommit({
    canonicalValue: collapsed,
    onCommit: onToggle,
    frameHostRef: buttonRef,
  });

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={!visualCollapsed}
        className="absolute left-0 top-0 bottom-0 w-[34px] flex items-center pl-[1px] cursor-pointer z-[1]"
        onMouseDown={(event) => {
          // 행 드래그 시작 억제 (press 동안 grabbing 커서 방지)
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
      >
        <span className="opacity-0 group-hover/panel:opacity-60 hover:!opacity-100">
          <ChevronIcon collapsed={visualCollapsed} />
        </span>
      </button>
      <div className="flex-shrink-0">
        <FolderIcon open={!visualCollapsed} />
      </div>
    </>
  );
};

interface LayerGroupVisibilityButtonProps {
  groupId: string;
  allHidden: boolean;
  onToggle: (event: React.MouseEvent, groupId: string) => void;
}

export const LayerGroupVisibilityButton = ({
  groupId,
  allHidden,
  onToggle,
}: LayerGroupVisibilityButtonProps) => (
  <button
    type="button"
    aria-label="toggle group visibility"
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
      onToggle(event, groupId);
    }}
    className={`flex-shrink-0 w-[28px] h-[28px] flex items-center justify-center rounded-md cursor-pointer ${
      allHidden ? '' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
    }`}
  >
    <IconSwap
      active={allHidden}
      activeIcon={<CloseEyeIcon width={14} height={14} fill="currentColor" />}
      inactiveIcon={<OpenEyeIcon width={14} height={14} fill="currentColor" />}
    />
  </button>
);
