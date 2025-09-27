import React, { useCallback, useEffect, useState } from "react";
import { Saturation, Hue, useColor } from "react-color-palette";
import "react-color-palette/css";
import FloatingPopup from "../FloatingPopup";

export default function ColorPickerWrapper({
  open,
  referenceRef,
  color,
  onColorChange,
  onClose,
}) {
  const [selectedColor, setSelectedColor] = useColor(color ?? "#561ecb");

  useEffect(() => {
    if (!color) return;
    const normalized = color.startsWith("#") ? color : `#${color}`;
    if (normalized.toLowerCase() !== selectedColor.hex.toLowerCase()) {
      setSelectedColor(normalized);
    }
  }, [color, selectedColor.hex, setSelectedColor]);

  const [inputValue, setInputValue] = useState(() =>
    selectedColor.hex.slice(1).toUpperCase()
  );

  useEffect(() => {
    setInputValue(selectedColor.hex.slice(1).toUpperCase());
  }, [selectedColor.hex]);

  const applyColor = useCallback(
    (next) => {
      const parsed = toColorObject(next);
      if (!parsed) return;
      setSelectedColor(parsed);
      onColorChange?.(parsed.hex);
    },
    [onColorChange, setSelectedColor]
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

  const handleInputCommit = () => {
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
  };

  return (
    <FloatingPopup
      open={open}
      referenceRef={referenceRef}
      placement="right"
      offset={32}
      className="z-50"
      onClose={onClose}
      autoClose={false}
    >
      <div className="flex flex-col p-[8px] gap-[8px] w-[145px] bg-[#1A191E] rounded-[13px]">
        <Saturation height={92} color={selectedColor} onChange={handleChange} />
        <Hue color={selectedColor} onChange={handleChange} />
        <Input
          value={inputValue}
          onValueChange={handleInputChange}
          onValueCommit={handleInputCommit}
          previewColor={selectedColor.hex}
        />
      </div>
    </FloatingPopup>
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
        style={{ backgroundColor: previewColor }}
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

const HEX_LENGTHS = [3, 4, 6, 8];

const parseHexColor = (value) => {
  const normalized = value.startsWith("#") ? value : `#${value}`;
  const hexBody = normalized.slice(1);

  if (!HEX_LENGTHS.includes(hexBody.length)) {
    return null;
  }

  const cleaned = hexBody.replace(/[^0-9A-Fa-f]/g, "");
  if (cleaned.length !== hexBody.length) {
    return null;
  }

  if (!(window.CSS?.supports?.("color", `#${cleaned}`) ?? true)) {
    return null;
  }

  const fullHex =
    cleaned.length === 3 || cleaned.length === 4
      ? cleaned
          .split("")
          .map((char) => char + char)
          .join("")
      : cleaned;

  const hasAlpha = fullHex.length === 8;

  const hex = `#${hasAlpha ? fullHex.slice(0, 6) : fullHex}`.toUpperCase();
  const alpha = hasAlpha ? fullHex.slice(6) : null;

  const r = parseInt(fullHex.slice(0, 2), 16);
  const g = parseInt(fullHex.slice(2, 4), 16);
  const b = parseInt(fullHex.slice(4, 6), 16);
  const a = alpha ? parseInt(alpha, 16) / 255 : 1;

  return {
    hex,
    rgb: { r, g, b, a },
    hsv: rgbToHsv(r, g, b, a),
  };
};

const rgbToHsv = (r, g, b, a = 1) => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;

  if (delta !== 0) {
    if (max === rn) {
      h = (gn - bn) / delta;
    } else if (max === gn) {
      h = 2 + (bn - rn) / delta;
    } else {
      h = 4 + (rn - gn) / delta;
    }

    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  const s = max === 0 ? 0 : (delta / max) * 100;
  const v = max * 100;

  return {
    h,
    s,
    v,
    a,
  };
};

const toColorObject = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return parseHexColor(value);
  }

  if (typeof value === "object" && value.hex) {
    const parsed = parseHexColor(value.hex);
    if (!parsed) {
      return null;
    }
    return {
      hex: parsed.hex,
      rgb: value.rgb ?? parsed.rgb,
      hsv: value.hsv ?? parsed.hsv,
    };
  }

  return null;
};
