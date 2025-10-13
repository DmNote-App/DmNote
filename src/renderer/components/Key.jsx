import React, { memo, useMemo } from "react";
import { getKeySignal } from "@stores/keySignals";
import { getKeyCounterSignal } from "@stores/keyCounterSignals";
import { useSignals } from "@preact/signals-react/runtime";
import { useDraggable } from "@hooks/useDraggable";
import { getKeyInfoByGlobalKey } from "@utils/KeyMaps";
import {
  createDefaultCounterSettings,
  normalizeCounterSettings,
} from "@src/types/keys";

export default function DraggableKey({
  index,
  position,
  keyName,
  onPositionChange,
  onClick,
  activeTool,
  onEraserClick,
  onContextMenu,
  setReferenceRef,
}) {
  const { displayName } = getKeyInfoByGlobalKey(keyName);
  const {
    dx,
    dy,
    width,
    height = 60,
    activeImage,
    inactiveImage,
    className,
  } = position;
  const draggable = useDraggable({
    gridSize: 5,
    initialX: dx,
    initialY: dy,
    onPositionChange: (newDx, newDy) => onPositionChange(index, newDx, newDy),
  });

  const handleClick = (e) => {
    if (activeTool === "eraser") {
      onEraserClick?.();
      return;
    }
    if (!draggable.wasMoved) onClick(e);
  };

  // 드래그 중에는 훅의 dx/dy 사용 (부모 리렌더 최소화)
  const renderDx = draggable.dx;
  const renderDy = draggable.dy;

  const keyStyle = useMemo(
    () => ({
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate3d(${renderDx}px, ${renderDy}px, 0)`,
      backgroundColor: `var(--key-bg, ${
        inactiveImage ? "transparent" : "rgba(46, 46, 47, 0.9)"
      })`,
      borderRadius: `var(--key-radius, ${inactiveImage ? "0" : "10px"})`,
      border: `var(--key-border, ${
        inactiveImage ? "none" : "3px solid rgba(113, 113, 113, 0.9)"
      })`,
      overflow: inactiveImage ? "visible" : "hidden",
      willChange: "transform",
      backfaceVisibility: "hidden",
      transformStyle: "preserve-3d",
      contain: "layout style paint",
      imageRendering: "auto",
      isolation: "isolate",
      boxSizing: "border-box",
    }),
    [renderDx, renderDy, width, height, inactiveImage]
  );

  const imageStyle = useMemo(
    () => ({
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
      pointerEvents: "none",
      userSelect: "none",
    }),
    []
  );

  const textStyle = useMemo(
    () => ({
      willChange: "auto",
      contain: "layout style paint",
      color: "var(--key-text-color, #717171)",
    }),
    []
  );

  const attachRef = (node) => {
    // 드래그 훅에 ref 연결
    draggable.ref(node);
    // 팝업 위치 지정을 위해 부모에 노드 전달
    if (typeof setReferenceRef === "function") setReferenceRef(node);
  };

  return (
    <div
      ref={attachRef}
      className={`absolute cursor-pointer ${
        draggable && draggable.wasMoved ? "" : ""
      } ${className || ""}`}
      style={keyStyle}
      data-state="inactive"
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e);
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      {inactiveImage ? (
        <img src={inactiveImage} alt="" style={imageStyle} draggable={false} />
      ) : (
        <div
          className="flex items-center justify-center h-full font-bold"
          style={textStyle}
        >
          {displayName}
        </div>
      )}
    </div>
  );
}

export const Key = memo(
  ({ keyName, globalKey, position, mode, counterEnabled = false }) => {
    // React 환경에서 신호 변경을 구독하도록 활성화
    useSignals();
    // 각 Key는 자신의 활성 상태 신호를 직접 구독
    const selectorKey = globalKey || keyName;
    const active = getKeySignal(selectorKey).value;
    const {
      dx,
      dy,
      width,
      height = 60,
      activeImage,
      inactiveImage,
      className, // 단일 클래스 네임으로 통일
    } = position;

    // 활성 상태에서 activeImage가 없으면 inactiveImage를 fallback으로 사용
    const currentImage =
      active && activeImage
        ? activeImage
        : inactiveImage
        ? inactiveImage
        : null;

    const keyStyle = useMemo(
      () => ({
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate3d(${dx}px, ${dy}px, 0)`,
        backgroundColor: `var(--key-bg, ${
          currentImage
            ? "transparent"
            : active
            ? "rgba(121, 121, 121, 0.9)"
            : "rgba(46, 46, 47, 0.9)"
        })`,
        borderRadius: `var(--key-radius, ${currentImage ? "0" : "10px"})`,
        border: `var(--key-border, ${
          currentImage
            ? "none"
            : active
            ? "3px solid rgba(255, 255, 255, 0.9)"
            : "3px solid rgba(113, 113, 113, 0.9)"
        })`,
        color: `var(--key-text-color, ${
          active && !activeImage ? "#FFFFFF" : "rgba(121, 121, 121, 0.9)"
        })`,
        overflow: currentImage ? "visible" : "hidden",
        // GPU 가속 최적화: active 상태 변경 시에만 willChange 적용
        willChange: active ? "transform, background-color" : "transform",
        backfaceVisibility: "hidden",
        transformStyle: "preserve-3d",
        contain: "layout style paint",
        imageRendering: "auto",
        isolation: "isolate",
        boxSizing: "border-box",
      }),
      [active, activeImage, inactiveImage, dx, dy, width, height, currentImage]
    );

    const imageStyle = useMemo(
      () => ({
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
        pointerEvents: "none",
        userSelect: "none",
        position: "relative",
        zIndex: 0,
      }),
      []
    );

    const textStyle = useMemo(
      () => ({
        willChange: "auto",
        contain: "layout style paint",
      }),
      []
    );

    // 텍스트 표시 조건: 현재 상태에 사용할 이미지가 없을 때만 텍스트를 표시
    const counterSettings = normalizeCounterSettings(
      position?.counter ?? createDefaultCounterSettings()
    );
    const showInsideCounter =
      counterEnabled && counterSettings.placement === "inside";

    let counterSignal;
    if (showInsideCounter) {
      counterSignal = getKeyCounterSignal(mode ?? "", globalKey);
    }

    const counterValue = counterSignal?.value ?? 0;

    const showText = !currentImage;

    const counterFillColor = active
      ? counterSettings.fill.active
      : counterSettings.fill.idle;
    const counterStrokeColor = active
      ? counterSettings.stroke.active
      : counterSettings.stroke.idle;

    const renderInsideLayout = () => {
      if (!showInsideCounter) {
        return null;
      }

      const displayValue = counterValue || 0;
      const strokeWidth = counterStrokeColor ? "1px" : "0px";

      const counterElement = (
        <span
          key="counter"
          className="counter-text pointer-events-none select-none"
          data-text={displayValue}
          style={{
            color: counterFillColor,
            fontSize: "16px",
            fontWeight: 800,
            lineHeight: 1,
            "--counter-stroke-color": counterStrokeColor || "transparent",
            "--counter-stroke-width": strokeWidth,
          }}
        >
          {displayValue}
        </span>
      );

      const nameElement = (
        <span
          key="label"
          className="font-bold text-[14px] pointer-events-none select-none"
          style={textStyle}
        >
          {keyName}
        </span>
      );

      if (
        counterSettings.align === "left" ||
        counterSettings.align === "right"
      ) {
        const elements =
          counterSettings.align === "left"
            ? [counterElement, nameElement]
            : [nameElement, counterElement];
        const containerClass = "flex w-full h-full items-center pointer-events-none select-none justify-between";
        return (
          <div className={containerClass} style={{ padding: "6px" }}>
            {elements}
          </div>
        );
      }

      const elements =
        counterSettings.align === "top"
          ? [counterElement, nameElement]
          : [nameElement, counterElement];
      const containerClass = `flex flex-col w-full h-full items-center pointer-events-none select-none gapㅇ-[6px] justify-between`;
      return (
        <div className={containerClass} style={{ padding: "6px" }}>
          {elements}
        </div>
      );
    };

    return (
      <div
        className={`absolute ${className || ""}`}
        style={keyStyle}
        data-state={active ? "active" : "inactive"}
      >
        {currentImage ? (
          <img src={currentImage} alt="" style={imageStyle} draggable={false} />
        ) : showText ? (
          showInsideCounter ? (
            renderInsideLayout()
          ) : (
            <div
              className="flex items-center justify-center h-full font-bold"
              style={textStyle}
            >
              {keyName}
            </div>
          )
        ) : null}
        {active && !activeImage && inactiveImage ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: "rgba(0,0,0,0.4)",
              borderRadius: "inherit",
              pointerEvents: "none",
              zIndex: 1,
              WebkitMaskImage: `url(${currentImage})`,
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskSize: "100% 100%",
              maskImage: `url(${currentImage})`,
              maskRepeat: "no-repeat",
              maskSize: "100% 100%",
            }}
          />
        ) : null}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // active는 내부 selector로 구독하므로 여기서는 position/keyName만 비교
    return (
      prevProps.keyName === nextProps.keyName &&
      prevProps.mode === nextProps.mode &&
      prevProps.counterEnabled === nextProps.counterEnabled &&
      prevProps.position.dx === nextProps.position.dx &&
      prevProps.position.dy === nextProps.position.dy &&
      prevProps.position.width === nextProps.position.width &&
      prevProps.position.height === nextProps.position.height &&
      prevProps.position.activeImage === nextProps.position.activeImage &&
      prevProps.position.inactiveImage === nextProps.position.inactiveImage &&
      prevProps.position.className === nextProps.position.className &&
      prevProps.position.counter?.placement ===
        nextProps.position.counter?.placement &&
      prevProps.position.counter?.align === nextProps.position.counter?.align &&
      prevProps.position.counter?.fill?.idle ===
        nextProps.position.counter?.fill?.idle &&
      prevProps.position.counter?.fill?.active ===
        nextProps.position.counter?.fill?.active &&
      prevProps.position.counter?.stroke?.idle ===
        nextProps.position.counter?.stroke?.idle &&
      prevProps.position.counter?.stroke?.active ===
        nextProps.position.counter?.stroke?.active
    );
  }
);
