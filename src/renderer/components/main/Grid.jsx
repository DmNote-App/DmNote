import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "@contexts/I18nContext";
import DraggableKey from "@components/Key";
import { getKeyInfoByGlobalKey } from "@utils/KeyMaps";
import KeySettingModal from "./Modal/content/KeySetting";
import CounterSettingModal from "./Modal/content/CounterSetting";
import ListPopup from "./Modal/ListPopup";
import { useKeyStore } from "@stores/useKeyStore";

export default function Grid({
  showConfirm,
  selectedKey,
  setSelectedKey,
  keyMappings,
  positions,
  onPositionChange,
  onKeyUpdate,
  onCounterUpdate,
  onCounterPreview,
  onKeyDelete,
  onAddKeyAt,
  color,
  activeTool,
  shouldSkipModalAnimation,
  onModalAnimationConsumed,
}) {
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  const { t } = useTranslation();

  // 키 컨텍스트 메뉴
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [contextIndex, setContextIndex] = useState(null);
  const contextRef = useRef(null);
  const [contextPosition, setContextPosition] = useState(null);
  const keyRefs = useRef([]);

  const [counterTargetIndex, setCounterTargetIndex] = useState(null);
  const [counterOriginalSettings, setCounterOriginalSettings] = useState(null);
  const [counterApplied, setCounterApplied] = useState(false);

  // 그리드 컨텍스트 메뉴 
  const [isGridContextOpen, setIsGridContextOpen] = useState(false);
  const [gridContextClientPos, setGridContextClientPos] = useState(null);
  const [gridAddLocalPos, setGridAddLocalPos] = useState(null);

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
        onClick={() => {
          if (isContextOpen) {
            setIsContextOpen(false);
            setContextPosition(null);
          }
          setSelectedKey({ key: keyMappings[selectedKeyType][index], index });
        }}
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
        onContextMenu={(e) => {
          setContextIndex(index);
          contextRef.current = keyRefs.current[index] || null;
          setContextPosition({ x: e.clientX, y: e.clientY });
          setIsContextOpen(true);
        }}
        setReferenceRef={(node) => {
          keyRefs.current[index] = node;
        }}
      />
    ));
  };

  return (
    <div
      className="grid-bg relative w-full h-full bg-[#3A3943] rounded-[0px]"
      style={{ backgroundColor: color === "transparent" ? "#3A3943" : color }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        setGridAddLocalPos({ dx: Math.round(localX), dy: Math.round(localY) });
        setGridContextClientPos({ x: e.clientX, y: e.clientY });
        setIsGridContextOpen(true);
      }}
    >
      {renderKeys()}
      {/* 우클릭 리스트 팝업 */}
      <div className="relative">
        <ListPopup
          open={isContextOpen}
          referenceRef={contextRef}
          position={contextPosition || undefined}
          onClose={() => {
            setIsContextOpen(false);
            setContextPosition(null);
          }}
          items={[
            { id: "delete", label: t("contextMenu.deleteKey") },
            { id: "counter", label: t("contextMenu.counterSetting") },
          ]}
          onSelect={(id) => {
            if (contextIndex == null) return;
            if (id === "delete") {
              const globalKey =
                keyMappings[selectedKeyType]?.[contextIndex] || "";
              const displayName =
                getKeyInfoByGlobalKey(globalKey)?.displayName || globalKey;
              showConfirm(
                t("confirm.removeKey", { name: displayName }),
                () => onKeyDelete(contextIndex),
                t("confirm.remove")
              );
            } else if (id === "counter") {
              // 스냅샷 저장 (모달 초기 상태 & 취소 시 복원용)
              const original =
                positions[selectedKeyType]?.[contextIndex]?.counter;
              setCounterOriginalSettings(original || null);
              setCounterApplied(false);
              setCounterTargetIndex(contextIndex);
            }
            setIsContextOpen(false);
            setContextPosition(null);
          }}
        />
      </div>
      {/* 그리드 컨텍스트 메뉴 */}
      <div className="relative">
        <ListPopup
          open={isGridContextOpen}
          position={gridContextClientPos || undefined}
          onClose={() => {
            setIsGridContextOpen(false);
            setGridContextClientPos(null);
            setGridAddLocalPos(null);
          }}
          items={[{ id: "add", label: t("tooltip.addKey") }]}
          onSelect={(id) => {
            if (id === "add" && gridAddLocalPos && typeof onAddKeyAt === "function") {
              onAddKeyAt(gridAddLocalPos.dx, gridAddLocalPos.dy);
            }
            setIsGridContextOpen(false);
            setGridContextClientPos(null);
            setGridAddLocalPos(null);
          }}
        />
      </div>
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
      {/* 카운터 세팅 모달 */}
      {counterTargetIndex != null && (
        <CounterSettingModal
          onClose={() => {
            // 적용하지 않고 닫히는 경우, 원본으로 되돌리기 (미리보기 롤백)
            if (!counterApplied && typeof onCounterPreview === "function") {
              const original =
                counterOriginalSettings ??
                positions[selectedKeyType]?.[counterTargetIndex]?.counter;
              if (original) {
                onCounterPreview(counterTargetIndex, original);
              }
            }
            setCounterTargetIndex(null);
          }}
          onSave={(settings) => {
            if (typeof onCounterUpdate === "function") {
              onCounterUpdate(counterTargetIndex, settings);
            }
            // 저장되었음을 표시 (닫힐 때 롤백 방지)
            setCounterApplied(true);
            setCounterTargetIndex(null);
          }}
          onPreview={(settings) => {
            if (typeof onCounterPreview === "function") {
              onCounterPreview(counterTargetIndex, settings);
            }
          }}
          keyName={(() => {
            const keyCode =
              keyMappings[selectedKeyType]?.[counterTargetIndex] || "";
            return getKeyInfoByGlobalKey(keyCode)?.displayName || keyCode || "";
          })()}
          // 모달은 항상 최초 스냅샷으로 시작 (미리보기로 바뀐 값에 영향을 받지 않도록)
          initialSettings={counterOriginalSettings}
        />
      )}
    </div>
  );
}
