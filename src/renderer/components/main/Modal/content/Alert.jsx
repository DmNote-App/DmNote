import React, { useRef, useState, useCallback, useEffect } from "react";
import { useTranslation } from "@contexts/I18nContext";
import Modal from "../Modal";

export default function Alert({
  isOpen,
  message,
  type = "alert", // "alert", "confirm", or "custom"
  confirmText,
  cancelText,
  showCancel,
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  const { t } = useTranslation();
  const confirmLabel = confirmText || t("common.confirm");
  const cancelLabel = cancelText || t("common.cancel");

  const isConfirm = type === "confirm";
  const isCustom = type === "custom";
  const shouldShowCancel = isConfirm || (isCustom && showCancel);

  const scrollRef = useRef(null);
  const [scrollState, setScrollState] = useState({
    canScrollUp: false,
    canScrollDown: false,
  });

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const canScrollUp = el.scrollTop > 0;
    const canScrollDown = el.scrollTop < el.scrollHeight - el.clientHeight - 1;

    setScrollState({ canScrollUp, canScrollDown });
  }, []);

  useEffect(() => {
    if (isCustom) {
      // DOM이 렌더링된 후 스크롤 상태 확인
      const timer = setTimeout(updateScrollState, 0);
      return () => clearTimeout(timer);
    }
  }, [isCustom, message, updateScrollState]);

  return (
    <Modal onClick={onCancel}>
      <div
        className="flex flex-col bg-[#1A191E] rounded-[13px] border-[1px] border-[#2A2A30] p-[20px] pr-[6px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 메시지 텍스트 or Custom HTML */}
        {isCustom ? (
          <div className="relative">
            {/* 상단 그림자 */}
            <div
              className={`absolute top-0 left-0 right-[14px] h-[10px] bg-gradient-to-b from-[#1A191E] to-transparent pointer-events-none z-10 transition-opacity duration-150 ${
                scrollState.canScrollUp ? "opacity-100" : "opacity-0"
              }`}
            />

            <div
              ref={scrollRef}
              className="max-h-[244px] overflow-y-auto modal-content-scroll pr-[14px] text-center text-[#FFFFFF]"
              onScroll={updateScrollState}
              dangerouslySetInnerHTML={{ __html: message }}
            />

            {/* 하단 그림자 */}
            <div
              className={`absolute bottom-0 left-0 right-[14px] h-[10px] bg-gradient-to-t from-[#1A191E] to-transparent pointer-events-none z-10 transition-opacity duration-150 ${
                scrollState.canScrollDown ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
        ) : (
          <div className="max-w-[235.5px] text-center text-[#FFFFFF] text-style-3 !leading-[20px] pr-[14px]">
            {message}
          </div>
        )}

        {/* 버튼들 */}
        <div
          className={`flex ${
            !shouldShowCancel ? "justify-center" : ""
          } gap-[10.5px] mt-[19px] pr-[14px]`}
        >
          <button
            onClick={onConfirm}
            className={`w-${
              shouldShowCancel ? "[150px]" : "full"
            } h-[30px] bg-[#2A2A30] hover:bg-[#303036] active:bg-[#393941] rounded-[7px] text-[#DCDEE7] text-style-3`}
          >
            {confirmLabel}
          </button>
          {shouldShowCancel && (
            <button
              onClick={onCancel}
              className="w-[75px] h-[30px] bg-[#3C1E1E] hover:bg-[#442222] active:bg-[#522929] rounded-[7px] text-[#E6DBDB] text-style-3"
            >
              {cancelLabel}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
