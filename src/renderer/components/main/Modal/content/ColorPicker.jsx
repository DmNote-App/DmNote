import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Saturation, Hue, useColor } from "react-color-palette";
import "react-color-palette/css";
import FloatingPopup from "../FloatingPopup";
import { useTranslation } from "react-i18next";
import {
  MODES,
  isGradientColor,
  normalizeColorInput,
  buildGradient,
  parseHexColor,
  toColorObject,
} from "@utils/colorUtils";

export default function ColorPickerWrapper({
  open,
  referenceRef,
  color,
  onColorChange,
  onClose,
}) {
  const initialMode = isGradientColor(color) ? MODES.gradient : MODES.solid;
  const [mode, setMode] = useState(initialMode);
  const baseColor = normalizeColorInput(color);
  const [selectedColor, setSelectedColor] = useColor(baseColor);
  const [gradientTop, setGradientTop] = useState(() =>
    isGradientColor(color)
      ? color.top.replace("#", "")
      : selectedColor.hex.replace("#", "")
  );
  const [gradientBottom, setGradientBottom] = useState(() =>
    isGradientColor(color) ? color.bottom.replace("#", "") : "FFFFFF"
  );
  const suppressGradientResetRef = useRef(false);
  // 한번이라도 그라디언트 모드에 진입(또는 그라디언트 값을 받은) 이후엔
  // 솔리드 색상(prop)이 들어와도 그라디언트 편집 상태를 다시 시드하지 않음
  const hasSeededGradientFromSolidRef = useRef(isGradientColor(color));

  const prevColorRef = useRef(color);
  // which gradient input is currently selected for Sat/Hue editing: 'top' | 'bottom'
  const [gradientSelected, setGradientSelected] = useState(() =>
    isGradientColor(color) ? "top" : "top"
  );

  useEffect(() => {
    const wasGradient = isGradientColor(prevColorRef.current);
    const isGradientNow = isGradientColor(color);

    setMode(isGradientNow ? MODES.gradient : MODES.solid);

    if (isGradientNow) {
      const topHex = color.top.replace("#", "").toUpperCase();
      const bottomHex = color.bottom.replace("#", "").toUpperCase();
      setGradientTop(topHex);
      setGradientBottom(bottomHex);
      hasSeededGradientFromSolidRef.current = true;

      const targetHex = gradientSelected === "bottom" ? bottomHex : topHex;
      const parsedTarget = parseHexColor(targetHex);
      if (parsedTarget) {
        setSelectedColor(parsedTarget);
      }

      if (!wasGradient) {
        setGradientSelected("top");
      } else if (gradientSelected !== "top" && gradientSelected !== "bottom") {
        setGradientSelected("top");
      }
    } else if (typeof color === "string") {
      const normalized = normalizeColorInput(color);
      const parsed = parseHexColor(normalized);
      if (parsed) {
        setSelectedColor(parsed);
        // 아직 그라디언트로 한 번도 진입한 적이 없고(시드 안함),
        // 외부에서 넘어온 솔리드 색이면서, 내부 초기화 억제가 아닐 때만
        // 단 한 번 시드를 수행
        if (
          !suppressGradientResetRef.current &&
          !hasSeededGradientFromSolidRef.current
        ) {
          setGradientTop(parsed.hex.replace("#", ""));
          setGradientBottom("FFFFFF");
        }
      }
      setGradientSelected("top");
      // 한 번만 억제 플래그를 사용
      suppressGradientResetRef.current = false;
    }

    prevColorRef.current = color;
  }, [color, gradientSelected]);

  const [inputValue, setInputValue] = useState(() =>
    selectedColor.hex.replace("#", "").toUpperCase()
  );

  useEffect(() => {
    setInputValue(selectedColor.hex.replace("#", "").toUpperCase());
  }, [selectedColor.hex]);

  useEffect(() => {
    if (mode === MODES.gradient) {
      const top = `#${gradientTop}`;
      const bottom = `#${gradientBottom}`;
      onColorChange?.(buildGradient(top, bottom));
    }
  }, [mode, gradientTop, gradientBottom]);

  const applyColor = useCallback(
    (next) => {
      const parsed = toColorObject(next);
      if (!parsed) return;
      setSelectedColor(parsed);
      if (mode === MODES.gradient) {
        // when editing via Saturation/Hue in gradient mode, update the selected stop
        const newHex = parsed.hex.replace("#", "").toUpperCase();

        if (gradientSelected === "top") {
          setGradientTop(newHex);
          onColorChange?.(buildGradient(parsed.hex, `#${gradientBottom}`));
        } else {
          setGradientBottom(newHex);
          onColorChange?.(buildGradient(`#${gradientTop}`, parsed.hex));
        }
        return;
      }
      onColorChange?.(parsed.hex);
    },
    [mode, onColorChange, gradientSelected, gradientTop, gradientBottom]
  );

  const handleChange = (nextColor) => {
    applyColor(nextColor);
  };

  const handleInputChange = (raw) => {
    const sanitized = raw
      .replace(/[^0-9a-fA-F]/g, "")
      .slice(0, 8)
      .toUpperCase();
    setInputValue(sanitized);
  };

  const commitSolidInput = useCallback(() => {
    if (!inputValue) {
      setInputValue(selectedColor.hex.slice(1));
      return;
    }

    const parsed = parseHexColor(inputValue);
    if (!parsed) {
      setInputValue(selectedColor.hex.slice(1));
      return;
    }

    applyColor(parsed);
  }, [inputValue, selectedColor.hex, applyColor]);

  const commitGradient = useCallback(() => {
    const parsedTop = parseHexColor(gradientTop);
    const parsedBottom = parseHexColor(gradientBottom);
    if (!parsedTop || !parsedBottom) {
      return;
    }
    setSelectedColor(parsedTop);
    onColorChange?.(buildGradient(parsedTop.hex, parsedBottom.hex));
  }, [gradientTop, gradientBottom, onColorChange]);

  const handleGradientInputChange = (setter) => (raw) => {
    const sanitized = raw
      .replace(/[^0-9a-fA-F]/g, "")
      .slice(0, 8)
      .toUpperCase();
    setter(sanitized);
  };

  const selectGradient = (side) => {
    setGradientSelected(side);
    const hex = `#${side === "top" ? gradientTop : gradientBottom}`;
    const parsed = parseHexColor(hex);
    if (parsed) setSelectedColor(parsed);
  };

  const handleModeSwitch = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    if (nextMode === MODES.solid) {
      // 그라디언트 -> 솔리드 전환 시, 부모로 전달되는 단색 변경에 따라
      // 내부 그라디언트 상태가 초기화되지 않도록 억제 플래그 설정
      suppressGradientResetRef.current = true;
      const parsed = parseHexColor(gradientTop || inputValue);
      if (parsed) {
        setSelectedColor(parsed);
        onColorChange?.(parsed.hex);
      }
    } else {
      // 그라디언트 모드에 진입함을 표시(이후부터는 시드 금지)
      hasSeededGradientFromSolidRef.current = true;
      setGradientSelected("top");
      commitGradient();
    }
  };

  return (
    <FloatingPopup
      open={open}
      referenceRef={referenceRef}
      placement="right-start"
      offset={32}
      offsetY={-80}
      className="z-50"
      onClose={onClose}
      autoClose={false}
    >
      <div className="flex flex-col p-[8px] gap-[8px] w-[146px] bg-[#1A191E] rounded-[13px] border-[1px] border-[#2A2A30]">
        <ModeSwitch mode={mode} onChange={handleModeSwitch} />

        <Saturation height={92} color={selectedColor} onChange={handleChange} />
        <Hue color={selectedColor} onChange={handleChange} />
        {mode === MODES.solid ? (
          <Input
            value={inputValue}
            onValueChange={handleInputChange}
            onValueCommit={commitSolidInput}
            previewColor={selectedColor.hex}
          />
        ) : (
          <GradientInputs
            topValue={gradientTop}
            bottomValue={gradientBottom}
            onTopChange={handleGradientInputChange(setGradientTop)}
            onBottomChange={handleGradientInputChange(setGradientBottom)}
            onTopCommit={() => {
              commitGradient();
              selectGradient("top");
            }}
            onBottomCommit={() => {
              commitGradient();
              selectGradient("bottom");
            }}
            selected={gradientSelected}
            onSelect={(s) => selectGradient(s)}
          />
        )}
      </div>
    </FloatingPopup>
  );
}

function ModeSwitch({ mode, onChange }) {
  const { t } = useTranslation();
  const solidLabel = t("colorPicker.solid");
  const gradientLabel = t("colorPicker.gradient");
  return (
    <div className="flex gap-[6px] max-w-full">
      {[
        { key: MODES.solid, label: solidLabel },
        { key: MODES.gradient, label: gradientLabel },
      ].map((item) => (
        <button
          key={item.key}
          type="button"
          className={`flex-1 whitespace-nowrap px-[9px] h-[23px] rounded-[7px] text-style-4 text-[#DBDEE8] transition-colors ${
            mode === item.key
              ? "bg-[#2E2D33] text-[#FFFFFF]"
              : "hover:bg-[#303036] text-[#6F6E7A]"
          }`}
          onClick={() => onChange?.(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

const Input = ({ value = "", onValueChange, onValueCommit, previewColor }) => {
  const handleChange = (e) => {
    onValueChange?.(e.target.value);
  };

  return (
    <div className="relative w-full">
      <div
        className="absolute left-[6px] top-[7px] w-[11px] h-[11px] rounded-[2px] border border-[#3A3943]"
        style={{ background: previewColor }}
      />
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={onValueCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onValueCommit?.();
          }
        }}
        className="pl-[23px] text-left w-full h-[23px] bg-[#2A2A30] rounded-[7px] border-[1px] border-[#3A3943] focus:border-[#459BF8] text-style-4 text-[#DBDEE8] uppercase pt-[1px] leading-[23px]"
      />
    </div>
  );
};

function GradientInputs({
  topValue,
  bottomValue,
  onTopChange,
  onBottomChange,
  onTopCommit,
  onBottomCommit,
  selected,
  onSelect,
}) {
  return (
    <div className="flex flex-col gap-[8px]">
      <GradientInput
        label="Top"
        value={topValue}
        onChange={onTopChange}
        onCommit={onTopCommit}
        selected={selected === "top"}
        onSelect={() => onSelect?.("top")}
      />
      <GradientInput
        label="Bottom"
        value={bottomValue}
        onChange={onBottomChange}
        onCommit={onBottomCommit}
        selected={selected === "bottom"}
        onSelect={() => onSelect?.("bottom")}
      />
    </div>
  );
}

function GradientInput({
  label,
  value,
  onChange,
  onCommit,
  selected,
  onSelect,
}) {
  return (
    <div className="relative w-full">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect?.()}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSelect?.();
        }}
        className="absolute left-[6px] top-[7px] w-[11px] h-[11px] rounded-[2px] border border-[#3A3943]"
        style={{
          background: `#${value}` || "#561ecb",
        }}
      />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        onFocus={() => onSelect?.()}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onCommit?.();
          }
        }}
        placeholder={label}
        className={`pl-[23px] text-left w-full h-[23px] bg-[#2A2A30] rounded-[7px] border-[1px] text-style-4 text-[#DBDEE8] uppercase pt-[1px] leading-[23px] ${
          selected
            ? "border-[#459BF8]"
            : "border-[#3A3943] focus:border-[#459BF8]"
        }`}
      />
    </div>
  );
}
