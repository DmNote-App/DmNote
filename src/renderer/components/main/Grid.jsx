import React, { useEffect } from "react";
import { useTranslation } from "@contexts/I18nContext";
import DraggableKey from "@components/Key";
import { getKeyInfoByGlobalKey } from "@utils/KeyMaps";
import KeySettingModal from "./modal/content/KeySetting";
import { useKeyStore } from "@stores/useKeyStore";

export default function Grid({
  showConfirm,
  selectedKey,
  setSelectedKey,
  keyMappings,
  positions,
  onPositionChange,
  onKeyUpdate,
  onKeyDelete,
  color,
  activeTool,
  shouldSkipModalAnimation,
  onModalAnimationConsumed,
}) {
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  const { t } = useTranslation();

  useEffect(() => {
    if (
      shouldSkipModalAnimation &&
      selectedKey &&
      typeof onModalAnimationConsumed === "function"
    ) {
      onModalAnimationConsumed();
    }
  }, [shouldSkipModalAnimation, selectedKey, onModalAnimationConsumed]);

  const renderKeys = () => {
    if (!positions[selectedKeyType]) return null;

    return positions[selectedKeyType].map((position, index) => (
      <DraggableKey
        key={index}
        index={index}
        position={position}
        keyName={keyMappings[selectedKeyType]?.[index] || ""}
        onPositionChange={onPositionChange}
        onClick={() =>
          setSelectedKey({ key: keyMappings[selectedKeyType][index], index })
        }
        activeTool={activeTool}
        onEraserClick={() => {
          const globalKey = keyMappings[selectedKeyType]?.[index] || "";
          const displayName =
            getKeyInfoByGlobalKey(globalKey)?.displayName || globalKey;
          showConfirm(
            t("confirm.removeKey", { name: displayName }),
            () => onKeyDelete(index),
            t("confirm.remove")
          );
        }}
      />
    ));
  };

  return (
    <div
      className="grid-bg relative w-full h-full bg-[#3A3943] rounded-[0px]"
      style={{ backgroundColor: color === "transparent" ? "#3A3943" : color }}
    >
      {renderKeys()}
      {selectedKey && (
        <KeySettingModal
          keyData={{
            key: selectedKey.key,
            activeImage:
              positions[selectedKeyType][selectedKey.index].activeImage,
            inactiveImage:
              positions[selectedKeyType][selectedKey.index].inactiveImage,
            width: positions[selectedKeyType][selectedKey.index].width,
            height: positions[selectedKeyType][selectedKey.index].height,
            noteColor:
              positions[selectedKeyType][selectedKey.index].noteColor ||
              "#FFFFFF",
            noteOpacity:
              positions[selectedKeyType][selectedKey.index].noteOpacity || 80,
            className:
              positions[selectedKeyType][selectedKey.index].className || "",
          }}
          onClose={() => setSelectedKey(null)}
          onSave={onKeyUpdate}
          skipAnimation={shouldSkipModalAnimation}
        />
      )}
    </div>
  );
}
