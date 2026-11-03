// 자동 생성 파일 - 직접 고치지 않는다. 원본: src-tauri/src/errors.rs
// 갱신: UPDATE_TS_BINDINGS=1 cargo test --lib editor_error_bindings --manifest-path src-tauri/Cargo.toml

// 편집 커밋 오류 코드 → 백엔드가 싣는 retryable
export const EDITOR_COMMIT_ERROR_RETRYABLE = {
  REVISION_CONFLICT: true,
  PLUGIN_REVISION_CONFLICT: true,
  VALIDATION_FAILED: false,
  TOO_MANY_GESTURE_IDS: false,
  INVALID_GESTURE_ID: false,
  PAIRED_UPDATE_REQUIRED: false,
  MULTI_KEY_UNSUPPORTED: false,
  MUTATION_ID_REUSED: false,
  HISTORY_IN_PROGRESS: true,
  HISTORY_EPOCH_CONFLICT: true,
  IO_ERROR: true,
} as const;

export type EditorCommitErrorCode = keyof typeof EDITOR_COMMIT_ERROR_RETRYABLE;

// VALIDATION_FAILED의 details.validationCode 중 저장 한도 초과 계열
export const EDITOR_CAPACITY_VALIDATION_CODES = [
  'COLLECTION_TOO_LARGE',
  'FROZEN_INSERT_BATCH_TOO_LARGE',
  'HISTORY_ENTRY_TOO_LARGE',
  'INVALID_ELEMENT_GROUP_TARGET_COUNT',
  'REORDER_BATCH_TOO_LARGE',
  'REQUEST_TOO_LARGE',
  'TOO_MANY_CUSTOM_TABS',
  'TOO_MANY_EDITOR_OPS',
  'TOO_MANY_LAYER_GROUPS',
  'TOO_MANY_MODES',
  'TOO_MANY_SPRITE_POSE_TRIGGERS',
  'TOO_MANY_RENDER_ITEMS',
  'TOO_MANY_SLOTS_PER_MEMBER',
] as const;
