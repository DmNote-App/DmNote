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
import ColorPicker from "@components/main/Modal/content/ColorPicker";
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
  const confirmCallbackRef = useRef<(() => void) | null>(null);
  const cancelCallbackRef = useRef<(() => void) | null>(null);
  const [alertState, setAlertState] = useState(() => ({
    isOpen: false,
    message: "",
    confirmText: t("common.confirm"),
    type: "alert" as "alert" | "confirm" | "custom",
  }));

  // Custom Dialog 상태 (HTML 콘텐츠)
  const customDialogCallbackRef = useRef<{
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({});
  const [customDialogState, setCustomDialogState] = useState<{
    isOpen: boolean;
    html: string;
    confirmText?: string;
    cancelText?: string;
    showCancel?: boolean;
  }>({
    isOpen: false,
    html: "",
    confirmText: undefined,
    cancelText: undefined,
    showCancel: false,
  });

  // Global Color Picker 상태
  const colorPickerCallbackRef = useRef<((color: string) => void) | null>(null);
  const colorPickerCompleteCallbackRef = useRef<
    ((color: string) => void) | null
  >(null);
  const colorPickerCloseCallbackRef = useRef<(() => void) | null>(null);
  const [colorPickerState, setColorPickerState] = useState<{
    isOpen: boolean;
    color: string;
    position?: { x: number; y: number };
    id?: string;
    referenceElement?: HTMLElement;
  }>({
    isOpen: false,
    color: "#FFFFFF",
    position: undefined,
    id: undefined,
    referenceElement: undefined,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.shiftKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = (active.tagName || "").toLowerCase();
        const editable = active.isContentEditable;
        if (tag === "input" || tag === "textarea" || editable) return;
      }
      // 모달이 열려있으면 탭 전환 차단
      const hasModal = document.querySelector(
        ".fixed.top-\\[31px\\].left-\\[1px\\]"
      );
      if (hasModal) return;

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

  const showAlert = (message: string, confirmText?: string) => {
    setAlertState({
      isOpen: true,
      message,
      type: "alert",
      confirmText: confirmText || t("common.confirm"),
    });
  };

  const showConfirm = (
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText = t("common.confirm")
  ) => {
    confirmCallbackRef.current =
      typeof onConfirm === "function" ? onConfirm : null;
    cancelCallbackRef.current =
      typeof onCancel === "function" ? onCancel : null;
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
    cancelCallbackRef.current = null;
  };

  const handleAlertConfirm = () => {
    if (confirmCallbackRef.current) {
      confirmCallbackRef.current();
    }
    closeAlert();
  };

  const handleAlertCancel = () => {
    if (cancelCallbackRef.current) {
      cancelCallbackRef.current();
    }
    closeAlert();
  };

  // Custom Dialog 핸들러
  const showCustomDialog = (
    html: string,
    options?: {
      onConfirm?: () => void;
      onCancel?: () => void;
      confirmText?: string;
      cancelText?: string;
      showCancel?: boolean;
    }
  ) => {
    customDialogCallbackRef.current = {
      onConfirm: options?.onConfirm,
      onCancel: options?.onCancel,
    };
    setCustomDialogState({
      isOpen: true,
      html,
      confirmText: options?.confirmText,
      cancelText: options?.cancelText,
      showCancel: options?.showCancel ?? false,
    });
  };

  const closeCustomDialog = () => {
    setCustomDialogState({
      isOpen: false,
      html: "",
      confirmText: undefined,
      cancelText: undefined,
      showCancel: false,
    });
    customDialogCallbackRef.current = {};
  };

  const handleCustomDialogConfirm = () => {
    if (customDialogCallbackRef.current.onConfirm) {
      customDialogCallbackRef.current.onConfirm();
    }
    closeCustomDialog();
  };

  const handleCustomDialogCancel = () => {
    if (customDialogCallbackRef.current.onCancel) {
      customDialogCallbackRef.current.onCancel();
    }
    closeCustomDialog();
  };

  // Global Color Picker 핸들러
  const showColorPicker = (options: {
    initialColor: string;
    onColorChange: (color: string) => void;
    position?: { x: number; y: number };
    id?: string;
    referenceElement?: HTMLElement;
    onClose?: () => void;
    onColorChangeComplete?: (color: string) => void;
  }) => {
    // Toggle logic - 이미 열려있으면 닫기만 하고 종료
    if (
      options.id &&
      colorPickerState.isOpen &&
      colorPickerState.id === options.id
    ) {
      closeColorPicker();
      return;
    }

    // 다른 컬러 픽커가 열려있으면 먼저 닫기
    if (colorPickerState.isOpen) {
      closeColorPicker();
      // 약간의 지연 후 새 컬러 픽커 열기 (상태 갱신을 위해)
      setTimeout(() => {
        openColorPickerWithOptions(options);
      }, 0);
      return;
    }

    openColorPickerWithOptions(options);
  };

  const openColorPickerWithOptions = (options: {
    initialColor: string;
    onColorChange: (color: string) => void;
    position?: { x: number; y: number };
    id?: string;
    referenceElement?: HTMLElement;
    onClose?: () => void;
    onColorChangeComplete?: (color: string) => void;
  }) => {
    colorPickerCallbackRef.current = options.onColorChange;
    colorPickerCompleteCallbackRef.current =
      options.onColorChangeComplete || null;
    colorPickerCloseCallbackRef.current = options.onClose || null;
    setColorPickerState({
      isOpen: true,
      color: options.initialColor,
      position: options.position,
      id: options.id,
      referenceElement: options.referenceElement,
    });
  };

  const closeColorPicker = () => {
    if (colorPickerCloseCallbackRef.current) {
      colorPickerCloseCallbackRef.current();
    }
    setColorPickerState((prev) => ({ ...prev, isOpen: false }));
    colorPickerCallbackRef.current = null;
    colorPickerCompleteCallbackRef.current = null;
    colorPickerCloseCallbackRef.current = null;
  };

  const handleGlobalColorChange = (newColor: string) => {
    setColorPickerState((prev) => ({ ...prev, color: newColor }));
    if (colorPickerCallbackRef.current) {
      colorPickerCallbackRef.current(newColor);
    }
  };

  const handleGlobalColorChangeComplete = (newColor: string) => {
    if (colorPickerCompleteCallbackRef.current) {
      colorPickerCompleteCallbackRef.current(newColor);
    }
  };

  const getColorPickerState = () => colorPickerState;

  // Dialog API를 전역으로 노출
  useEffect(() => {
    (window as any).__dmn_showAlert = showAlert;
    (window as any).__dmn_showConfirm = showConfirm;
    (window as any).__dmn_showCustomDialog = showCustomDialog;
    (window as any).__dmn_showColorPicker = showColorPicker;
    (window as any).__dmn_getColorPickerState = getColorPickerState;

    return () => {
      delete (window as any).__dmn_showAlert;
      delete (window as any).__dmn_showConfirm;
      delete (window as any).__dmn_showCustomDialog;
      delete (window as any).__dmn_showColorPicker;
      delete (window as any).__dmn_getColorPickerState;
    };
  }, [
    showAlert,
    showConfirm,
    showCustomDialog,
    showColorPicker,
    getColorPickerState,
  ]);

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
            onNoteColorUpdate={handleNoteColorUpdate}
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
            showAlert={showAlert}
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
            undefined,
            t("confirm.reset")
          )
        }
        onResetCounters={() =>
          showConfirm(
            t("confirm.resetCountersCurrentTab"),
            async () => {
              await window.api.keys.resetCountersMode(selectedKeyType);
            },
            undefined,
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
          keyDisplayDelayMs={noteSettings.keyDisplayDelayMs ?? 0}
          trackHeight={noteSettings.trackHeight}
          speed={noteSettings.speed}
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
        cancelText={undefined}
        showCancel={undefined}
        onConfirm={handleAlertConfirm}
        onCancel={handleAlertCancel}
      />
      <CustomAlert
        isOpen={customDialogState.isOpen}
        message={customDialogState.html}
        type="custom"
        confirmText={customDialogState.confirmText}
        cancelText={customDialogState.cancelText}
        showCancel={customDialogState.showCancel}
        onConfirm={handleCustomDialogConfirm}
        onCancel={handleCustomDialogCancel}
      />
      {colorPickerState.isOpen && (
        <ColorPicker
          open={colorPickerState.isOpen}
          color={colorPickerState.color}
          onColorChange={handleGlobalColorChange}
          onColorChangeComplete={handleGlobalColorChangeComplete}
          onClose={closeColorPicker}
          position={colorPickerState.position}
          referenceRef={
            colorPickerState.referenceElement
              ? { current: colorPickerState.referenceElement }
              : undefined
          }
          offsetY={colorPickerState.referenceElement ? 10 : -80}
          placement="right"
          solidOnly={true}
        />
      )}
    </div>
  );
}
