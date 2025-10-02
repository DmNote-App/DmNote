const Store = require("electron-store");
const store = new Store();

const { DEFAULT_POSITIONS } = require("../../domains/positions/defaults");

function normalizeNoteColor(value) {
  if (!value) return "#FFFFFF";
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value.type === "gradient") {
    const top = normalizeNoteColor(value.top);
    const bottom = normalizeNoteColor(value.bottom);
    return { type: "gradient", top, bottom };
  }
  return "#FFFFFF";
}

function loadKeyPositions() {
  try {
    const positions = store.get("keyPositions");
    if (!positions) {
      store.set("keyPositions", DEFAULT_POSITIONS);
      return DEFAULT_POSITIONS;
    }

    // 기존 사용자를 위한 호환성 처리 - noteColor와 noteOpacity가 없는 경우 기본값 추가
    const updatedPositions = {};
    let hasUpdates = false;

    Object.keys(positions).forEach((keyMode) => {
      updatedPositions[keyMode] = positions[keyMode].map((key) => {
        const updatedKey = { ...key };

        // noteColor가 없으면 기본값 추가
        if (!updatedKey.hasOwnProperty("noteColor")) {
          updatedKey.noteColor = "#FFFFFF";
          hasUpdates = true;
        } else {
          const normalizedColor = normalizeNoteColor(updatedKey.noteColor);
          if (normalizedColor !== updatedKey.noteColor) {
            updatedKey.noteColor = normalizedColor;
            hasUpdates = true;
          }
        }

        // noteOpacity가 없으면 기본값 추가
        if (!updatedKey.hasOwnProperty("noteOpacity")) {
          updatedKey.noteOpacity = 80;
          hasUpdates = true;
        }

        return updatedKey;
      });
    });

    // 업데이트가 있었다면 저장
    if (hasUpdates) {
      store.set("keyPositions", updatedPositions);
    }

    return updatedPositions;
    return positions;
  } catch (error) {
    console.error("Failed to load key positions:", error);
    return DEFAULT_POSITIONS;
  }
}

function saveKeyPositions(positions) {
  try {
    const normalized = {};
    Object.keys(positions).forEach((mode) => {
      normalized[mode] = positions[mode].map((key) => ({
        ...key,
        noteColor: normalizeNoteColor(key.noteColor),
      }));
    });
    store.set("keyPositions", normalized);
  } catch (error) {
    console.error("Failed to save key positions:", error);
  }
}

function resetKeyPositions() {
  try {
    store.set("keyPositions", DEFAULT_POSITIONS);
    return DEFAULT_POSITIONS;
  } catch (error) {
    console.error("Failed to reset key positions:", error);
    return DEFAULT_POSITIONS;
  }
}

function resetKeyPositionsForMode(mode) {
  try {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_POSITIONS, mode)) {
      return loadKeyPositions();
    }
    const current = loadKeyPositions();
    const updated = { ...current, [mode]: DEFAULT_POSITIONS[mode] };
    store.set("keyPositions", updated);
    return updated;
  } catch (error) {
    console.error("Failed to reset key positions for mode:", error);
    return loadKeyPositions();
  }
}

module.exports = {
  saveKeyPositions,
  loadKeyPositions,
  resetKeyPositions,
  resetKeyPositionsForMode,
};
