import { useState, useCallback } from "react";
import { useKeyStore } from "@stores/useKeyStore";
import { useHistoryStore } from "@stores/useHistoryStore";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import { setUndoRedoInProgress } from "@api/pluginDisplayElements";
import type {
  KeyMappings,
  KeyPositions,
  NoteColor,
  KeyCounterSettings,
} from "@src/types/keys";
import {
  createDefaultCounterSettings,
  normalizeCounterSettings,
} from "@src/types/keys";

type SelectedKey = { key: string; index: number } | null;

type KeyUpdatePayload = {
  key: string;
  activeImage?: string;
  inactiveImage?: string;
  activeTransparent?: boolean;
  idleTransparent?: boolean;
  width: number;
  height: number;
  noteColor?: NoteColor;
  noteOpacity?: number;
  className?: string;
};

type CounterUpdatePayload = KeyCounterSettings;

export function useKeyManager() {
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  const keyMappings = useKeyStore((state) => state.keyMappings);
  const positions = useKeyStore((state) => state.positions);
  const setKeyMappings = useKeyStore((state) => state.setKeyMappings);
  const setPositions = useKeyStore((state) => state.setPositions);

  const pushState = useHistoryStore((state) => state.pushState);
  const canUndo = useHistoryStore((state) => state.canUndo);
  const canRedo = useHistoryStore((state) => state.canRedo);
  const undo = useHistoryStore((state) => state.undo);
  const redo = useHistoryStore((state) => state.redo);

  const [selectedKey, setSelectedKey] = useState<SelectedKey>(null);

  // 플러그인 요소 스토어
  const pluginElements = usePluginDisplayElementStore(
    (state) => state.elements
  );
  const setPluginElements = usePluginDisplayElementStore(
    (state) => state.setElements
  );

  // 히스토리에 현재 상태 저장 (플러그인 요소 포함)
  const saveToHistory = useCallback(() => {
    pushState(keyMappings, positions, pluginElements);
  }, [keyMappings, positions, pluginElements, pushState]);

  const handlePositionChange = (index: number, dx: number, dy: number) => {
    const current = positions[selectedKeyType] || [];
    const oldPosition = current[index];

    // 실제로 위치가 변경된 경우에만 히스토리에 저장
    if (oldPosition && (oldPosition.dx !== dx || oldPosition.dy !== dy)) {
      saveToHistory();
    }

    const nextPositions: KeyPositions = {
      ...positions,
      [selectedKeyType]: current.map((pos, i) =>
        i === index
          ? {
              ...pos,
              dx,
              dy,
            }
          : pos
      ),
    };
    setPositions(nextPositions);
    window.api.keys.updatePositions(nextPositions).catch((error) => {
      console.error("Failed to update key positions", error);
    });
  };

  const handleKeyUpdate = (keyData: KeyUpdatePayload) => {
    // 키 설정 모달에서 적용하기 클릭 시 호출됨
    saveToHistory();

    const mapping = keyMappings[selectedKeyType] || [];
    const pos = positions[selectedKeyType] || [];

    if (selectedKey) {
      const updatedMappings: KeyMappings = {
        ...keyMappings,
        [selectedKeyType]: mapping.map((value, idx) =>
          idx === selectedKey.index ? keyData.key : value
        ),
      };

      const updatedPositions: KeyPositions = {
        ...positions,
        [selectedKeyType]: pos.map((value, idx) =>
          idx === selectedKey.index
            ? {
                ...value,
                activeImage: keyData.activeImage ?? value.activeImage,
                inactiveImage: keyData.inactiveImage ?? value.inactiveImage,
                activeTransparent:
                  keyData.activeTransparent ?? value.activeTransparent ?? false,
                idleTransparent:
                  keyData.idleTransparent ?? value.idleTransparent ?? false,
                width: keyData.width,
                height: keyData.height,
                noteColor: keyData.noteColor ?? value.noteColor ?? "#FFFFFF",
                noteOpacity: keyData.noteOpacity ?? value.noteOpacity ?? 80,
                className: keyData.className ?? value.className ?? "",
              }
            : value
        ),
      };

      setKeyMappings(updatedMappings);
      setPositions(updatedPositions);

      Promise.all([
        window.api.keys.update(updatedMappings),
        window.api.keys.updatePositions(updatedPositions),
      ]).catch((error) => {
        console.error("Failed to persist key update", error);
      });

      setSelectedKey(null);
    }
  };

  const handleAddKey = () => {
    saveToHistory();

    const mapping = keyMappings[selectedKeyType] || [];
    const pos = positions[selectedKeyType] || [];

    const updatedMappings: KeyMappings = {
      ...keyMappings,
      [selectedKeyType]: [...mapping, ""],
    };

    const updatedPositions: KeyPositions = {
      ...positions,
      [selectedKeyType]: [
        ...pos,
        {
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
        },
      ],
    };

    setKeyMappings(updatedMappings);
    setPositions(updatedPositions);

    Promise.all([
      window.api.keys.update(updatedMappings),
      window.api.keys.updatePositions(updatedPositions),
    ]).catch((error) => {
      console.error("Failed to persist new key", error);
    });
  };

  const handleAddKeyAt = (dx: number, dy: number) => {
    saveToHistory();

    const mapping = keyMappings[selectedKeyType] || [];
    const pos = positions[selectedKeyType] || [];

    const updatedMappings: KeyMappings = {
      ...keyMappings,
      [selectedKeyType]: [...mapping, ""],
    };

    const updatedPositions: KeyPositions = {
      ...positions,
      [selectedKeyType]: [
        ...pos,
        {
          dx,
          dy,
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
        },
      ],
    };

    setKeyMappings(updatedMappings);
    setPositions(updatedPositions);

    Promise.all([
      window.api.keys.update(updatedMappings),
      window.api.keys.updatePositions(updatedPositions),
    ]).catch((error) => {
      console.error("Failed to persist new key at position", error);
    });
  };

  const handleDuplicateKey = (sourceIndex: number, dx: number, dy: number) => {
    saveToHistory();

    const mapping = keyMappings[selectedKeyType] || [];
    const pos = positions[selectedKeyType] || [];
    const sourceKey = mapping[sourceIndex];
    const sourcePosition = pos[sourceIndex];

    if (typeof sourceKey === "undefined" || !sourcePosition) {
      return;
    }

    const clonedNoteColor =
      sourcePosition.noteColor &&
      typeof sourcePosition.noteColor === "object" &&
      sourcePosition.noteColor !== null
        ? { ...sourcePosition.noteColor }
        : sourcePosition.noteColor;

    const clonedCounter = sourcePosition.counter
      ? {
          ...sourcePosition.counter,
          fill: { ...sourcePosition.counter.fill },
          stroke: { ...sourcePosition.counter.stroke },
        }
      : createDefaultCounterSettings();

    const snappedDx = Math.round(dx);
    const snappedDy = Math.round(dy);

    const clonedPosition = {
      ...sourcePosition,
      dx: snappedDx,
      dy: snappedDy,
      counter: clonedCounter,
      noteColor: clonedNoteColor,
    };

    const updatedMappings: KeyMappings = {
      ...keyMappings,
      [selectedKeyType]: [...mapping, sourceKey],
    };

    const updatedPositions: KeyPositions = {
      ...positions,
      [selectedKeyType]: [...pos, clonedPosition],
    };

    setKeyMappings(updatedMappings);
    setPositions(updatedPositions);

    Promise.all([
      window.api.keys.update(updatedMappings),
      window.api.keys.updatePositions(updatedPositions),
    ]).catch((error) => {
      console.error("Failed to duplicate key", error);
    });
  };

  const handleNoteColorUpdate = (
    index: number,
    noteColor: NoteColor,
    noteOpacity: number
  ) => {
    // 노트 색상 설정 모달에서 적용하기 클릭 시 호출됨
    saveToHistory();

    const current = positions[selectedKeyType] || [];
    if (!current[index]) return;

    const updatedPositions: KeyPositions = {
      ...positions,
      [selectedKeyType]: current.map((pos, i) =>
        i === index
          ? {
              ...pos,
              noteColor,
              noteOpacity,
            }
          : pos
      ),
    };

    setPositions(updatedPositions);
    window.api.keys.updatePositions(updatedPositions).catch((error) => {
      console.error("Failed to update note color settings", error);
    });
  };

  const handleCounterSettingsUpdate = (
    index: number,
    payload: CounterUpdatePayload
  ) => {
    // 카운터 설정 모달에서 적용하기 클릭 시 호출됨
    saveToHistory();

    const current = positions[selectedKeyType] || [];
    if (!current[index]) return;

    const normalized = normalizeCounterSettings(payload);
    const updatedPositions: KeyPositions = {
      ...positions,
      [selectedKeyType]: current.map((pos, i) =>
        i === index
          ? {
              ...pos,
              counter: normalized,
            }
          : pos
      ),
    };

    setPositions(updatedPositions);
    window.api.keys.updatePositions(updatedPositions).catch((error) => {
      console.error("Failed to update counter settings", error);
    });
  };

  // 미리보기 전용: 오버레이 실시간 업데이트를 위해 로컬 스토어만 갱신, 영구 저장은 하지 않음
  const handleCounterSettingsPreview = (
    index: number,
    payload: CounterUpdatePayload
  ) => {
    const current = positions[selectedKeyType] || [];
    if (!current[index]) return;

    const normalized = normalizeCounterSettings(payload);
    const updatedPositions: KeyPositions = {
      ...positions,
      [selectedKeyType]: current.map((pos, i) =>
        i === index
          ? {
              ...pos,
              counter: normalized,
            }
          : pos
      ),
    };

    setPositions(updatedPositions);
    // 미리보기라도 오버레이에 반영되도록 이벤트 브로드캐스트
    window.api.keys.updatePositions(updatedPositions).catch((error) => {
      console.error("Failed to preview counter settings", error);
    });
  };

  const handleDeleteKey = (indexToDelete: number) => {
    saveToHistory();

    const mapping = keyMappings[selectedKeyType] || [];
    const pos = positions[selectedKeyType] || [];

    const updatedMappings: KeyMappings = {
      ...keyMappings,
      [selectedKeyType]: mapping.filter((_, index) => index !== indexToDelete),
    };

    const updatedPositions: KeyPositions = {
      ...positions,
      [selectedKeyType]: pos.filter((_, index) => index !== indexToDelete),
    };

    setKeyMappings(updatedMappings);
    setPositions(updatedPositions);

    Promise.all([
      window.api.keys.update(updatedMappings),
      window.api.keys.updatePositions(updatedPositions),
    ]).catch((error) => {
      console.error("Failed to delete key", error);
    });

    setSelectedKey(null);
  };

  const handleMoveToFront = (index: number) => {
    saveToHistory();

    const mapping = keyMappings[selectedKeyType] || [];
    const pos = positions[selectedKeyType] || [];

    // 배열의 마지막으로 이동 (렌더링 순서상 맨 앞에 표시됨)
    const keyToMove = mapping[index];
    const posToMove = pos[index];

    const updatedMappings: KeyMappings = {
      ...keyMappings,
      [selectedKeyType]: [...mapping.filter((_, i) => i !== index), keyToMove],
    };

    const updatedPositions: KeyPositions = {
      ...positions,
      [selectedKeyType]: [...pos.filter((_, i) => i !== index), posToMove],
    };

    setKeyMappings(updatedMappings);
    setPositions(updatedPositions);

    Promise.all([
      window.api.keys.update(updatedMappings),
      window.api.keys.updatePositions(updatedPositions),
    ]).catch((error) => {
      console.error("Failed to move key to front", error);
    });
  };

  const handleMoveToBack = (index: number) => {
    saveToHistory();

    const mapping = keyMappings[selectedKeyType] || [];
    const pos = positions[selectedKeyType] || [];

    // 배열의 맨 처음으로 이동 (렌더링 순서상 맨 뒤에 표시됨)
    const keyToMove = mapping[index];
    const posToMove = pos[index];

    const updatedMappings: KeyMappings = {
      ...keyMappings,
      [selectedKeyType]: [keyToMove, ...mapping.filter((_, i) => i !== index)],
    };

    const updatedPositions: KeyPositions = {
      ...positions,
      [selectedKeyType]: [posToMove, ...pos.filter((_, i) => i !== index)],
    };

    setKeyMappings(updatedMappings);
    setPositions(updatedPositions);

    Promise.all([
      window.api.keys.update(updatedMappings),
      window.api.keys.updatePositions(updatedPositions),
    ]).catch((error) => {
      console.error("Failed to move key to back", error);
    });
  };

  const handleResetCurrentMode = async () => {
    try {
      await window.api.keys.resetMode(selectedKeyType);
      setSelectedKey(null);
    } catch (error) {
      console.error("Failed to reset current mode", error);
    }
  };

  const handleUndo = useCallback(() => {
    setUndoRedoInProgress(true);
    try {
      // 현재 상태를 가져와서 undo 호출 시 전달
      const currentPluginElements =
        usePluginDisplayElementStore.getState().elements;
      const previousState = undo(keyMappings, positions, currentPluginElements);

      if (previousState) {
        setKeyMappings(previousState.keyMappings);
        setPositions(previousState.positions);

        // 플러그인 요소 복원 (pluginElements가 존재하는 경우에만)
        // undefined인 경우는 해당 히스토리 항목이 플러그인 요소 변경과 무관하므로 현재 상태 유지
        if (previousState.pluginElements !== undefined) {
          // 현재 요소들의 핸들러 정보를 유지하면서 위치/설정만 복원
          const currentElements = currentPluginElements;

          // 요소 복원 함수 맵 가져오기
          const elementRestorers = (window as any).__dmn_element_restorers as
            | Map<string, (el: any) => any>
            | undefined;

          const restoredElements = previousState.pluginElements.map(
            (savedEl) => {
              // 같은 fullId를 가진 현재 요소 찾기
              const currentEl = currentElements.find(
                (el) => el.fullId === savedEl.fullId
              );
              if (currentEl) {
                // 현재 요소의 핸들러 정보 유지, 저장된 위치/설정으로 복원
                return {
                  ...currentEl,
                  position: savedEl.position,
                  settings: savedEl.settings,
                  state: savedEl.state,
                  measuredSize: savedEl.measuredSize,
                  resizeAnchor: savedEl.resizeAnchor,
                  zIndex: savedEl.zIndex,
                };
              }

              // 현재 없는 요소 (삭제된 요소 복구)
              // definitionId가 있으면 해당 정의의 복원 함수 사용
              if (
                savedEl.definitionId &&
                elementRestorers?.has(savedEl.definitionId)
              ) {
                const restorer = elementRestorers.get(savedEl.definitionId)!;
                return restorer(savedEl);
              }

              // 복원 함수가 없으면 그대로 반환 (핸들러 없이)
              return savedEl;
            }
          );

          // 현재 있지만 저장된 상태에 없는 요소 제거 (추가된 요소 취소)
          const savedFullIds = new Set(
            previousState.pluginElements.map((el) => el.fullId)
          );
          const finalElements = restoredElements.filter(
            (el) =>
              savedFullIds.has(el.fullId) ||
              currentElements.some((cur) => cur.fullId === el.fullId)
          );

          setPluginElements(finalElements as any);

          // 오버레이로 동기화
          if (window.api?.bridge) {
            window.api.bridge.sendTo("overlay", "plugin:displayElements:sync", {
              elements: finalElements,
            });
          }
        }

        // 백엔드에도 반영
        Promise.all([
          window.api.keys.update(previousState.keyMappings),
          window.api.keys.updatePositions(previousState.positions),
        ]).catch((error) => {
          console.error("Failed to apply undo", error);
        });
      }
    } finally {
      setUndoRedoInProgress(false);
    }
  }, [
    undo,
    keyMappings,
    positions,
    setKeyMappings,
    setPositions,
    setPluginElements,
  ]);

  const handleRedo = useCallback(() => {
    setUndoRedoInProgress(true);
    try {
      // 현재 상태를 가져와서 redo 호출 시 전달
      const currentPluginElements =
        usePluginDisplayElementStore.getState().elements;
      const nextState = redo(keyMappings, positions, currentPluginElements);

      if (nextState) {
        setKeyMappings(nextState.keyMappings);
        setPositions(nextState.positions);

        // 플러그인 요소 복원 (pluginElements가 존재하는 경우에만)
        // undefined인 경우는 해당 히스토리 항목이 플러그인 요소 변경과 무관하므로 현재 상태 유지
        if (nextState.pluginElements !== undefined) {
          // 현재 요소들의 핸들러 정보를 유지하면서 위치/설정만 복원
          const currentElements = currentPluginElements;

          // 요소 복원 함수 맵 가져오기
          const elementRestorers = (window as any).__dmn_element_restorers as
            | Map<string, (el: any) => any>
            | undefined;

          const restoredElements = nextState.pluginElements.map((savedEl) => {
            // 같은 fullId를 가진 현재 요소 찾기
            const currentEl = currentElements.find(
              (el) => el.fullId === savedEl.fullId
            );
            if (currentEl) {
              // 현재 요소의 핸들러 정보 유지, 저장된 위치/설정으로 복원
              return {
                ...currentEl,
                position: savedEl.position,
                settings: savedEl.settings,
                state: savedEl.state,
                measuredSize: savedEl.measuredSize,
                resizeAnchor: savedEl.resizeAnchor,
                zIndex: savedEl.zIndex,
              };
            }

            // 현재 없는 요소 (삭제된 요소 복구 - redo에서는 드물지만 처리)
            // definitionId가 있으면 해당 정의의 복원 함수 사용
            if (
              savedEl.definitionId &&
              elementRestorers?.has(savedEl.definitionId)
            ) {
              const restorer = elementRestorers.get(savedEl.definitionId)!;
              return restorer(savedEl);
            }

            // 복원 함수가 없으면 그대로 반환
            return savedEl;
          });

          // 저장된 상태에 있는 요소만 유지
          const savedFullIds = new Set(
            nextState.pluginElements.map((el) => el.fullId)
          );
          const finalElements = restoredElements.filter((el) =>
            savedFullIds.has(el.fullId)
          );

          setPluginElements(finalElements as any);

          // 오버레이로 동기화
          if (window.api?.bridge) {
            window.api.bridge.sendTo("overlay", "plugin:displayElements:sync", {
              elements: finalElements,
            });
          }
        }

        // 백엔드에도 반영
        Promise.all([
          window.api.keys.update(nextState.keyMappings),
          window.api.keys.updatePositions(nextState.positions),
        ]).catch((error) => {
          console.error("Failed to apply redo", error);
        });
      }
    } finally {
      setUndoRedoInProgress(false);
    }
  }, [
    redo,
    keyMappings,
    positions,
    setKeyMappings,
    setPositions,
    setPluginElements,
  ]);

  return {
    selectedKey,
    setSelectedKey,
    keyMappings,
    positions,
    handlePositionChange,
    handleKeyUpdate,
    handleNoteColorUpdate,
    handleCounterSettingsUpdate,
    handleCounterSettingsPreview,
    handleAddKey,
    handleAddKeyAt,
    handleDuplicateKey,
    handleDeleteKey,
    handleMoveToFront,
    handleMoveToBack,
    handleResetCurrentMode,
    handleUndo,
    handleRedo,
    canUndo: canUndo(),
    canRedo: canRedo(),
  };
}
