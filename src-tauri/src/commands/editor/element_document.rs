use element_document::{ChangeSet, Document, Op};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewWindow};

use crate::{
    commands::{
        editor::state::{emit_best_effort, publish_editor_commit},
        plugin::instances::publish_plugin_instances_changed,
        run_blocking, run_prepared_mutation,
    },
    errors::{CmdResult, CommandError, EditorCommitError, EditorCommitErrorCode},
    models::{EditorCommitRequest, EditorField, PluginInstancesChangedPayload},
    services::event_publisher::publish_element_document_changes,
    state::{AppState, ElementDocumentCommitPlan, ElementDocumentCommitResult},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementDocumentGetResult {
    revision: u64,
    document: std::sync::Arc<Document>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ElementDocumentCommitRequest {
    ops: Vec<Op>,
    // 옛 종류 요소 편집을 같은 동작의 다른 편집과 한 되돌리기 단계로 묶는다
    #[serde(default)]
    gesture_id: Option<String>,
}

#[tauri::command]
pub async fn element_document_get(app: AppHandle) -> CmdResult<ElementDocumentGetResult> {
    run_blocking(app, |_, state| {
        let (revision, document) = state.store.element_document_snapshot();
        Ok(ElementDocumentGetResult { revision, document })
    })
    .await
}

fn rejected(state: &AppState, code: &'static str) -> ElementDocumentCommitResult {
    ElementDocumentCommitResult::Rejected {
        revision: state.store.element_document_revision(),
        code,
        violations: Vec::new(),
        editor_error: None,
    }
}

// 옛 편집 커밋이 받지 않은 트리 쓰기 - 창이 일시 실패(다시 보내기)·한도 초과(안내)를 가르게 오류를 함께 싣는다
fn legacy_rejected(state: &AppState, error: EditorCommitError) -> ElementDocumentCommitResult {
    ElementDocumentCommitResult::Rejected {
        revision: state.store.element_document_revision(),
        code: "LEGACY_REJECTED",
        violations: Vec::new(),
        editor_error: Some(Box::new(error)),
    }
}

// 트리에서 옮긴 플러그인 노드의 항목 값이 바뀌었으면 플러그인 쪽에 알린다
fn publish_plugin_changes(app: &AppHandle, changes: &[PluginInstancesChangedPayload]) {
    for payload in changes {
        publish_plugin_instances_changed(app, payload);
    }
}

// 옛 종류 요소를 고치는 트리 쓰기 - 옛 편집 커밋으로 보낸다 (검증·되돌리기·옛 알림 그대로)
fn commit_through_editor(
    app: &AppHandle,
    state: &AppState,
    window_label: &str,
    request: EditorCommitRequest,
    changes: ChangeSet,
) -> std::result::Result<ElementDocumentCommitResult, EditorCommitError> {
    let admission = state
        .admit_frontend_history_mutation(window_label)
        .map_err(|_| EditorCommitError::history_in_progress())?;
    let requested_fields = request
        .changes
        .as_ref()
        .map_or_else(Vec::new, |changes| changes.included_fields());
    let previous_mode = requested_fields
        .contains(&EditorField::Keys)
        .then(|| state.keyboard.current_mode());
    let (change, key_runtime_applied) =
        state.commit_editor_document_preserving_runtime_counters(app, request, &admission)?;
    publish_editor_commit(
        app,
        state,
        &change,
        key_runtime_applied,
        false,
        &requested_fields,
        previous_mode,
    );
    drop(admission);
    publish_element_document_changes(app);
    publish_plugin_changes(app, &change.plugin_instances_changes);
    Ok(ElementDocumentCommitResult::Committed {
        revision: state.store.element_document_revision(),
        changes,
    })
}

#[tauri::command]
pub async fn element_document_commit(
    app: AppHandle,
    window: WebviewWindow,
    request: ElementDocumentCommitRequest,
) -> CmdResult<ElementDocumentCommitResult> {
    let window_label = window.label().to_string();
    // 옛 편집 커밋과 같은 순서 보장(발행 티켓) 아래에서 돈다
    run_prepared_mutation(
        app,
        |_, _| Ok(()),
        move |app, state, ()| {
            // 다른 커밋이 끼어 옛 편집 리비전이 어긋나면 한 번 다시 계획한다
            let mut conflict = None;
            for attempt in 0..2 {
                let plan = state
                    .store
                    .plan_element_document_commit(&request.ops, request.gesture_id.clone())
                    .map_err(|error| CommandError::msg(format!("{error:#}")))?;
                match plan {
                    ElementDocumentCommitPlan::Rejected(result) => return Ok(result),
                    plan @ (ElementDocumentCommitPlan::TreeOnly
                    | ElementDocumentCommitPlan::TreeOrderOnly) => {
                        let check_legacy = matches!(plan, ElementDocumentCommitPlan::TreeOnly);
                        let (result, plugin_changes) = state
                            .store
                            .commit_element_document_tree(
                                &request.ops,
                                check_legacy,
                                request.gesture_id.clone(),
                            )
                            .map_err(|error| CommandError::msg(format!("{error:#}")))?;
                        if matches!(result, ElementDocumentCommitResult::Committed { .. }) {
                            publish_element_document_changes(app);
                            publish_plugin_changes(app, &plugin_changes);
                            emit_best_effort(app, "history:status", &state.store.history_status());
                        }
                        return Ok(result);
                    }
                    ElementDocumentCommitPlan::Legacy {
                        request: editor_request,
                        changes,
                    } => match commit_through_editor(
                        app,
                        state,
                        &window_label,
                        *editor_request,
                        changes,
                    ) {
                        Ok(result) => return Ok(result),
                        Err(error)
                            if error.error_code == EditorCommitErrorCode::RevisionConflict =>
                        {
                            conflict = Some(error);
                            if attempt == 0 {
                                continue;
                            }
                            break;
                        }
                        Err(error)
                            if error.error_code == EditorCommitErrorCode::HistoryInProgress =>
                        {
                            return Ok(rejected(state, "HISTORY_IN_PROGRESS"));
                        }
                        Err(error) => {
                            log::info!(
                                "[ElementDocument] legacy edit rejected: {:?} {}",
                                error.error_code,
                                error.message
                            );
                            return Ok(legacy_rejected(state, error));
                        }
                    },
                }
            }
            Ok(match conflict {
                Some(error) => legacy_rejected(state, error),
                None => rejected(state, "LEGACY_REJECTED"),
            })
        },
    )
    .await
}

/// 플러그인 외부 요소 종류 등록 - 등록 전 그 종류의 요소는 모르는 종류로 보존된다(옮기기·크기·삭제만)
#[tauri::command]
pub async fn element_kind_register(
    app: AppHandle,
    schema: element_document::schema::KindSchema,
) -> CmdResult<()> {
    run_blocking(app, move |_, state| {
        state
            .store
            .register_external_kind(schema)
            .map_err(|error| CommandError::msg(error.to_string()))
    })
    .await
}

/// 플러그인 외부 요소 종류 빼기 - 그 종류의 요소는 다시 모르는 종류로 보존된다
#[tauri::command]
pub async fn element_kind_unregister(app: AppHandle, kind: String) -> CmdResult<()> {
    run_blocking(app, move |_, state| {
        state.store.unregister_external_kind(&kind);
        Ok(())
    })
    .await
}
