use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PanelDragErrorCode {
    InvalidGeometry,
    MonitorUnavailable,
    PanelNotOpen,
    PresentFailed,
    DragStartFailed,
    DragStartNotObserved,
}

impl PanelDragErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InvalidGeometry => "INVALID_GEOMETRY",
            Self::MonitorUnavailable => "MONITOR_UNAVAILABLE",
            Self::PanelNotOpen => "PANEL_NOT_OPEN",
            Self::PresentFailed => "PRESENT_FAILED",
            Self::DragStartFailed => "DRAG_START_FAILED",
            Self::DragStartNotObserved => "DRAG_START_NOT_OBSERVED",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PanelDragError {
    pub error_code: PanelDragErrorCode,
    pub message: String,
}

impl PanelDragError {
    pub fn new(error_code: PanelDragErrorCode, message: impl Into<String>) -> Self {
        Self {
            error_code,
            message: format!("{}: {}", error_code.as_str(), message.into()),
        }
    }
}

impl std::fmt::Display for PanelDragError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for PanelDragError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EditorCommitErrorCode {
    RevisionConflict,
    PluginRevisionConflict,
    ValidationFailed,
    TooManyGestureIds,
    InvalidGestureId,
    PairedUpdateRequired,
    MultiKeyUnsupported,
    MutationIdReused,
    HistoryInProgress,
    HistoryEpochConflict,
    IoError,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EditorCommitErrorDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_revision: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_history_epoch: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorCommitError {
    pub error_code: EditorCommitErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<EditorCommitErrorDetails>,
    pub retryable: bool,
}

impl EditorCommitError {
    pub fn revision_conflict(current_revision: u64) -> Self {
        Self {
            error_code: EditorCommitErrorCode::RevisionConflict,
            message: "editor revision conflict".to_string(),
            details: Some(EditorCommitErrorDetails {
                current_revision: Some(current_revision),
                ..EditorCommitErrorDetails::default()
            }),
            retryable: true,
        }
    }

    pub fn plugin_revision_conflict(current_plugin_model_revision: u64) -> Self {
        Self {
            error_code: EditorCommitErrorCode::PluginRevisionConflict,
            message: format!(
                "plugin model revision conflict at revision {current_plugin_model_revision}"
            ),
            details: None,
            retryable: true,
        }
    }

    pub fn validation(validation_code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            error_code: EditorCommitErrorCode::ValidationFailed,
            message: message.into(),
            details: Some(EditorCommitErrorDetails {
                validation_code: Some(validation_code.into()),
                ..EditorCommitErrorDetails::default()
            }),
            retryable: false,
        }
    }

    pub fn too_many_gesture_ids(max: usize) -> Self {
        Self {
            error_code: EditorCommitErrorCode::TooManyGestureIds,
            message: format!("gesture ID count exceeds {max}"),
            details: None,
            retryable: false,
        }
    }

    pub fn invalid_gesture_id() -> Self {
        Self {
            error_code: EditorCommitErrorCode::InvalidGestureId,
            message: "gesture IDs must be UUIDs no longer than 64 bytes".to_string(),
            details: None,
            retryable: false,
        }
    }

    pub fn paired_update_required(field: impl Into<String>) -> Self {
        let field = field.into();
        Self {
            error_code: EditorCommitErrorCode::PairedUpdateRequired,
            message: format!("{field} must be updated with its paired field"),
            details: Some(EditorCommitErrorDetails {
                field: Some(field),
                ..EditorCommitErrorDetails::default()
            }),
            retryable: false,
        }
    }

    pub fn multi_key_unsupported() -> Self {
        Self {
            error_code: EditorCommitErrorCode::MultiKeyUnsupported,
            message: "multi-key mappings require an explicit multiKey capability".to_string(),
            details: None,
            retryable: false,
        }
    }

    pub fn mutation_id_reused() -> Self {
        Self {
            error_code: EditorCommitErrorCode::MutationIdReused,
            message: "mutationId was reused with a different request".to_string(),
            details: None,
            retryable: false,
        }
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self {
            error_code: EditorCommitErrorCode::IoError,
            message: message.into(),
            details: None,
            retryable: true,
        }
    }

    pub fn history_in_progress() -> Self {
        Self {
            error_code: EditorCommitErrorCode::HistoryInProgress,
            message: "history operation is in progress".to_string(),
            details: None,
            retryable: true,
        }
    }

    pub fn history_epoch_conflict(current_history_epoch: u64) -> Self {
        Self {
            error_code: EditorCommitErrorCode::HistoryEpochConflict,
            message: "history epoch conflict".to_string(),
            details: Some(EditorCommitErrorDetails {
                current_history_epoch: Some(current_history_epoch),
                ..EditorCommitErrorDetails::default()
            }),
            retryable: true,
        }
    }
}

impl std::fmt::Display for EditorCommitError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for EditorCommitError {}

/// Tauri 커맨드 통합 에러 타입
#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("{0}")]
    Message(String),

    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),

    #[error(transparent)]
    Tauri(#[from] tauri::Error),

    #[error(transparent)]
    Editor(#[from] EditorCommitError),

    #[error(transparent)]
    PanelDrag(#[from] PanelDragError),
}

impl CommandError {
    /// 도메인 코드 문자열 에러 생성 ("invalid-preset", "not-found" 등)
    pub fn msg(s: impl Into<String>) -> Self {
        Self::Message(s.into())
    }
}

// Tauri 커맨드는 에러 타입에 Serialize 필수
// 프론트 호환성을 위해 문자열로 직렬화
impl Serialize for CommandError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Self::Editor(error) => error.serialize(serializer),
            _ => serializer.serialize_str(&self.to_string()),
        }
    }
}

/// 커맨드 반환 타입 별칭
pub type CmdResult<T> = Result<T, CommandError>;

#[cfg(test)]
mod tests {
    use super::*;

    // VALIDATION_FAILED의 details.validationCode 중 "저장 한도 초과" 계열 전수.
    // 여기 없는 코드는 프론트에서 한도 안내 대신 일반 오류 안내로 표시된다 (TS는 이 목록에서 만든다)
    const CAPACITY_VALIDATION_CODES: &[&str] = &[
        "COLLECTION_TOO_LARGE",
        // 배치 상한 - TOO_MANY_RENDER_ITEMS와 같은 MAX_RENDER_ITEMS를 쓴다
        "FROZEN_INSERT_BATCH_TOO_LARGE",
        "HISTORY_ENTRY_TOO_LARGE",
        // setElementGroups targets 상한. 빈 배열은 플러그인 전용 편집으로 허용되므로 순수 배치 초과 전용이다
        "INVALID_ELEMENT_GROUP_TARGET_COUNT",
        "REORDER_BATCH_TOO_LARGE",
        "REQUEST_TOO_LARGE",
        "TOO_MANY_CUSTOM_TABS",
        "TOO_MANY_EDITOR_OPS",
        "TOO_MANY_LAYER_GROUPS",
        "TOO_MANY_MODES",
        // 자세당 담당 키 상한 (MAX_SPRITE_POSE_TRIGGERS)
        "TOO_MANY_SPRITE_POSE_TRIGGERS",
        "TOO_MANY_RENDER_ITEMS",
        "TOO_MANY_SLOTS_PER_MEMBER",
    ];

    // 한도 헬퍼를 쓰는 소스. 손목록끼리만 대조하면 백엔드에 새 한도 코드가
    // 생겨도 전부 green이라, 실제 호출부를 스캔해 결합한다
    const EDITOR_SOURCE: &str = include_str!("state/editor.rs");
    const EDITOR_LIMITS_SOURCE: &str = include_str!("state/editor/limits.rs");
    const PLUGIN_SOURCE: &str = include_str!("state/plugin.rs");

    /// 용량 목록에 넣지 않는 한도 코드와 사유. 새 한도 코드는 목록에 넣거나
    /// 여기에 사유와 함께 등록해야 한다
    const NON_CAPACITY_LIMIT_CODES: &[(&str, &str)] = &[
        (
            "MODE_ID_TOO_LONG",
            "길이 한도 - 요소를 줄이라는 안내와 무관",
        ),
        ("GROUP_ID_TOO_LONG", "길이 한도"),
        ("GROUP_NAME_TOO_LONG", "길이 한도"),
        (
            "PLUGIN_RPC_REQUEST_TOO_LARGE",
            "plugin RPC - CommandError로만 나감",
        ),
        (
            "PLUGIN_RPC_RESPONSE_TOO_LARGE",
            "plugin RPC - CommandError로만 나감",
        ),
    ];

    fn limit_codes_in(source: &str) -> Vec<String> {
        let mut codes = Vec::new();
        for helper in ["validate_count_limit(", "validate_compact_size("] {
            let mut rest = source;
            while let Some(at) = rest.find(helper) {
                rest = &rest[at + helper.len()..];
                let window = &rest[..rest.len().min(400)];
                if let Some(start) = window.find('"') {
                    let tail = &window[start + 1..];
                    if let Some(end) = tail.find('"') {
                        let literal = &tail[..end];
                        if !literal.is_empty()
                            && literal
                                .chars()
                                .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
                        {
                            codes.push(literal.to_string());
                        }
                    }
                }
            }
        }
        codes
    }

    #[test]
    fn every_limit_helper_code_is_classified() {
        let mut found = limit_codes_in(EDITOR_SOURCE);
        found.extend(limit_codes_in(EDITOR_LIMITS_SOURCE));
        found.extend(limit_codes_in(PLUGIN_SOURCE));
        found.sort();
        found.dedup();
        assert!(
            !found.is_empty(),
            "한도 헬퍼 호출부를 하나도 찾지 못했다 - 스캐너가 깨졌다"
        );
        for code in &found {
            let classified = CAPACITY_VALIDATION_CODES.contains(&code.as_str())
                || NON_CAPACITY_LIMIT_CODES
                    .iter()
                    .any(|(excluded, _)| excluded == code);
            assert!(
                classified,
                "한도 코드 {code}가 용량 목록에도 제외 목록에도 없다. \
                 사용자에게 한도 안내가 필요하면 CAPACITY_VALIDATION_CODES에, \
                 아니면 사유와 함께 NON_CAPACITY_LIMIT_CODES에 등록할 것"
            );
        }
    }

    #[test]
    fn capacity_codes_serialize_as_validation_failed_with_their_code() {
        for code in CAPACITY_VALIDATION_CODES {
            let wire = serde_json::to_value(EditorCommitError::validation(*code, "sample"))
                .expect("error must serialize");
            assert_eq!(wire["errorCode"], "VALIDATION_FAILED");
            assert_eq!(wire["retryable"], false);
            assert_eq!(wire["details"]["validationCode"], *code);
        }
    }

    // 생성자 표본, variant 추가 시 match가 컴파일 에러로 등록을 강제한다
    fn sample(code: EditorCommitErrorCode) -> EditorCommitError {
        match code {
            EditorCommitErrorCode::RevisionConflict => EditorCommitError::revision_conflict(1),
            EditorCommitErrorCode::PluginRevisionConflict => {
                EditorCommitError::plugin_revision_conflict(1)
            }
            EditorCommitErrorCode::ValidationFailed => {
                EditorCommitError::validation("SAMPLE", "sample")
            }
            EditorCommitErrorCode::TooManyGestureIds => EditorCommitError::too_many_gesture_ids(4),
            EditorCommitErrorCode::InvalidGestureId => EditorCommitError::invalid_gesture_id(),
            EditorCommitErrorCode::PairedUpdateRequired => {
                EditorCommitError::paired_update_required("keys")
            }
            EditorCommitErrorCode::MultiKeyUnsupported => {
                EditorCommitError::multi_key_unsupported()
            }
            EditorCommitErrorCode::MutationIdReused => EditorCommitError::mutation_id_reused(),
            EditorCommitErrorCode::HistoryInProgress => EditorCommitError::history_in_progress(),
            EditorCommitErrorCode::HistoryEpochConflict => {
                EditorCommitError::history_epoch_conflict(1)
            }
            EditorCommitErrorCode::IoError => EditorCommitError::io("io failure"),
        }
    }

    const ALL_CODES: [EditorCommitErrorCode; 11] = [
        EditorCommitErrorCode::RevisionConflict,
        EditorCommitErrorCode::PluginRevisionConflict,
        EditorCommitErrorCode::ValidationFailed,
        EditorCommitErrorCode::TooManyGestureIds,
        EditorCommitErrorCode::InvalidGestureId,
        EditorCommitErrorCode::PairedUpdateRequired,
        EditorCommitErrorCode::MultiKeyUnsupported,
        EditorCommitErrorCode::MutationIdReused,
        EditorCommitErrorCode::HistoryInProgress,
        EditorCommitErrorCode::HistoryEpochConflict,
        EditorCommitErrorCode::IoError,
    ];

    #[test]
    fn every_error_code_has_a_constructor_with_matching_wire_retryable() {
        for code in ALL_CODES {
            let error = sample(code);
            assert_eq!(error.error_code, code);
            let wire = serde_json::to_value(&error).expect("error must serialize");
            assert_eq!(wire["retryable"], serde_json::json!(error.retryable));
        }
    }

    // 프론트 오류 코드(src/types/generated/editorErrors.ts) - 코드 전수·코드별 retryable·한도 코드 목록.
    // 커밋된 파일과 다르면 실패한다. 갱신: UPDATE_TS_BINDINGS=1 cargo test --lib editor_error_bindings
    fn editor_error_bindings() -> String {
        let mut out = String::from(
            "// 자동 생성 파일 - 직접 고치지 않는다. 원본: src-tauri/src/errors.rs\n\
             // 갱신: UPDATE_TS_BINDINGS=1 cargo test --lib editor_error_bindings --manifest-path src-tauri/Cargo.toml\n\n\
             // 편집 커밋 오류 코드 → 백엔드가 싣는 retryable\n\
             export const EDITOR_COMMIT_ERROR_RETRYABLE = {\n",
        );
        for code in ALL_CODES {
            let error = sample(code);
            let wire = serde_json::to_value(error.error_code).expect("code must serialize");
            out.push_str(&format!(
                "  {}: {},\n",
                wire.as_str().expect("code must be a string"),
                error.retryable
            ));
        }
        out.push_str(
            "} as const;\n\n\
             export type EditorCommitErrorCode = keyof typeof EDITOR_COMMIT_ERROR_RETRYABLE;\n\n\
             // VALIDATION_FAILED의 details.validationCode 중 저장 한도 초과 계열\n\
             export const EDITOR_CAPACITY_VALIDATION_CODES = [\n",
        );
        for code in CAPACITY_VALIDATION_CODES {
            out.push_str(&format!("  '{code}',\n"));
        }
        out.push_str("] as const;\n");
        out
    }

    #[test]
    fn editor_error_bindings_match_committed_file() {
        let generated = editor_error_bindings();
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../src/types/generated/editorErrors.ts");
        if std::env::var_os("UPDATE_TS_BINDINGS").is_some() {
            std::fs::write(&path, &generated).expect("bindings must be written");
            return;
        }
        assert!(
            std::fs::read_to_string(&path).unwrap_or_default() == generated,
            "프론트 오류 코드가 Rust 원본과 다릅니다. UPDATE_TS_BINDINGS=1 cargo test --lib editor_error_bindings 로 갱신하세요"
        );
    }
}
