import React, {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { Key } from "@components/Key";
import { DEFAULT_NOTE_SETTINGS } from "@constants/overlayConfig";
import { useCustomCssInjection } from "@hooks/useCustomCssInjection";
import { useCustomJsInjection } from "@hooks/useCustomJsInjection";
import { useNoteSystem } from "@hooks/useNoteSystem";
import { useAppBootstrap } from "@hooks/useAppBootstrap";
import { useKeyStore } from "@stores/useKeyStore";
import {
  setKeyActive as setKeyActiveSignal,
  resetAllKeySignals,
} from "@stores/keySignals";
import { useSettingsStore } from "@stores/useSettingsStore";
import { getKeyInfoByGlobalKey } from "@utils/KeyMaps";
import {
  createDefaultCounterSettings,
  type KeyPosition,
} from "@src/types/keys";
import KeyCounterLayer from "@components/overlay/KeyCounterLayer";
import { PluginElementsRenderer } from "@components/PluginElementsRenderer";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";

const FALLBACK_POSITION: KeyPosition = {
  dx: 0,
  dy: 0,
  width: 60,
  height: 60,
  activeImage: "",
  inactiveImage: "",
  activeTransparent: false,
  idleTransparent: false,
  count: 0,
  noteColor: "#FFFFFF",
  noteOpacity: 80,
  className: "",
  counter: createDefaultCounterSettings(),
};

const PADDING = 30;

const OverlayKey = Key as React.ComponentType<any>;

// Tracks 레이지 로딩
const Tracks = lazy(async () => {
  const mod = await import("@components/overlay/WebGLTracksOGL.jsx");
  return { default: mod.WebGLTracksOGL as React.ComponentType<any> };
});

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type KeyDelayTimerEntry = { timers: Set<ReturnType<typeof setTimeout>> };

export default function App() {
  useCustomCssInjection();
  useCustomJsInjection();
  useAppBootstrap();
  const developerModeEnabled = useSettingsStore(
    (state) => state.developerModeEnabled
  );

  // 개발자 모드 비활성 시 DevTools 단축키 차단
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isDevtoolsCombo =
        ((e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          e.key.toLowerCase() === "i") ||
        e.key === "F12";
      if (!developerModeEnabled && isDevtoolsCombo) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [developerModeEnabled]);

  // 윈도우 타입
  useEffect(() => {
    try {
      (window as any).__dmn_window_type = "overlay";
    } catch (e) {
      // ignore
    }
    return () => {
      try {
        delete (window as any).__dmn_window_type;
      } catch (e) {
        // ignore
      }
    };
  }, []);

  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  const keyMappings = useKeyStore((state) => state.keyMappings);
  const positions = useKeyStore((state) => state.positions);
  const pluginElements = usePluginDisplayElementStore(
    (state) => state.elements
  );

  const backgroundColor = useSettingsStore((state) => state.backgroundColor);
  const noteSettings = useSettingsStore((state) => state.noteSettings);
  const noteEffect = useSettingsStore((state) => state.noteEffect);
  const laboratoryEnabled = useSettingsStore(
    (state) => state.laboratoryEnabled
  );
  const overlayAnchor = useSettingsStore((state) => state.overlayResizeAnchor);
  const keyCounterEnabled = useSettingsStore(
    (state) => state.keyCounterEnabled
  );

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

  // 키 딜레이 설정 (실험적 기능)
  const keyDisplayDelayMs =
    laboratoryEnabled && noteSettings?.keyDisplayDelayMs
      ? noteSettings.keyDisplayDelayMs
      : 0;

  // 키 딜레이 값을 ref로 관리하여 클로저 문제 방지
  const keyDisplayDelayMsRef = useRef(keyDisplayDelayMs);
  useEffect(() => {
    keyDisplayDelayMsRef.current = keyDisplayDelayMs;
  }, [keyDisplayDelayMs]);

  // 키 딜레이 타이머 관리 (down/up 별도 관리)
  const keyDelayTimersRef = useRef<Map<string, KeyDelayTimerEntry>>(new Map());

  // 키 딜레이 적용된 신호 업데이트
  const updateKeySignalWithDelay = useCallback(
    (key: string, isDown: boolean) => {
      const delayMs = keyDisplayDelayMsRef.current;

      let timerEntry = keyDelayTimersRef.current.get(key);
      if (!timerEntry) {
        timerEntry = { timers: new Set() };
        keyDelayTimersRef.current.set(key, timerEntry);
      }

      if (delayMs <= 0) {
        // 딜레이가 0일 경우 즉시 업데이트 
        // 기존 타이머 모두 취소 
        timerEntry.timers.forEach((timer) => clearTimeout(timer));
        timerEntry.timers.clear();
        setKeyActiveSignal(key, isDown);
        return;
      }

      const timer = setTimeout(() => {
        setKeyActiveSignal(key, isDown);
        timerEntry?.timers.delete(timer);
      }, delayMs);
      timerEntry.timers.add(timer);
    },
    [] // ref를 사용하므로 dependency 불필요
  );

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
    // 키 이벤트 버스 초기화 (백엔드에서 한 번만 구독)
    import("@utils/keyEventBus").then(({ keyEventBus }) => {
      keyEventBus.initialize();
    });

    // 버스를 통해 키 이벤트 수신
    const unsubscribe = import("@utils/keyEventBus").then(({ keyEventBus }) => {
      return keyEventBus.subscribe(({ key, state }) => {
        const isDown = state === "DOWN";
        // 키 UI 업데이트 (딜레이 적용)
        updateKeySignalWithDelay(key, isDown);
        // 노트 이펙트는 즉시 처리 (딜레이 없음)
        if (noteEffect) {
          requestAnimationFrame(() => {
            if (isDown) handleKeyDown(key);
            else handleKeyUp(key);
          });
        }
      });
    });

    return () => {
      unsubscribe.then((unsub) => {
        try {
          unsub?.();
        } catch (error) {
          console.error("Failed to remove key state listener", error);
        }
      });
      // 키 딜레이 타이머 정리
      keyDelayTimersRef.current.forEach((timerEntry) => {
        timerEntry.timers.forEach((timer) => clearTimeout(timer));
        timerEntry.timers.clear();
      });
      keyDelayTimersRef.current.clear();
      // 안전하게 모든 키 신호 초기화(선택적)
      resetAllKeySignals();
    };
  }, [handleKeyDown, handleKeyUp, noteEffect, updateKeySignalWithDelay]);

  const currentKeys = useMemo(
    () => keyMappings[selectedKeyType] ?? [],
    [keyMappings, selectedKeyType]
  );

  const currentPositions = useMemo<KeyPosition[]>(
    () => positions[selectedKeyType] ?? [],
    [positions, selectedKeyType]
  );

  const bounds = useMemo<Bounds | null>(() => {
    if (!currentPositions.length && !pluginElements.length) return null;

    const xs: number[] = [];
    const ys: number[] = [];
    const widths: number[] = [];
    const heights: number[] = [];

    // 키 위치
    currentPositions.forEach((pos) => {
      xs.push(pos.dx);
      ys.push(pos.dy);
      widths.push(pos.dx + pos.width);
      heights.push(pos.dy + pos.height);
    });

    // 플러그인 요소 위치 (앵커 기반 계산 포함)
    pluginElements
      .filter((el) => !el.tabId || el.tabId === selectedKeyType)
      .forEach((element) => {
        let x = element.position.x;
        let y = element.position.y;

        // 앵커 기반 위치 계산
        if (element.anchor?.keyCode && selectedKeyType) {
          const keyIndex = currentKeys.findIndex(
            (key) => key === element.anchor?.keyCode
          );
          if (keyIndex >= 0 && currentPositions[keyIndex]) {
            const keyPosition = currentPositions[keyIndex];
            const offsetX = element.anchor.offset?.x ?? 0;
            const offsetY = element.anchor.offset?.y ?? 0;
            x = keyPosition.dx + offsetX;
            y = keyPosition.dy + offsetY;
          }
        }

        // 실제 측정된 크기 또는 추정 크기 사용
        const width =
          element.measuredSize?.width ?? element.estimatedSize?.width ?? 200;
        const height =
          element.measuredSize?.height ?? element.estimatedSize?.height ?? 150;

        xs.push(x);
        ys.push(y);
        widths.push(x + width);
        heights.push(y + height);
      });

    if (xs.length === 0) return null;

    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...widths),
      maxY: Math.max(...heights),
    };
  }, [currentPositions, pluginElements, selectedKeyType, currentKeys]);

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

  // 오버레이의 위치 오프셋 계산
  const positionOffset = useMemo(() => {
    if (!bounds) return { x: 0, y: 0 };
    const topOffset = trackHeight + PADDING;
    return {
      x: PADDING - bounds.minX,
      y: topOffset - bounds.minY,
    };
  }, [bounds, trackHeight]);

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

  // 이전 resize 값을 추적하여 실제로 변경되었을 때만 resize 호출
  const lastResizeParams = useRef<{
    width: number;
    height: number;
    anchor: string;
    contentTopOffset: number;
  } | null>(null);

  useEffect(() => {
    if (!bounds) return;

    const keyAreaWidth = bounds.maxX - bounds.minX;
    const keyAreaHeight = bounds.maxY - bounds.minY;
    const extraTop = trackHeight;
    const totalWidth = keyAreaWidth + PADDING * 2;
    const totalHeight = keyAreaHeight + PADDING * 2 + extraTop;
    const contentTopOffset = extraTop + PADDING;

    // 이전 값과 비교하여 실제로 변경되었을 때만 resize 호출
    const lastParams = lastResizeParams.current;
    if (
      lastParams &&
      Math.abs(lastParams.width - totalWidth) < 0.5 &&
      Math.abs(lastParams.height - totalHeight) < 0.5 &&
      lastParams.anchor === overlayAnchor &&
      Math.abs(lastParams.contentTopOffset - contentTopOffset) < 0.5
    ) {
      return; // 변경사항 없음, resize 건너뛰기
    }

    lastResizeParams.current = {
      width: totalWidth,
      height: totalHeight,
      anchor: overlayAnchor,
      contentTopOffset,
    };

    window.api.overlay
      .resize({
        width: totalWidth,
        height: totalHeight,
        anchor: overlayAnchor,
        contentTopOffset,
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
            mode={selectedKeyType}
            counterEnabled={keyCounterEnabled}
          />
        );
      })}
      {keyCounterEnabled ? (
        <KeyCounterLayer
          keys={currentKeys}
          positions={
            displayPositions.length ? displayPositions : currentPositions
          }
          mode={selectedKeyType}
        />
      ) : null}
      <PluginElementsRenderer
        windowType="overlay"
        positionOffset={positionOffset}
      />
    </div>
  );
}
