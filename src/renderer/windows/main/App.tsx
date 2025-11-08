import React, { useRef, useState, useEffect } from "react";
import { useTranslation } from "@contexts/I18nContext";
import TitleBar from "@components/main/TitleBar";
import { useCustomCssInjection } from "@hooks/useCustomCssInjection";
import { useCustomJsInjection } from "@hooks/useCustomJsInjection";
import ToolBar from "@components/main/Tool/ToolBar";
import Grid from "@components/main/Grid";
import SettingTab from "@components/main/Settings";
import { useKeyManager } from "@hooks/useKeyManager";
import { usePalette } from "@hooks/usePalette";
import CustomAlert from "@components/main/Modal/content/Alert";
import NoteSettingModal from "@components/main/Modal/content/NoteSetting";
import LaboratoryModal from "@components/main/Modal/content/Laboratory";
import { useSettingsStore } from "@stores/useSettingsStore";
import FloatingPopup from "@components/main/Modal/FloatingPopup";
import Palette from "@components/main/Modal/content/Palette";
import { useKeyStore } from "@stores/useKeyStore";
import { useAppBootstrap } from "@hooks/useAppBootstrap";

export default function App() {
  const { selectedKeyType, setSelectedKeyType, isBootstrapped } = useKeyStore();
  useCustomCssInjection();
  useCustomJsInjection();
  useAppBootstrap();

  // 윈도우 타입
  useEffect(() => {
    try {
      (window as any).__dmn_window_type = "main";
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

  const primaryButtonRef = useRef(null);

  const {
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
    handleMoveToFront,
    handleMoveToBack,
    handleResetCurrentMode,
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
  } = useKeyManager();
  const { color, palette, setPalette, handleColorChange, handlePaletteClose } =
    usePalette();

  const [activeTool, setActiveTool] = useState("move");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNoteSettingOpen, setIsNoteSettingOpen] = useState(false);
  const [isLaboratoryOpen, setIsLaboratoryOpen] = useState(false);
  const [skipModalAnimationOnReturn, setSkipModalAnimationOnReturn] =
    useState(false);
  const {
    noteEffect,
    angleMode,
    setAngleMode,
    language: storeLanguage,
    setLanguage,
    laboratoryEnabled,
    setLaboratoryEnabled,
    noteSettings,
    setNoteSettings,
    developerModeEnabled,
  } = useSettingsStore();

  // 개발자 모드 비활성 시 DevTools 단축키 차단
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!developerModeEnabled) {
        const isCtrlShiftI =
          (e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          (e.key === "I" || e.key === "i");
        const isF12 = e.key === "F12";
        if (isCtrlShiftI || isF12) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [developerModeEnabled]);

  const { t } = useTranslation();
  const confirmCallbackRef = useRef(null);
  const [alertState, setAlertState] = useState(() => ({
    isOpen: false,
    message: "",
    confirmText: t("common.confirm"),
    type: "alert",
  }));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.shiftKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = (active.tagName || "").toLowerCase();
        const editable = active.isContentEditable;
        if (tag === "input" || tag === "textarea" || editable) return;
      }
      const defaults = ["4key", "5key", "6key", "8key"];
      if (!isBootstrapped || !defaults.includes(selectedKeyType)) return;
      e.preventDefault();
      e.stopPropagation();
      const idx = defaults.indexOf(selectedKeyType);
      const next = defaults[(idx + 1) % defaults.length];
      setSelectedKeyType(next);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [selectedKeyType, setSelectedKeyType, isBootstrapped]);

  const showAlert = (message: string) =>
    setAlertState({
      isOpen: true,
      message,
      type: "alert",
      confirmText: t("common.confirm"),
    });

  const showConfirm = (
    message: string,
    onConfirm: () => void,
    confirmText = t("common.confirm")
  ) => {
    confirmCallbackRef.current =
      typeof onConfirm === "function" ? onConfirm : null;
    setAlertState({ isOpen: true, message, confirmText, type: "confirm" });
  };

  const closeAlert = () => {
    setAlertState({
      isOpen: false,
      message: "",
      confirmText: t("common.confirm"),
      type: "alert",
    });
    confirmCallbackRef.current = null;
  };

  return (
    <div className="bg-[#111012] w-full h-full flex flex-col overflow-hidden rounded-[7px] border border-[rgba(255,255,255,0.1)]">
      <TitleBar />
      <div className="flex-1 bg-[#2A2A31] overflow-hidden">
        {isSettingsOpen ? (
          <div className="h-full overflow-y-auto">
            <SettingTab showAlert={showAlert} showConfirm={showConfirm} />
          </div>
        ) : (
          <Grid
            selectedKey={selectedKey}
            setSelectedKey={setSelectedKey}
            keyMappings={keyMappings}
            positions={positions}
            onPositionChange={handlePositionChange}
            onKeyUpdate={handleKeyUpdate}
            onCounterUpdate={handleCounterSettingsUpdate}
            onCounterPreview={handleCounterSettingsPreview}
            onKeyDelete={handleDeleteKey}
            onAddKeyAt={handleAddKeyAt}
            onKeyDuplicate={handleDuplicateKey}
            onMoveToFront={handleMoveToFront}
            onMoveToBack={handleMoveToBack}
            color={color}
            activeTool={activeTool}
            showConfirm={showConfirm}
            shouldSkipModalAnimation={skipModalAnimationOnReturn}
            onModalAnimationConsumed={() =>
              setSkipModalAnimationOnReturn(false)
            }
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        )}
      </div>
      <ToolBar
        onAddKey={handleAddKey}
        onTogglePalette={() => setPalette((p) => !p)}
        isPaletteOpen={palette}
        onResetCurrentMode={() =>
          showConfirm(
            t("confirm.resetCurrentTab"),
            async () => {
              await handleResetCurrentMode();
            },
            t("confirm.reset")
          )
        }
        onResetCounters={() =>
          showConfirm(
            t("confirm.resetCountersCurrentTab"),
            async () => {
              await window.api.keys.resetCountersMode(selectedKeyType);
            },
            t("confirm.reset")
          )
        }
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        isSettingsOpen={isSettingsOpen}
        onOpenSettings={() => {
          if (selectedKey) setSkipModalAnimationOnReturn(true);
          setIsSettingsOpen(true);
        }}
        onCloseSettings={() => setIsSettingsOpen(false)}
        showAlert={showAlert}
        onOpenNoteSetting={() => setIsNoteSettingOpen(true)}
        onOpenLaboratory={() => setIsLaboratoryOpen(true)}
        primaryButtonRef={primaryButtonRef}
      />
      {palette && (
        <FloatingPopup
          open={palette}
          referenceRef={primaryButtonRef}
          placement="top"
          offset={25}
          onClose={handlePaletteClose}
          className="z-50"
        >
          <Palette color={color} onColorChange={handleColorChange} />
        </FloatingPopup>
      )}
      {noteEffect && isNoteSettingOpen && noteSettings && (
        <NoteSettingModal
          settings={noteSettings}
          onClose={() => setIsNoteSettingOpen(false)}
          onSave={async (normalized) => {
            try {
              await window.api.settings.update({ noteSettings: normalized });
              setNoteSettings(normalized);
            } catch (error) {
              console.error("Failed to update note settings", error);
            }
          }}
        />
      )}
      {isLaboratoryOpen && noteSettings && (
        <LaboratoryModal
          delayEnabled={noteSettings.delayedNoteEnabled}
          thresholdMs={noteSettings.shortNoteThresholdMs}
          minLengthPx={noteSettings.shortNoteMinLengthPx}
          onSave={async (payload) => {
            try {
              const updated = {
                ...noteSettings,
                ...payload,
              };
              await window.api.settings.update({ noteSettings: updated });
              setNoteSettings(updated);
            } catch (error) {
              console.error("Failed to update laboratory settings", error);
            }
          }}
          onClose={() => setIsLaboratoryOpen(false)}
        />
      )}
      <CustomAlert
        isOpen={alertState.isOpen}
        message={alertState.message}
        type={alertState.type}
        confirmText={alertState.confirmText}
        onConfirm={() => {
          if (alertState.type === "confirm" && confirmCallbackRef.current) {
            const cb = confirmCallbackRef.current;
            confirmCallbackRef.current = null;
            try {
              cb();
            } catch (error) {
              console.error(error);
            }
          }
          closeAlert();
        }}
        onCancel={() => {
          confirmCallbackRef.current = null;
          closeAlert();
        }}
      />
    </div>
  );
}
