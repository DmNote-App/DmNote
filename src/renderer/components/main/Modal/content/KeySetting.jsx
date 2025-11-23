import React, { useEffect, useState, useRef } from "react";
import { useTranslation } from "@contexts/I18nContext";
import { getKeyInfoByGlobalKey } from "@utils/KeyMaps";
import { useSettingsStore } from "@stores/useSettingsStore";
import ColorPicker from "./ColorPicker";
import ImagePicker from "./ImagePicker";
import Modal from "../Modal";

const COLOR_MODES = {
  solid: "solid",
  gradient: "gradient",
};

const toGradient = (top, bottom) => ({ type: "gradient", top, bottom });
import { isGradientColor, normalizeColorInput } from "@utils/colorUtils";

export default function KeySetting({
  keyData,
  onClose,
  onSave,
  skipAnimation = false,
}) {
  const { t } = useTranslation();
  const {
    useCustomCSS,
    setUseCustomCSS,
    setCustomCSSContent,
    setCustomCSSPath,
    noteEffect,
  } = useSettingsStore();
  const [key, setKey] = useState(keyData.key);
  const [displayKey, setDisplayKey] = useState(
    getKeyInfoByGlobalKey(key).displayName
  );
  const [isListening, setIsListening] = useState(false);
  const [activeImage, setActiveImage] = useState(keyData.activeImage || "");
  const [inactiveImage, setInactiveImage] = useState(
    keyData.inactiveImage || ""
  );
  const [width, setWidth] = useState(keyData.width || 60);
  const [height, setHeight] = useState(keyData.height || 60);
  const [colorMode, setColorMode] = useState(
    isGradientColor(keyData.noteColor)
      ? COLOR_MODES.gradient
      : COLOR_MODES.solid
  );
  const [noteColor, setNoteColor] = useState(() =>
    normalizeColorInput(keyData.noteColor)
  );
  const [gradientBottom, setGradientBottom] = useState(() =>
    isGradientColor(keyData.noteColor)
      ? keyData.noteColor.bottom
      : normalizeColorInput(keyData.noteColor)
  );
  const [noteOpacity, setNoteOpacity] = useState(keyData.noteOpacity || 80);
  const [showPicker, setShowPicker] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [idleTransparent, setIdleTransparent] = useState(
    keyData.idleTransparent || false
  );
  const [activeTransparent, setActiveTransparent] = useState(
    keyData.activeTransparent || false
  );

  const [className, setClassName] = useState(keyData.className || "");

  const [isFocused, setIsFocused] = useState(false);
  const [displayNoteOpacity, setDisplayNoteOpacity] = useState(
    keyData.noteOpacity ? `${keyData.noteOpacity}%` : "80%"
  );

  const [widthFocused, setWidthFocused] = useState(false);
  const [heightFocused, setHeightFocused] = useState(false);
  const [colorFocused, setColorFocused] = useState(false);

  const activeInputRef = useRef(null);
  const inactiveInputRef = useRef(null);
  const colorButtonRef = useRef(null);
  const imageButtonRef = useRef(null);
  const initialSkipRef = useRef(skipAnimation);

  useEffect(() => {
    if (!isListening) return undefined;
    if (typeof window === "undefined" || !window.api?.keys?.onRawInput) {
      return undefined;
    }

    const unsubscribe = window.api.keys.onRawInput((payload) => {
      if (!payload || payload.state !== "DOWN") return;
      const targetLabel =
        payload.label ||
        (Array.isArray(payload.labels) ? payload.labels[0] : null);
      if (!targetLabel) return;

      const info = getKeyInfoByGlobalKey(targetLabel);
      setKey(info.globalKey);
      setDisplayKey(info.displayName);
      setIsListening(false);
    });

    return () => {
      try {
        unsubscribe?.();
      } catch (error) {
        console.error("Failed to unsubscribe raw input listener", error);
      }
    };
  }, [isListening]);

  useEffect(() => {
    if (!isFocused) {
      setDisplayNoteOpacity(`${noteOpacity}%`);
    }
  }, [noteOpacity, isFocused]);

  const handleSubmit = () => {
    const colorValue =
      colorMode === COLOR_MODES.gradient
        ? toGradient(noteColor, gradientBottom)
        : noteColor;
    onSave({
      key,
      activeImage,
      inactiveImage,
      width: parseInt(width, 10),
      height: parseInt(height, 10),
      noteColor: colorValue,
      noteOpacity,
      className,
      idleTransparent,
      activeTransparent,
    });
  };

  const handleImageSelect = (e, isActive) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (isActive) {
          setActiveImage(event.target.result);
        } else {
          setInactiveImage(event.target.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleColorButtonClick = () => {
    setShowPicker((prev) => !prev);
  };

  const handleColorChange = (newColor) => {
    if (isGradientColor(newColor)) {
      setColorMode(COLOR_MODES.gradient);
      setNoteColor(newColor.top);
      setGradientBottom(newColor.bottom);
    } else {
      setColorMode(COLOR_MODES.solid);
      setNoteColor(newColor);
      setGradientBottom(newColor);
    }
  };

  const handlePickerClose = () => {
    setShowPicker(false);
  };

  const handleImageButtonClick = () => {
    setShowImagePicker((prev) => !prev);
  };

  const handleImagePickerClose = () => {
    setShowImagePicker(false);
  };

  const renderColorPreview = () => {
    if (colorMode === COLOR_MODES.gradient) {
      return {
        background: `linear-gradient(to bottom, ${noteColor}, ${gradientBottom})`,
      };
    }
    return { backgroundColor: noteColor };
  };

  const colorLabel =
    colorMode === COLOR_MODES.gradient
      ? "Gradient"
      : noteColor.replace(/^#/, "");

  return (
    <Modal onClick={onClose} animate={!initialSkipRef.current}>
      <div
        className="flex items-center justify-center p-[20px] bg-[#1A191E] rounded-[13px] border-[1px] border-[#2A2A30] gap-[19px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 flex flex-col gap-[19px]">
          <div className="flex justify-between w-full items-center">
            <p className="text-white text-style-2">
              {t("keySetting.keyMapping")}
            </p>
            <button
              onClick={() => setIsListening(true)}
              className={`flex items-center justify-center h-[23px] min-w-[0px] px-[8.5px] bg-[#2A2A30] rounded-[7px] border-[1px] ${
                isListening ? "border-[#459BF8]" : "border-[#3A3943]"
              } text-[#DBDEE8] text-style-2`}
            >
              {isListening
                ? t("keySetting.pressAnyKey")
                : displayKey || t("keySetting.clickToSet")}
            </button>
          </div>
          <div className="flex justify-between w-full items-center">
            <p className="text-white text-style-2">{t("keySetting.keySize")}</p>
            <div className="flex items-center gap-[10.5px]">
              <div
                className={`relative w-[54px] h-[23px] bg-[#2A2A30] rounded-[7px] border-[1px] ${
                  widthFocused ? "border-[#459BF8]" : "border-[#3A3943]"
                }`}
              >
                <span className="absolute left-[5px] top-[50%] transform -translate-y-1/2 text-[#97999E] text-style-1 pointer-events-none">
                  X
                </span>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    if (newValue === "") {
                      setWidth("");
                    } else {
                      const numValue = parseInt(newValue, 10);
                      if (!Number.isNaN(numValue)) {
                        setWidth(Math.min(Math.max(numValue, 1), 999));
                      }
                    }
                  }}
                  onFocus={() => setWidthFocused(true)}
                  onBlur={(e) => {
                    setWidthFocused(false);
                    if (
                      e.target.value === "" ||
                      Number.isNaN(parseInt(e.target.value, 10))
                    ) {
                      setWidth(60);
                    }
                  }}
                  className="absolute left-[20px] top-[-1px] h-[23px] w-[26px] bg-transparent text-style-4 text-[#DBDEE8] text-left"
                />
              </div>
              <div
                className={`relative w-[54px] h-[23px] bg-[#2A2A30] rounded-[7px] border-[1px] ${
                  heightFocused ? "border-[#459BF8]" : "border-[#3A3943]"
                }`}
              >
                <span className="absolute left-[5px] top-[50%] transform -translate-y-1/2 text-[#97999E] text-style-1 pointer-events-none">
                  Y
                </span>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    if (newValue === "") {
                      setHeight("");
                    } else {
                      const numValue = parseInt(newValue, 10);
                      if (!Number.isNaN(numValue)) {
                        setHeight(Math.min(Math.max(numValue, 1), 999));
                      }
                    }
                  }}
                  onFocus={() => setHeightFocused(true)}
                  onBlur={(e) => {
                    setHeightFocused(false);
                    if (
                      e.target.value === "" ||
                      Number.isNaN(parseInt(e.target.value, 10))
                    ) {
                      setHeight(60);
                    }
                  }}
                  className="absolute left-[20px] top-[-1px] h-[23px] w-[26px] bg-transparent text-style-4 text-[#DBDEE8] text-left"
                />
              </div>
            </div>
          </div>
          {/* 노트 관련 UI: noteEffect가 true일 때만 렌더링 */}
          {noteEffect && (
            <>
              <div className="flex justify-between w-full items-center">
                <p className="text-white text-style-2">
                  {t("keySetting.noteColor")}
                </p>
                <button
                  ref={colorButtonRef}
                  type="button"
                  className={`relative w-[80px] h-[23px] bg-[#2A2A30] rounded-[7px] border-[1px] flex items-center justify-center ${
                    showPicker ? "border-[#459BF8]" : "border-[#3A3943]"
                  } text-[#DBDEE8] text-style-2`}
                  onClick={handleColorButtonClick}
                  onFocus={() => setColorFocused(true)}
                  onBlur={() => setColorFocused(false)}
                >
                  <div
                    className="absolute left-[6px] top-[4.5px] w-[11px] h-[11px] rounded-[2px] border border-[#3A3943]"
                    style={renderColorPreview()}
                  ></div>
                  <span className="ml-[16px] text-left">{colorLabel}</span>
                </button>
              </div>
              <div className="flex justify-between w-full items-center">
                <p className="text-white text-style-2">
                  {t("keySetting.noteOpacity")}
                </p>
                <input
                  type="text"
                  value={displayNoteOpacity}
                  onChange={(e) => {
                    const newValue = e.target.value.replace(/[^0-9]/g, "");
                    if (newValue === "") {
                      setDisplayNoteOpacity("");
                    } else {
                      const numValue = parseInt(newValue, 10);
                      if (!Number.isNaN(numValue)) {
                        setDisplayNoteOpacity(newValue);
                      }
                    }
                  }}
                  onFocus={() => {
                    setIsFocused(true);
                    setDisplayNoteOpacity(noteOpacity.toString());
                  }}
                  onBlur={(e) => {
                    setIsFocused(false);
                    const inputValue = e.target.value.replace(/[^0-9]/g, "");
                    if (
                      inputValue === "" ||
                      Number.isNaN(parseInt(inputValue, 10))
                    ) {
                      setNoteOpacity(80);
                      setDisplayNoteOpacity("80%");
                    } else {
                      const numValue = parseInt(inputValue, 10);
                      const clamped = Math.min(Math.max(numValue, 0), 100);
                      setNoteOpacity(clamped);
                      setDisplayNoteOpacity(`${clamped}%`);
                    }
                  }}
                  className="text-center w-[47px] h-[23px] bg-[#2A2A30] rounded-[7px] border-[1px] border-[#3A3943] focus:border-[#459BF8] text-style-4 text-[#DBDEE8]"
                />
              </div>
            </>
          )}
          {/* 커스텀 이미지 */}
          <div className="flex justify-between w-full items-center">
            <p className="text-white text-style-2">
              {t("keySetting.customImage")}
            </p>
            <button
              ref={imageButtonRef}
              type="button"
              className={`px-[7px] h-[23px] bg-[#2A2A30] rounded-[7px] border-[1px] flex items-center justify-center ${
                showImagePicker ? "border-[#459BF8]" : "border-[#3A3943]"
              } text-[#DBDEE8] text-style-4`}
              onClick={handleImageButtonClick}
            >
              {t("keySetting.configure")}
            </button>
          </div>
          {/* 클래스 이름 - 커스텀 CSS 활성화 시에만 표시 */}
          {useCustomCSS && (
            <div className="flex justify-between w-full items-center">
              <p className="text-white text-style-2">
                {t("keySetting.className")}
              </p>
              <input
                key="classNameUnified"
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="className"
                className="text-center w-[90px] h-[23px] p-[6px] bg-[#2A2A30] rounded-[7px] border-[1px] border-[#3A3943] focus:border-[#459BF8] text-style-4 text-[#DBDEE8]"
              />
            </div>
          )}
          {/* 저장/취소 버튼 */}
          <div className="flex gap-[10.5px]">
            <button
              onClick={handleSubmit}
              className="w-[150px] h-[30px] bg-[#2A2A30] hover:bg-[#303036] active:bg-[#393941] rounded-[7px] text-[#DCDEE7] text-style-3"
            >
              {t("keySetting.save")}
            </button>
            <button
              onClick={onClose}
              className="w-[75px] h-[30px] bg-[#3C1E1E] hover:bg-[#442222] active:bg-[#522929] rounded-[7px] text-[#E6DBDB] text-style-3"
            >
              {t("keySetting.cancel")}
            </button>
          </div>
        </div>
        {noteEffect && showPicker && (
          <ColorPicker
            open={showPicker}
            referenceRef={colorButtonRef}
            color={
              colorMode === COLOR_MODES.gradient
                ? toGradient(noteColor, gradientBottom)
                : noteColor
            }
            onColorChange={handleColorChange}
            onClose={handlePickerClose}
          />
        )}
        {showImagePicker && (
          <ImagePicker
            open={showImagePicker}
            referenceRef={imageButtonRef}
            idleImage={inactiveImage}
            activeImage={activeImage}
            idleTransparent={idleTransparent}
            activeTransparent={activeTransparent}
            onIdleImageChange={setInactiveImage}
            onActiveImageChange={setActiveImage}
            onIdleTransparentChange={setIdleTransparent}
            onActiveTransparentChange={setActiveTransparent}
            onIdleImageReset={() => setInactiveImage("")}
            onActiveImageReset={() => setActiveImage("")}
            onClose={handleImagePickerClose}
          />
        )}
      </div>
    </Modal>
  );
}
