import { useState, useCallback } from "react";
import { useKeyStore } from "@stores/useKeyStore";
import { useHistoryStore } from "@stores/useHistoryStore";
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

  // 히스토리에 현재 상태 저장
  const saveToHistory = useCallback(() => {
    pushState(keyMappings, positions);
  }, [keyMappings, positions, pushState]);

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

  const handleResetCurrentMode = async () => {
    try {
      await window.api.keys.resetMode(selectedKeyType);
      setSelectedKey(null);
    } catch (error) {
      console.error("Failed to reset current mode", error);
    }
  };

  const handleUndo = useCallback(() => {
    const previousState = undo();
    if (previousState) {
      setKeyMappings(previousState.keyMappings);
      setPositions(previousState.positions);

      // 백엔드에도 반영
      Promise.all([
        window.api.keys.update(previousState.keyMappings),
        window.api.keys.updatePositions(previousState.positions),
      ]).catch((error) => {
        console.error("Failed to apply undo", error);
      });
    }
  }, [undo, setKeyMappings, setPositions]);

  const handleRedo = useCallback(() => {
    const nextState = redo();
    if (nextState) {
      setKeyMappings(nextState.keyMappings);
      setPositions(nextState.positions);

      // 백엔드에도 반영
      Promise.all([
        window.api.keys.update(nextState.keyMappings),
        window.api.keys.updatePositions(nextState.positions),
      ]).catch((error) => {
        console.error("Failed to apply redo", error);
      });
    }
  }, [redo, setKeyMappings, setPositions]);

  return {
    selectedKey,
    setSelectedKey,
    keyMappings,
    positions,
    handlePositionChange,
    handleKeyUpdate,
    handleCounterSettingsUpdate,
    handleCounterSettingsPreview,
    handleAddKey,
    handleAddKeyAt,
    handleDuplicateKey,
    handleDeleteKey,
    handleResetCurrentMode,
    handleUndo,
    handleRedo,
    canUndo: canUndo(),
    canRedo: canRedo(),
  };
}
