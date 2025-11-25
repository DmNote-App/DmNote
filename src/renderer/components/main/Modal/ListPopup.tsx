import React from "react";
import FloatingPopup from "./FloatingPopup";

export type ListItem = {
  id: string;
  label: string;
  disabled?: boolean;
};

type ListPopupProps = {
  open: boolean;
  referenceRef?: React.RefObject<HTMLElement>;
  position?: { x: number; y: number };
  onClose?: () => void;
  items: ListItem[];
  onSelect?: (id: string) => void;
  className?: string;
  offsetX?: number;
  offsetY?: number;
};

const ListPopup = ({
  open,
  referenceRef,
  position,
  onClose,
  items,
  onSelect,
  className = "",
  offsetX = 0,
  offsetY = 0,
}: ListPopupProps) => {
  const defaultClassName =
    "z-30 bg-button-primary rounded-[7px] p-[5px] flex flex-col gap-[5px]";
  const effectiveClassName = `${defaultClassName} ${className}`.trim();

  return (
    <FloatingPopup
      open={open}
      referenceRef={referenceRef}
      placement="top"
      offset={25}
      offsetX={offsetX}
      offsetY={offsetY}
      fixedX={position?.x}
      fixedY={position?.y}
      onClose={onClose}
      className={effectiveClassName}
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          disabled={it.disabled}
          onClick={() => {
            if (it.disabled) return;
            onSelect(it.id);
            onClose?.();
          }}
          className={`min-w-[108px] h-[24px] px-[24px] rounded-[7px] flex items-center justify-center ${
            it.disabled
              ? "opacity-50"
              : "hover:bg-button-hover active:bg-button-active cursor-pointer"
          }`}
        >
          <span
            className={`text-style-2 whitespace-nowrap ${
              it.disabled ? "text-[#6B6E7B]" : "text-[#DBDEE8]"
            }`}
          >
            {it.label}
          </span>
        </button>
      ))}
    </FloatingPopup>
  );
};

export default ListPopup;
