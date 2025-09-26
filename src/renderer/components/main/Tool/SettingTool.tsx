import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import FolderIcon from "@assets/svgs/folder.svg";
import SettingIcon from "@assets/svgs/setting.svg";
import CloseEyeIcon from "@assets/svgs/close_eye.svg";
import OpenEyeIcon from "@assets/svgs/open_eye.svg";
import ChevronDownIcon from "@assets/svgs/chevron-down.svg";
import TurnIcon from "@assets/svgs/turn_arrow.svg";
import FloatingTooltip from "../modal/FloatingTooltip";
import ListPopup, { ListItem } from "../modal/ListPopup";
import { TooltipGroup } from "../modal/TooltipGroup";
import { useSettingsStore } from "@stores/useSettingsStore";

type SettingToolProps = {
  isSettingsOpen?: boolean;
  onOpenSettings?: () => void;
  onCloseSettings?: () => void;
  showAlert?: (message: string) => void;
  onOpenNoteSetting?: () => void;
  onOpenLaboratory?: () => void;
};

const SettingTool = ({
  isSettingsOpen = false,
  onOpenSettings,
  onCloseSettings,
  showAlert,
  onOpenNoteSetting,
  onOpenLaboratory,
}: SettingToolProps) => {
  const { t } = useTranslation();
  const [isOverlayVisible, setIsOverlayVisible] = useState(true);
  const [isExportImportOpen, setIsExportImportOpen] = useState(false);
  const [isExtrasOpen, setIsExtrasOpen] = useState(false);
  const exportImportRef = useRef<HTMLButtonElement | null>(null);
  const extrasRef = useRef<HTMLButtonElement | null>(null);
  const { noteEffect, laboratoryEnabled } = useSettingsStore();

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    window.api.overlay
      .get()
      .then((state) => {
        setIsOverlayVisible(state.visible);
      })
      .catch((error) => {
        console.error("Failed to fetch overlay visibility", error);
      });

    unsubscribe = window.api.overlay.onVisibility(({ visible }) => {
      setIsOverlayVisible(visible);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const menuItems: ListItem[] = [];
  if (laboratoryEnabled) {
    menuItems.push({ id: "lab", label: t("tooltip.laboratory") });
  }
  if (noteEffect) {
    menuItems.push({ id: "note", label: t("tooltip.noteSettings") });
  }

  const toggleOverlay = () => {
    const next = !isOverlayVisible;
    setIsOverlayVisible(next);
    window.api.overlay.setVisible(next).catch((error) => {
      console.error("Failed to toggle overlay", error);
    });
  };

  const handlePresetSave = async () => {
    try {
      const result = await window.api.presets.save();
      showAlert?.(result?.success ? t("preset.saveSuccess") : t("preset.saveFail"));
    } catch (error) {
      console.error("Failed to save preset", error);
      showAlert?.(t("preset.saveFail"));
    }
  };

  const handlePresetLoad = async () => {
    try {
      const result = await window.api.presets.load();
      showAlert?.(result?.success ? t("preset.loadSuccess") : t("preset.loadFail"));
    } catch (error) {
      console.error("Failed to load preset", error);
      showAlert?.(t("preset.loadFail"));
    }
  };

  return (
    <div className="flex gap-[10px]">
      {!isSettingsOpen && (
        <TooltipGroup>
          <div className="flex items-center h-[40px] p-[5px] bg-button-primary rounded-[7px] gap-[0px]">
            <FloatingTooltip content={t("tooltip.exportPreset")}>
              <Button icon={<FolderIcon />} onClick={handlePresetSave} />
            </FloatingTooltip>

            <FloatingTooltip
              content={t("tooltip.importExport")}
              disabled={isExportImportOpen}
            >
              <ChevronButton
                ref={exportImportRef}
                isSelected={isExportImportOpen}
                onClick={() => setIsExportImportOpen((prev) => !prev)}
              />
            </FloatingTooltip>
            <div className="relative">
              <ListPopup
                open={isExportImportOpen}
                referenceRef={exportImportRef}
                onClose={() => setIsExportImportOpen(false)}
                items={[
                  { id: "import", label: t("preset.import") },
                  { id: "export", label: t("preset.export") },
                ]}
                onSelect={async (id) => {
                  if (id === "import") {
                    await handlePresetLoad();
                  } else if (id === "export") {
                    await handlePresetSave();
                  }
                  setIsExportImportOpen(false);
                }}
              />
            </div>
          </div>
        </TooltipGroup>
      )}
      <TooltipGroup>
        <div className="flex items-center h-[40px] p-[5px] bg-button-primary rounded-[7px] gap-[5px]">
          <FloatingTooltip
            content={
              isOverlayVisible ? t("tooltip.overlayClose") : t("tooltip.overlayOpen")
            }
          >
            <Button
              icon={isOverlayVisible ? <CloseEyeIcon /> : <OpenEyeIcon />}
              onClick={toggleOverlay}
            />
          </FloatingTooltip>
          <div className="flex items-center">
            <FloatingTooltip
              content={isSettingsOpen ? t("tooltip.back") : t("tooltip.settings")}
            >
              <Button
                icon={isSettingsOpen ? <TurnIcon /> : <SettingIcon />}
                onClick={isSettingsOpen ? onCloseSettings : onOpenSettings}
              />
            </FloatingTooltip>
            {noteEffect && menuItems.length > 0 && (
              <>
                <FloatingTooltip
                  content={t("tooltip.etcSettings")}
                  disabled={isExtrasOpen}
                >
                  <ChevronButton
                    ref={extrasRef}
                    isSelected={isExtrasOpen}
                    onClick={() => setIsExtrasOpen((prev) => !prev)}
                  />
                </FloatingTooltip>
                <div className="relative">
                  <ListPopup
                    open={isExtrasOpen}
                    referenceRef={extrasRef}
                    onClose={() => setIsExtrasOpen(false)}
                    items={menuItems}
                    onSelect={(id) => {
                      if (id === "lab") {
                        onOpenLaboratory?.();
                      } else if (id === "note") {
                        onOpenNoteSetting?.();
                      }
                    }}
                    offsetX={-10}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </TooltipGroup>
    </div>
  );
};

interface ButtonProps {
  icon: React.ReactNode;
  isSelected?: boolean;
  onClick?: () => void;
}

const Button = ({ icon, isSelected = false, onClick }: ButtonProps) => {
  return (
    <button
      type="button"
      className={`flex items-center justify-center h-[30px] w-[30px] rounded-[7px] transition-colors active:bg-button-active ${
        isSelected
          ? "bg-button-active"
          : "bg-button-primary hover:bg-button-hover"
      }`}
      onClick={onClick}
    >
      {icon}
    </button>
  );
};

interface ChevronButtonProps {
  isSelected?: boolean;
  onClick?: () => void;
}

const ChevronButton = React.forwardRef<HTMLButtonElement, ChevronButtonProps>(
  ({ isSelected = false, onClick }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={`flex items-center justify-center h-[30px] w-[14px] rounded-[7px] transition-colors active:bg-button-active ${
          isSelected
            ? "bg-button-active hover:bg-button-active"
            : "bg-button-primary hover:bg-button-hover"
        }`}
        onClick={onClick}
      >
        <ChevronDownIcon />
      </button>
    );
  }
);

export default SettingTool;







