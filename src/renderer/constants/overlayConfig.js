import { NOTE_SETTINGS_CONSTRAINTS } from "../../types/noteSettingsConstraints";

// 노트 효과 기본 설정
export const DEFAULT_NOTE_SETTINGS = {
  borderRadius: NOTE_SETTINGS_CONSTRAINTS.borderRadius.default,
  speed: NOTE_SETTINGS_CONSTRAINTS.speed.default,
  trackHeight: NOTE_SETTINGS_CONSTRAINTS.trackHeight.default,
  reverse: false,
  fadePosition: "auto",
  delayedNoteEnabled: false,
  shortNoteThresholdMs: NOTE_SETTINGS_CONSTRAINTS.shortNoteThresholdMs.default,
  shortNoteMinLengthPx: NOTE_SETTINGS_CONSTRAINTS.shortNoteMinLengthPx.default,
  keyDisplayDelayMs: NOTE_SETTINGS_CONSTRAINTS.keyDisplayDelayMs.default,
};

// 기존 상수(하위 호환성 유지)
export const TRACK_HEIGHT = DEFAULT_NOTE_SETTINGS.trackHeight;

// 제약 값 export
export { NOTE_SETTINGS_CONSTRAINTS } from "../../types/noteSettingsConstraints";
