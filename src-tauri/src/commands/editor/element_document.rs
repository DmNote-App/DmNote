use element_document::{Document, Op};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::{
    commands::{editor::state::emit_best_effort, run_blocking},
    errors::{CmdResult, CommandError},
    services::event_publisher::publish_element_document_changes,
    state::ElementDocumentCommitResult,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementDocumentGetResult {
    revision: u64,
    document: Document,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ElementDocumentCommitRequest {
    ops: Vec<Op>,
}

#[tauri::command]
pub async fn element_document_get(app: AppHandle) -> CmdResult<ElementDocumentGetResult> {
    run_blocking(app, |_, state| {
        let (revision, document) = state.store.element_document_snapshot();
        Ok(ElementDocumentGetResult { revision, document })
    })
    .await
}

#[tauri::command]
pub async fn element_document_commit(
    app: AppHandle,
    request: ElementDocumentCommitRequest,
) -> CmdResult<ElementDocumentCommitResult> {
    run_blocking(app, move |app, state| {
        let result = state
            .store
            .commit_element_document(&request.ops)
            .map_err(|error| CommandError::msg(format!("{error:#}")))?;
        if matches!(result, ElementDocumentCommitResult::Committed { .. }) {
            publish_element_document_changes(app);
            emit_best_effort(app, "history:status", &state.store.history_status());
        }
        Ok(result)
    })
    .await
}
