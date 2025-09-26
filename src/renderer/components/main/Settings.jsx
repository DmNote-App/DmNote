import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@stores/useSettingsStore";
import { useKeyStore } from "@stores/useKeyStore";
import Checkbox from "@components/main/common/Checkbox";
import Dropdown from "@components/main/common/Dropdown";
import FlaskIcon from "@assets/svgs/flask.svg";
import overlayLockVideo from "@assets/mp4/overlay-lock.mp4";
import alwaysOnTopVideo from "@assets/mp4/alwaysontop.mp4";
import noteEffectVideo from "@assets/mp4/noteeffect.mp4";
import customCSSVideo from "@assets/mp4/css.mp4";
import resizeVideo from "@assets/mp4/resize.mp4";

export default function Settings({ showAlert, showConfirm }) {
  const { t, i18n } = useTranslation();
  const {
    hardwareAcceleration,
    setHardwareAcceleration,
    alwaysOnTop,
    setAlwaysOnTop,
    overlayLocked,
    setOverlayLocked,
    angleMode,
    setAngleMode,
    noteEffect,
    setNoteEffect,
    laboratoryEnabled,
    setLaboratoryEnabled,
    useCustomCSS,
    setUseCustomCSS,
    customCSSContent,
    setCustomCSSContent,
    customCSSPath,
    setCustomCSSPath,
    language,
    setLanguage,
    overlayResizeAnchor,
    setOverlayResizeAnchor,
  } = useSettingsStore();

  const [hoveredKey, setHoveredKey] = useState(null);

  const VIDEO_SOURCES = {
    overlayLock: overlayLockVideo,
    alwaysOnTop: alwaysOnTopVideo,
    noteEffect: noteEffectVideo,
    customCSS: customCSSVideo,
    resizeAnchor: resizeVideo,
  };

  const RESIZE_ANCHOR_OPTIONS = [
    { value: "top-left", key: "topLeft" },
    { value: "bottom-left", key: "bottomLeft" },
    { value: "top-right", key: "topRight" },
    { value: "bottom-right", key: "bottomRight" },
    { value: "center", key: "center" },
  ];

  const ANGLE_OPTIONS = [
    { value: "d3d11", label: "Direct3D 11" },
    { value: "d3d9", label: "Direct3D 9" },
    { value: "gl", label: "OpenGL" },
  ];

  const LANGUAGE_OPTIONS = [
    { value: "ko", label: "한국어" },
    { value: "en", label: "English" },
  ];

  const handleHardwareAccelerationChange = () => {
    const next = !hardwareAcceleration;

    const apply = async () => {
      setHardwareAcceleration(next);
      try {
        await window.api.settings.update({ hardwareAcceleration: next });
        await window.api.app.restart();
      } catch (error) {
        console.error("Failed to toggle hardware acceleration", error);
      }
    };

    if (showConfirm) {
      showConfirm(t("settings.restartConfirm"), apply);
    } else {
      apply();
    }
  };

  const handleAlwaysOnTopChange = async () => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    try {
      await window.api.settings.update({ alwaysOnTop: next });
    } catch (error) {
      console.error("Failed to toggle always-on-top", error);
    }
  };

  const handleOverlayLockChange = async () => {
    const next = !overlayLocked;
    setOverlayLocked(next);
    try {
      await window.api.overlay.setLock(next);
    } catch (error) {
      console.error("Failed to toggle overlay lock", error);
    }
  };

  const handleToggleCustomCSS = async () => {
    const next = !useCustomCSS;
    setUseCustomCSS(next);
    try {
      await window.api.css.toggle(next);
    } catch (error) {
      console.error("Failed to toggle custom CSS", error);
    }
  };

  const handleLoadCustomCSS = async () => {
    if (!useCustomCSS) return;
    try {
      const result = await window.api.css.load();
      if (result?.success) {
        if (result.content) setCustomCSSContent(result.content);
        if (result.path) setCustomCSSPath(result.path);
        showAlert?.(t("settings.cssLoaded"));
      } else {
        const message = result?.error
          ? `${t("settings.cssLoadFailed")}${result.error}`
          : t("settings.cssLoadFailed");
        showAlert?.(message);
      }
    } catch (error) {
      console.error("Failed to load custom CSS", error);
      showAlert?.(`${t("settings.cssLoadFailed")}${error}`);
    }
  };

  const handleNoteEffectChange = async () => {
    const next = !noteEffect;
    setNoteEffect(next);
    try {
      await window.api.settings.update({ noteEffect: next });
    } catch (error) {
      console.error("Failed to toggle note effect", error);
    }
  };

  const handleAngleModeChangeSelect = (val) => {
    const apply = async () => {
      setAngleMode(val);
      try {
        await window.api.settings.update({ angleMode: val });
        await window.api.app.restart();
      } catch (error) {
        console.error("Failed to change angle mode", error);
      }
    };

    if (showConfirm) {
      showConfirm(t("settings.restartConfirm"), apply);
    } else {
      apply();
    }
  };

  const handleLaboratoryToggle = async () => {
    const next = !laboratoryEnabled;
    setLaboratoryEnabled(next);
    try {
      await window.api.settings.update({ laboratoryEnabled: next });
    } catch (error) {
      console.error("Failed to toggle laboratory mode", error);
    }
  };

  const handleResetAll = () => {
    const reset = async () => {
      try {
        const result = await window.api.keys.resetAll();
        if (result) {
          // 리셋 직후 메모리 상태도 바로 초기값으로 맞춘다
          useKeyStore.setState({
            keyMappings: result.keys,
            positions: result.positions,
            customTabs: result.customTabs,
            selectedKeyType: result.selectedKeyType,
          });
        }
      } catch (error) {
        console.error("Failed to reset presets", error);
      }
    };

    if (showConfirm) {
      showConfirm(t("settings.resetAllConfirm"), reset, t("settings.initialize"));
    } else {
      reset();
    }
  };

  const handleLanguageChange = (val) => {
    setLanguage(val);
    i18n.changeLanguage(val);
    window.api.settings.update({ language: val }).catch((error) => {
      console.error("Failed to change language", error);
    });
  };


  

  return (
    <div className="relative w-full h-full">
      <div className="settings-scroll w-full h-full flex flex-col py-[10px] px-[10px] gap-[19px] overflow-y-auto bg-[#0B0B0D]">
        {/* 설정 */}
        <div className="flex flex-row gap-[19px]">
          <div className="flex flex-col gap-[10px] w-[348px]">
            {/* 키뷰어 설정 */}
            <div className="flex flex-col p-[19px] py-[7px] bg-primary rounded-[7px] gap-[0px]">
              <div
                className="flex flex-row justify-between items-center h-[40px] cursor-pointer"
                onMouseEnter={() => setHoveredKey("overlayLock")}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={handleOverlayLockChange}
              >
                <p className="text-style-3 text-[#FFFFFF]">
                  {t("settings.overlayLock")}
                </p>
                <Checkbox
                  checked={overlayLocked}
                  onChange={handleOverlayLockChange}
                />
              </div>
              <div
                className="flex flex-row justify-between items-center h-[40px] cursor-pointer"
                onMouseEnter={() => setHoveredKey("alwaysOnTop")}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={handleAlwaysOnTopChange}
              >
                <p className="text-style-3 text-[#FFFFFF]">
                  {t("settings.alwaysOnTop")}
                </p>
                <Checkbox
                  checked={alwaysOnTop}
                  onChange={handleAlwaysOnTopChange}
                />
              </div>
              <div
                className="flex flex-row justify-between items-center h-[40px] cursor-pointer"
                onMouseEnter={() => setHoveredKey("noteEffect")}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={handleNoteEffectChange}
              >
                <p className="text-style-3 text-[#FFFFFF]">
                  {t("settings.noteEffect")}
                </p>
                <Checkbox
                  checked={noteEffect}
                  onChange={handleNoteEffectChange}
                />
              </div>
              <div
                className="flex flex-row justify-between items-center h-[40px] cursor-pointer"
                onMouseEnter={() => setHoveredKey("customCSS")}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={handleToggleCustomCSS}
              >
                <p className="text-style-3 text-[#FFFFFF]">
                  {t("settings.customCSS")}
                </p>
                <Checkbox
                  checked={useCustomCSS}
                  onChange={handleToggleCustomCSS}
                />
              </div>
              <div
                className="flex flex-row justify-between items-center h-[40px]"
                onMouseEnter={() => setHoveredKey("customCSS")}
                onMouseLeave={() => setHoveredKey(null)}
              >
                <p
                  className={
                    "text-[12px] truncate max-w-[150px] " +
                    (useCustomCSS ? "text-[#989BA6]" : "text-[#44464E]")
                  }
                >
                  {customCSSPath && customCSSPath.length > 0
                    ? customCSSPath
                    : t("settings.noCssFile")}
                </p>
                <button
                  onClick={handleLoadCustomCSS}
                  disabled={!useCustomCSS}
                  className={
                    "py-[4px] px-[8px] bg-[#2A2A31] border-[1px] border-[#3A3944] rounded-[7px] text-style-2 " +
                    (useCustomCSS
                      ? "text-[#DBDEE8]"
                      : "text-[#44464E] cursor-not-allowed bg-[#222228] border-[#31303C]")
                  }
                >
                  {t("settings.loadCss")}
                </button>
              </div>
              <div
                className="flex flex-row justify-between items-center h-[40px] cursor-pointer"
                onMouseEnter={() => setHoveredKey("laboratory")}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={handleLaboratoryToggle}
              >
                <p className="text-style-3 text-[#FFFFFF]">
                  {t("settings.laboratory")}
                </p>
                <Checkbox
                  checked={laboratoryEnabled}
                  onChange={handleLaboratoryToggle}
                />
              </div>
              <div
                className="flex flex-row justify-between items-center h-[40px]"
                onMouseEnter={() => setHoveredKey("resizeAnchor")}
                onMouseLeave={() => setHoveredKey(null)}
              >
                <p className="text-style-3 text-[#FFFFFF]">
                  {t("settings.resizeAnchor")}
                </p>
                <Dropdown
                  options={RESIZE_ANCHOR_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: t(`settings.${opt.key}`),
                  }))}
                  value={overlayResizeAnchor}
                  onChange={async (val) => {
                    setOverlayResizeAnchor(val);
                    try {
                      await window.api.overlay.setAnchor(val);
                    } catch (error) { console.error("Failed to set overlay anchor", error); }
                  }}
                  placeholder={t("settings.selectAnchor")}
                />
              </div>
            </div>
            {/* 기타 설정 */}
            <div className="flex flex-col p-[19px] bg-primary rounded-[7px] gap-[24px]">
              <div className="flex flex-row justify-between items-center">
                <p className="text-style-3 text-[#FFFFFF]">
                  {t("settings.language")}
                </p>
                <Dropdown
                  options={LANGUAGE_OPTIONS}
                  value={language}
                  onChange={handleLanguageChange}
                  placeholder={t("settings.selectLanguage")}
                />
              </div>
              <div className="flex flex-row justify-between items-center">
                <p className="text-style-3 text-[#FFFFFF]">
                  {t("settings.graphicsOption")}
                </p>
                <Dropdown
                  options={ANGLE_OPTIONS}
                  value={angleMode}
                  onChange={handleAngleModeChangeSelect}
                  placeholder={t("settings.renderMode")}
                />
              </div>
              {/* 버전 및 설정 초기화 */}
              <div className="flex justify-between items-center py-[14px] px-[12px] bg-[#101013] rounded-[7px]">
                <p className="text-style-3 text-[#FFFFFF]">Ver 1.2.0</p>
                <button
                  className="bg-[#401C1D] rounded-[7px] py-[4px] px-[9px] text-style-2 text-[#E8DBDB]"
                  onClick={handleResetAll}
                >
                  {t("settings.resetData")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute flex items-center justify-center top-[10px] right-[10px] w-[522px] h-[366px] bg-primary rounded-[7px] pointer-events-none overflow-hidden">
        {hoveredKey && VIDEO_SOURCES[hoveredKey] ? (
          <div className="relative w-full h-full">
            <video
              key={hoveredKey}
              src={VIDEO_SOURCES[hoveredKey]}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 flex justify-center items-end h-[100px] bg-gradient-to-t from-black to-transparent pointer-events-none">
              <span className="mb-[15px] text-white text-[15px] font-medium">
                {t(`settings.${hoveredKey}Desc`)}
              </span>
            </div>
          </div>
        ) : (
          <FlaskIcon />
        )}
      </div>
    </div>
  );
}




















