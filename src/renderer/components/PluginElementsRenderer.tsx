import React, { useEffect } from "react";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import { PluginElement } from "./PluginElement";
import type { PluginDisplayElementInternal } from "@src/types/api";

interface PluginElementsRendererProps {
  windowType: "main" | "overlay";
  positionOffset?: { x: number; y: number };
}

export const PluginElementsRenderer: React.FC<PluginElementsRendererProps> = ({
  windowType,
  positionOffset = { x: 0, y: 0 },
}) => {
  const elements = usePluginDisplayElementStore((state) => state.elements);
  const setElements = usePluginDisplayElementStore(
    (state) => state.setElements
  );

  // 오버레이에서 메인의 브릿지 메시지 수신
  useEffect(() => {
    if (windowType !== "overlay") return;

    const unsubscribe = window.api.bridge.on<{
      elements: PluginDisplayElementInternal[];
    }>("plugin:displayElements:sync", (data) => {
      if (data?.elements) {
        setElements(data.elements);
      }
    });

    // 오버레이 초기 로드 시 메인에 현재 상태 요청
    window.api.bridge.sendTo("main", "plugin:displayElements:request", {});

    return () => {
      unsubscribe();
    };
  }, [windowType, setElements]);

  // 메인 윈도우에서 오버레이의 상태 요청 처리
  useEffect(() => {
    if (windowType !== "main") return;

    const unsubscribe = window.api.bridge.on(
      "plugin:displayElements:request",
      () => {
        // 현재 상태를 오버레이로 전송
        const currentElements =
          usePluginDisplayElementStore.getState().elements;
        window.api.bridge.sendTo("overlay", "plugin:displayElements:sync", {
          elements: currentElements,
        });
      }
    );

    return () => {
      unsubscribe();
    };
  }, [windowType]);

  return (
    <>
      {elements.map((element) => (
        <PluginElement
          key={element.fullId}
          element={element}
          windowType={windowType}
          positionOffset={positionOffset}
        />
      ))}
    </>
  );
};
