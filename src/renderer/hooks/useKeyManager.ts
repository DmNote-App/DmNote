import { useState } from "react";
import { useKeyStore } from "@stores/useKeyStore";
import type { KeyMappings, KeyPositions } from "@src/types/keys";

type SelectedKey = { key: string; index: number } | null;

type KeyUpdatePayload = {
  key: string;
  activeImage?: string;
  inactiveImage?: string;
  width: number;
  height: number;
  noteColor?: string;
  noteOpacity?: number;
  className?: string;
};

export function useKeyManager() {
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  const keyMappings = useKeyStore((state) => state.keyMappings);
  const positions = useKeyStore((state) => state.positions);
  const setKeyMappings = useKeyStore((state) => state.setKeyMappings);
  const setPositions = useKeyStore((state) => state.setPositions);

  const [selectedKey, setSelectedKey] = useState<SelectedKey>(null);

  const handlePositionChange = (index: number, dx: number, dy: number) => {
    const current = positions[selectedKeyType] || [];
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

  const handleDeleteKey = (indexToDelete: number) => {
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

  return {
    selectedKey,
    setSelectedKey,
    keyMappings,
    positions,
    handlePositionChange,
    handleKeyUpdate,
    handleAddKey,
    handleDeleteKey,
    handleResetCurrentMode,
  };
}
