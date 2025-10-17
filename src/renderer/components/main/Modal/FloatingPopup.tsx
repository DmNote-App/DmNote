import React, { useEffect, useRef, useState } from "react";
import {
  useFloating,
  offset as fuiOffset,
  shift,
  flip,
  autoUpdate,
} from "@floating-ui/react";

type FloatingPopupProps = {
  open: boolean;
  referenceRef?: React.RefObject<HTMLElement>;
  placement?: any;
  offset?: number;
  offsetX?: number;
  offsetY?: number;
  fixedX?: number;
  fixedY?: number;
  interactiveRefs?: Array<React.RefObject<HTMLElement>>;
  onClose?: () => void;
  className?: string;
  children?: React.ReactNode;
  autoClose?: boolean;
};

const FloatingPopup = ({
  open,
  referenceRef,
  placement = "top",
  offset = 20,
  offsetX = 0,
  offsetY = 0,
  fixedX,
  fixedY,
  interactiveRefs = [],
  onClose,
  className = "",
  children,
  autoClose = true,
}: FloatingPopupProps) => {
  const { x, y, refs, strategy, update } = useFloating({
    placement,
    middleware: [fuiOffset(offset), shift(), flip()],
    whileElementsMounted: autoUpdate,
  });

  const floatingRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (referenceRef && referenceRef.current)
      refs.setReference(referenceRef.current);
  }, [referenceRef, refs.setReference]);

  useEffect(() => {
    if (open && autoClose) {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose?.();
      };

      const onClickAway = (e: MouseEvent) => {
        const target = e.target as Node;
        if (!refs.floating.current) return;
        if (
          refs.floating.current.contains(target) ||
          (referenceRef &&
            referenceRef.current &&
            referenceRef.current.contains(target))
        )
          return;
        onClose?.();
      };

      document.addEventListener("keydown", onKey);
      document.addEventListener("mousedown", onClickAway);
      return () => {
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("mousedown", onClickAway);
      };
    }
  }, [open, autoClose, onClose, referenceRef, refs.floating]);

  useEffect(() => {
    if (open) update?.();
  }, [open, update]);

  // 고정 좌표 사용 시 메뉴 위치를 조정
  useEffect(() => {
    if (
      !open ||
      !floatingRef.current ||
      typeof fixedX !== "number" ||
      typeof fixedY !== "number"
    ) {
      setAdjustedPos(null);
      return;
    }

    const timer = requestAnimationFrame(() => {
      const rect = floatingRef.current?.getBoundingClientRect();
      if (!rect) return;

      let adjustedX = fixedX + offsetX;
      let adjustedY = fixedY + offsetY;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const menuWidth = rect.width;
      const menuHeight = rect.height;
      const padding = 5; // 창 가장자리로부터의 패딩

      // 오른쪽 경계를 벗어나면 왼쪽 정렬로 변경
      if (adjustedX + menuWidth > viewportWidth - padding) {
        adjustedX = fixedX - menuWidth + offsetX;
      }

      // 아래쪽 경계를 벗어나면 위쪽 정렬로 변경
      if (adjustedY + menuHeight > viewportHeight - padding) {
        adjustedY = fixedY - menuHeight + offsetY;
      }

      // 왼쪽 경계를 벗어나면 오른쪽 정렬로 변경
      if (adjustedX < padding) {
        adjustedX = padding;
      }

      // 위쪽 경계를 벗어나면 아래쪽 정렬로 변경
      if (adjustedY < padding) {
        adjustedY = padding;
      }

      setAdjustedPos({ x: adjustedX, y: adjustedY });
    });

    return () => cancelAnimationFrame(timer);
  }, [open, fixedX, fixedY, offsetX, offsetY]);

  useEffect(() => {
    if (!open || autoClose) return;

    let pointerCapturedInside = false;

    const floatingEl = refs.floating.current;
    const referenceEl = referenceRef?.current ?? null;

    const handlePointerDownInside = () => {
      pointerCapturedInside = true;
    };

    const handlePointerUp = () => {
      pointerCapturedInside = false;
    };

    const handleDocumentDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const interactiveEls = interactiveRefs
        .map((r) => r?.current)
        .filter(Boolean) as HTMLElement[];
      if (!floatingEl) return;

      const isInsideFloating = floatingEl.contains(target);
      const isInsideReference = referenceEl?.contains(target) ?? false;
      const isInsideInteractive = interactiveEls.some((el) =>
        el.contains(target as Node)
      );

      if (isInsideFloating) {
        pointerCapturedInside = true;
        return;
      }

      if (
        pointerCapturedInside &&
        (event.type === "pointerdown" || event.type === "mousedown")
      ) {
        pointerCapturedInside = false;
      }

      if (isInsideReference || isInsideInteractive) {
        pointerCapturedInside = false;
        return;
      }

      if (pointerCapturedInside) {
        return;
      }

      onClose?.();
    };

    floatingEl?.addEventListener("pointerdown", handlePointerDownInside);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointerdown", handleDocumentDown, true);
    document.addEventListener("mousedown", handleDocumentDown, true);

    return () => {
      floatingEl?.removeEventListener("pointerdown", handlePointerDownInside);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointerdown", handleDocumentDown, true);
      document.removeEventListener("mousedown", handleDocumentDown, true);
    };
  }, [open, autoClose, onClose, referenceRef, refs.floating]);

  if (!open) return null;

  const isFixed = typeof fixedX === "number" && typeof fixedY === "number";

  // 고정 좌표를 사용할 때는 조정된 위치, 아니면 기본 위치를 사용합
  let left: number;
  let top: number;

  if (isFixed && adjustedPos) {
    left = adjustedPos.x;
    top = adjustedPos.y;
  } else if (isFixed) {
    // adjustedPos 계산 대기 중이면 기본 위치 사용
    left = (fixedX as number) + offsetX;
    top = (fixedY as number) + offsetY;
  } else {
    left = (x ?? 0) + offsetX;
    top = (y ?? 0) + offsetY;
  }

  return (
    <div
      ref={(node) => {
        refs.setFloating(node);
        floatingRef.current = node;
      }}
      style={{
        position: isFixed ? "fixed" : (strategy as any),
        left,
        top,
      }}
      className={`${className} tooltip-fade-in`}
      role="dialog"
      aria-modal="false"
    >
      {children}
    </div>
  );
};

export default FloatingPopup;
