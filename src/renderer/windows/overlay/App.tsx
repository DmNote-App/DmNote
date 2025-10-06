import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Key } from "@components/Key";
import { DEFAULT_NOTE_SETTINGS } from "@constants/overlayConfig";
import { useCustomCssInjection } from "@hooks/useCustomCssInjection";
import { useNoteSystem } from "@hooks/useNoteSystem";
import { useAppBootstrap } from "@hooks/useAppBootstrap";
import { useKeyStore } from "@stores/useKeyStore";
import {
  setKeyActive as setKeyActiveSignal,
  resetAllKeySignals,
} from "@stores/keySignals";
import { useSettingsStore } from "@stores/useSettingsStore";
import { getKeyInfoByGlobalKey } from "@utils/KeyMaps";
import type { KeyPosition } from "@src/types/keys";

const FALLBACK_POSITION: KeyPosition = {
  dx: 0,
  dy: 0,
  width: 60,
  height: 60,
  activeImage: "",
  inactiveImage: "",
  count: 0,
  noteColor: "#FFFFFF",
  noteOpacity: 80,
  className: "",
};

const PADDING = 30;

const OverlayKey = Key as React.ComponentType<any>;

// Tracks 레이지 로딩
const Tracks = lazy(async () => {
  const mod = await import("@components/overlay/WebGLTracksOGL.jsx");
  return { default: mod.WebGLTracksOGL as React.ComponentType<any> };
});

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export default function App() {
  useCustomCssInjection();
  useAppBootstrap();

  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  const keyMappings = useKeyStore((state) => state.keyMappings);
  const positions = useKeyStore((state) => state.positions);

  const backgroundColor = useSettingsStore((state) => state.backgroundColor);
  const noteSettings = useSettingsStore((state) => state.noteSettings);
  const noteEffect = useSettingsStore((state) => state.noteEffect);
  const laboratoryEnabled = useSettingsStore(
    (state) => state.laboratoryEnabled
  );
  const overlayAnchor = useSettingsStore((state) => state.overlayResizeAnchor);

  const {
    notesRef,
    subscribe,
    handleKeyDown,
    handleKeyUp,
    noteBuffer,
    updateTrackLayouts,
  } = useNoteSystem({
    noteEffect,
    noteSettings,
    laboratoryEnabled,
  });

  const trackHeight =
    noteSettings?.trackHeight ?? DEFAULT_NOTE_SETTINGS.trackHeight;

  // 키 활성 상태는 signals로 관리하여 App 리렌더를 방지
  const [layoutVersion, setLayoutVersion] = useState(0);

  useEffect(() => {
    const onResize = () => setLayoutVersion((value) => value + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setLayoutVersion((value) => value + 1);
  }, [trackHeight]);

  useEffect(() => {
    const unsubscribe = window.api.keys.onKeyState(({ key, state }) => {
      const isDown = state === "DOWN";
      // 개별 Key가 신호를 직접 구독
      setKeyActiveSignal(key, isDown);
      // 노트 이펙트가 활성화된 경우에만 핸들러 호출
      if (noteEffect) {
        requestAnimationFrame(() => {
          if (isDown) handleKeyDown(key);
          else handleKeyUp(key);
        });
      }
    });

    return () => {
      try {
        unsubscribe();
      } catch (error) {
        console.error("Failed to remove key state listener", error);
      }
      // 안전하게 모든 키 신호 초기화(선택적)
      resetAllKeySignals();
    };
  }, [handleKeyDown, handleKeyUp, noteEffect]);

  const currentKeys = useMemo(
    () => keyMappings[selectedKeyType] ?? [],
    [keyMappings, selectedKeyType]
  );

  const currentPositions = useMemo<KeyPosition[]>(
    () => positions[selectedKeyType] ?? [],
    [positions, selectedKeyType]
  );

  const bounds = useMemo<Bounds | null>(() => {
    if (!currentPositions.length) return null;

    const xs = currentPositions.map((pos) => pos.dx);
    const ys = currentPositions.map((pos) => pos.dy);
    const widths = currentPositions.map((pos) => pos.dx + pos.width);
    const heights = currentPositions.map((pos) => pos.dy + pos.height);

    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...widths),
      maxY: Math.max(...heights),
    };
  }, [currentPositions]);

  const displayPositions = useMemo<KeyPosition[]>(() => {
    if (!bounds || !currentPositions.length) {
      return currentPositions;
    }

    const topOffset = trackHeight + PADDING;
    const offsetX = PADDING - bounds.minX;
    const offsetY = topOffset - bounds.minY;

    return currentPositions.map((position) => ({
      ...position,
      dx: position.dx + offsetX,
      dy: position.dy + offsetY,
    }));
  }, [currentPositions, bounds, trackHeight, layoutVersion]);

  const topMostY = useMemo(() => {
    if (!displayPositions.length) return 0;
    return Math.min(...displayPositions.map((position) => position.dy));
  }, [displayPositions]);

  const webglTracks = useMemo(
    () =>
      currentKeys.map((key, index) => {
        const originalPosition = currentPositions[index] ?? FALLBACK_POSITION;
        const position = displayPositions[index] ?? originalPosition;
        const trackStartY = topMostY;

        return {
          trackKey: key,
          trackIndex: index,
          position: { ...position, dy: trackStartY },
          width: position.width,
          height: trackHeight,
          noteColor: position.noteColor,
          noteOpacity: position.noteOpacity,
          flowSpeed: noteSettings?.speed ?? DEFAULT_NOTE_SETTINGS.speed,
          borderRadius:
            noteSettings?.borderRadius ?? DEFAULT_NOTE_SETTINGS.borderRadius,
        };
      }),
    [
      currentKeys,
      currentPositions,
      displayPositions,
      topMostY,
      trackHeight,
      noteSettings?.speed,
      noteSettings?.borderRadius,
    ]
  );

  useEffect(() => {
    updateTrackLayouts(webglTracks);
  }, [webglTracks, updateTrackLayouts]);

  useEffect(() => {
    if (!bounds) return;

    const keyAreaWidth = bounds.maxX - bounds.minX;
    const keyAreaHeight = bounds.maxY - bounds.minY;
    const extraTop = trackHeight;
    const totalWidth = keyAreaWidth + PADDING * 2;
    const totalHeight = keyAreaHeight + PADDING * 2 + extraTop;

    window.api.overlay
      .resize({
        width: totalWidth,
        height: totalHeight,
        anchor: overlayAnchor,
        contentTopOffset: extraTop + PADDING,
      })
      .catch((error) => {
        console.error("Failed to resize overlay window", error);
      });
  }, [bounds, trackHeight, overlayAnchor]);

  return (
    <div
      className="relative w-full h-screen m-0 overflow-hidden [app-region:drag]"
      style={{
        backgroundColor:
          backgroundColor === "transparent" ? "transparent" : backgroundColor,
        willChange: "contents",
        contain: "layout style paint",
      }}
    >
      {noteEffect && (
        <Suspense fallback={null}>
          <Tracks
            tracks={webglTracks}
            notesRef={notesRef}
            subscribe={subscribe}
            noteSettings={noteSettings}
            laboratoryEnabled={laboratoryEnabled}
            noteBuffer={noteBuffer}
          />
        </Suspense>
      )}

      {currentKeys.map((key, index) => {
        const { displayName } = getKeyInfoByGlobalKey(key);
        const position =
          displayPositions[index] ??
          currentPositions[index] ??
          FALLBACK_POSITION;

        return (
          <OverlayKey
            key={`${selectedKeyType}-${index}`}
            keyName={displayName}
            globalKey={key}
            position={position}
          />
        );
      })}
    </div>
  );
}
