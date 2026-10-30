use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use crate::{
    commands::{editor::state::emit_best_effort, run_blocking, run_mutation_task},
    errors::{CmdResult, CommandError},
    models::{
        PluginInstancesChangedPayload, PluginInstancesCommitRequest, PluginInstancesCommitResult,
        PluginInstancesReconcileRequest, PluginInstancesSnapshot,
    },
    state::store::AdmittedPluginInstancesCommit,
};

const MAIN_WINDOW_LABEL: &str = "main";
pub(crate) trait PluginInstancesEventEmitter {
    fn main_available(&self) -> bool;
    fn emit_plugin_instances_changed(
        &self,
        payload: &PluginInstancesChangedPayload,
    ) -> Result<(), String>;
}

impl PluginInstancesEventEmitter for AppHandle {
    fn main_available(&self) -> bool {
        self.get_webview_window(MAIN_WINDOW_LABEL).is_some()
    }

    fn emit_plugin_instances_changed(
        &self,
        payload: &PluginInstancesChangedPayload,
    ) -> Result<(), String> {
        self.emit_to(MAIN_WINDOW_LABEL, "pluginInstances:changed", payload)
            .map_err(|error| error.to_string())
    }
}

pub(crate) fn publish_plugin_instances_changed(
    emitter: &dyn PluginInstancesEventEmitter,
    payload: &PluginInstancesChangedPayload,
) -> bool {
    if !emitter.main_available() {
        return false;
    }
    if let Err(error) = emitter.emit_plugin_instances_changed(payload) {
        log::warn!("failed to publish plugin instance projection: {error}");
        return false;
    }
    true
}

fn finish_plugin_instances_commit(
    app: &AppHandle,
    mutation_id: String,
    authority_generation: u64,
    committed: AdmittedPluginInstancesCommit,
) -> PluginInstancesCommitResult {
    let outcome = &committed.outcome;
    if outcome.changed {
        let payload = PluginInstancesChangedPayload {
            plugin_id: outcome.plugin_id.clone(),
            revision: outcome.model_revision,
            origin_mutation_id: Some(mutation_id),
        };
        publish_plugin_instances_changed(app, &payload);
    }
    if let Some(status) = outcome.history_status.as_ref() {
        emit_best_effort(app, "history:status", status);
    }

    PluginInstancesCommitResult {
        plugin_id: outcome.plugin_id.clone(),
        model_revision: outcome.model_revision,
        authority_generation,
        changed: outcome.changed,
    }
}

#[tauri::command]
pub async fn plugin_instances_get(
    app: AppHandle,
    plugin_id: String,
) -> CmdResult<PluginInstancesSnapshot> {
    run_blocking(app, move |_, state| {
        let (instances, model_revision) = state
            .store
            .plugin_instances_get(&plugin_id)
            .map_err(CommandError::msg)?;
        let snapshot = PluginInstancesSnapshot {
            plugin_id,
            instances,
            model_revision,
            authority_generation: state.plugin_authority().generation(),
        };
        if serde_json::to_vec(&snapshot)
            .map_err(|error| {
                CommandError::msg(format!("INVALID_PLUGIN_INSTANCES_SNAPSHOT:{error}"))
            })?
            .len()
            > crate::state::plugin::MAX_PLUGIN_INSTANCES_REQUEST_BYTES
        {
            return Err(CommandError::msg("PLUGIN_INSTANCES_SNAPSHOT_TOO_LARGE"));
        }
        Ok(snapshot)
    })
    .await
}

#[tauri::command]
pub async fn plugin_instances_commit(
    app: AppHandle,
    window: WebviewWindow,
    request: PluginInstancesCommitRequest,
) -> CmdResult<PluginInstancesCommitResult> {
    let window_label = window.label().to_string();
    run_mutation_task(app, move |app, state, ticket| {
        crate::state::plugin::validate_plugin_instances_request(&request)
            .map_err(CommandError::msg)?;
        if window_label != MAIN_WINDOW_LABEL {
            return Err(CommandError::msg("PLUGIN_INSTANCE_MUTATION_NOT_ALLOWED"));
        }
        let authority = state
            .plugin_authority()
            .admit(request.authority_generation)
            .map_err(CommandError::msg)?;
        let admission = state
            .admit_frontend_history_mutation(&window_label)
            .map_err(|_| CommandError::msg("HISTORY_IN_PROGRESS"))?;
        ticket.run(move || {
            // 잠금 순서: 번호표 turn → authority (gesture.rs와 동일)
            state
                .plugin_authority()
                .revalidate(authority)
                .map_err(CommandError::msg)?;
            let mutation_id = request.mutation_id.clone();
            let committed = state
                .store
                .commit_plugin_instances_with_admission(request, admission)
                .map_err(CommandError::msg)?;
            Ok(finish_plugin_instances_commit(
                app,
                mutation_id,
                authority.generation(),
                committed,
            ))
        })
    })
    .await
}

#[tauri::command]
pub async fn plugin_instances_reconcile(
    app: AppHandle,
    window: WebviewWindow,
    request: PluginInstancesReconcileRequest,
) -> CmdResult<PluginInstancesCommitResult> {
    let window_label = window.label().to_string();
    run_mutation_task(app, move |app, state, ticket| {
        crate::state::plugin::validate_plugin_instances_reconcile_request(&request)
            .map_err(CommandError::msg)?;
        if window_label != MAIN_WINDOW_LABEL {
            return Err(CommandError::msg("PLUGIN_INSTANCE_MUTATION_NOT_ALLOWED"));
        }
        let authority = state
            .plugin_authority()
            .admit(request.authority_generation)
            .map_err(CommandError::msg)?;
        let admission = state
            .admit_frontend_history_mutation(&window_label)
            .map_err(|_| CommandError::msg("HISTORY_IN_PROGRESS"))?;
        ticket.run(move || {
            // 잠금 순서: 번호표 turn → authority (gesture.rs와 동일)
            state
                .plugin_authority()
                .revalidate(authority)
                .map_err(CommandError::msg)?;
            let mutation_id = request.mutation_id.clone();
            let committed = state
                .store
                .reconcile_plugin_instances_with_admission(request, admission)
                .map_err(CommandError::msg)?;
            Ok(finish_plugin_instances_commit(
                app,
                mutation_id,
                authority.generation(),
                committed,
            ))
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use parking_lot::Mutex;

    use super::*;

    struct TestEmitter {
        main_available: bool,
        events: Mutex<Vec<PluginInstancesChangedPayload>>,
    }

    impl PluginInstancesEventEmitter for TestEmitter {
        fn main_available(&self) -> bool {
            self.main_available
        }

        fn emit_plugin_instances_changed(
            &self,
            payload: &PluginInstancesChangedPayload,
        ) -> Result<(), String> {
            self.events.lock().push(payload.clone());
            Ok(())
        }
    }

    #[test]
    fn missing_main_leaves_plugin_projection_pending_without_failure() {
        let emitter = TestEmitter {
            main_available: false,
            events: Mutex::new(Vec::new()),
        };
        let payload = PluginInstancesChangedPayload {
            plugin_id: "demo".to_string(),
            revision: 3,
            origin_mutation_id: None,
        };

        assert!(!publish_plugin_instances_changed(&emitter, &payload));
        assert!(emitter.events.lock().is_empty());
    }

    #[test]
    fn changed_payload_serializes_origin_for_commit_and_omits_it_for_history() {
        let committed = PluginInstancesChangedPayload {
            plugin_id: "demo".to_string(),
            revision: 4,
            origin_mutation_id: Some("mutation-1".to_string()),
        };
        assert_eq!(
            serde_json::to_value(committed).unwrap(),
            serde_json::json!({
                "pluginId": "demo",
                "revision": 4,
                "originMutationId": "mutation-1",
            })
        );

        let restored = PluginInstancesChangedPayload {
            plugin_id: "demo".to_string(),
            revision: 5,
            origin_mutation_id: None,
        };
        assert_eq!(
            serde_json::to_value(restored).unwrap(),
            serde_json::json!({ "pluginId": "demo", "revision": 5 })
        );
    }
}
