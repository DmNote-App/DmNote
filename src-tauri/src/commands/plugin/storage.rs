use serde_json::Value;
use tauri::{AppHandle, WebviewWindow};

use crate::{
    commands::{editor::state::emit_best_effort, run_blocking, run_history_mutation},
    errors::CmdResult,
    services::event_publisher::publish_element_document_changes,
    state::plugin::{plugin_instances_storage_key, validate_plugin_id, PLUGIN_DATA_KEY_PREFIX},
};

/// 플러그인 스토리지 키 생성 (네임스페이스 자동 적용)
fn make_storage_key(key: &str) -> String {
    format!("{PLUGIN_DATA_KEY_PREFIX}{key}")
}

fn canonical_instances_key_for_full_namespace(prefix: &str) -> Option<String> {
    let plugin_id = prefix.strip_suffix('/')?;
    validate_plugin_id(plugin_id).ok()?;
    Some(plugin_instances_storage_key(plugin_id))
}

/// 플러그인 데이터 조회
#[tauri::command]
pub async fn plugin_storage_get(app: AppHandle, key: String) -> CmdResult<Option<Value>> {
    let storage_key = make_storage_key(&key);
    run_blocking(app, move |_, state| {
        Ok(state.store.get_plugin_data(&storage_key)?)
    })
    .await
}

/// 플러그인 데이터 저장
#[tauri::command]
pub async fn plugin_storage_set(
    app: AppHandle,
    window: WebviewWindow,
    key: String,
    value: Value,
) -> CmdResult<()> {
    let storage_key = make_storage_key(&key);
    run_history_mutation(
        app,
        window.label().to_string(),
        move |app, state, admission| {
            let mutation =
                state
                    .store
                    .set_plugin_data_with_admission(&storage_key, value, admission)?;
            if let Some(status) = mutation.history_status.as_ref() {
                emit_best_effort(app, "history:status", status);
            }
            Ok(())
        },
    )
    .await
}

/// 플러그인 데이터 삭제
#[tauri::command]
pub async fn plugin_storage_remove(
    app: AppHandle,
    window: WebviewWindow,
    key: String,
) -> CmdResult<()> {
    let storage_key = make_storage_key(&key);
    run_history_mutation(
        app,
        window.label().to_string(),
        move |app, state, admission| {
            let mutation = state
                .store
                .remove_plugin_data_with_admission(&storage_key, admission)?;
            if let Some(status) = mutation.history_status.as_ref() {
                emit_best_effort(app, "history:status", status);
            }
            Ok(())
        },
    )
    .await
}

/// 모든 플러그인 데이터 삭제
#[tauri::command]
pub async fn plugin_storage_clear(app: AppHandle, window: WebviewWindow) -> CmdResult<()> {
    run_history_mutation(
        app,
        window.label().to_string(),
        move |app, state, admission| {
            let mutation = state
                .store
                .clear_all_plugin_data_with_admission(admission)?;
            // 인스턴스 버킷은 트리 장면에 있다 - 기록 상태가 없어도(기록이 비었을 때) 창들이 트리로 따라오게
            publish_element_document_changes(app);
            if let Some(status) = mutation.history_status.as_ref() {
                emit_best_effort(app, "history:status", status);
            }
            Ok(())
        },
    )
    .await
}

/// 플러그인 데이터 키 목록 조회
#[tauri::command]
pub async fn plugin_storage_keys(app: AppHandle) -> CmdResult<Vec<String>> {
    run_blocking(app, |_, state| {
        let all_keys = state.store.get_all_plugin_keys()?;

        // 네임스페이스 프리픽스 제거하여 반환
        let user_keys: Vec<String> = all_keys
            .into_iter()
            .filter(|k| k.starts_with(PLUGIN_DATA_KEY_PREFIX))
            .map(|k| {
                k.strip_prefix(PLUGIN_DATA_KEY_PREFIX)
                    .unwrap_or(&k)
                    .to_string()
            })
            .collect();

        Ok(user_keys)
    })
    .await
}

/// 특정 접두사로 시작하는 플러그인 데이터가 있는지 확인
#[tauri::command]
pub async fn plugin_storage_has_data(app: AppHandle, prefix: String) -> CmdResult<bool> {
    run_blocking(app, move |_, state| {
        let all_keys = state.store.get_all_plugin_keys()?;

        let storage_prefix = make_storage_key(&prefix);
        let canonical_instances_key = canonical_instances_key_for_full_namespace(&prefix);
        let has_data = all_keys.iter().any(|key| {
            key.starts_with(&storage_prefix)
                || canonical_instances_key
                    .as_ref()
                    .is_some_and(|canonical| key == canonical)
        });

        Ok(has_data)
    })
    .await
}

/// 특정 접두사로 시작하는 모든 플러그인 데이터 삭제
#[tauri::command]
pub async fn plugin_storage_clear_by_prefix(
    app: AppHandle,
    window: WebviewWindow,
    prefix: String,
) -> CmdResult<usize> {
    let storage_prefix = make_storage_key(&prefix);
    run_history_mutation(
        app,
        window.label().to_string(),
        move |app, state, admission| {
            let mutation = state
                .store
                .remove_plugin_data_by_prefix_with_admission(&storage_prefix, admission)?;
            // 인스턴스 버킷은 트리 장면에 있다 - 기록 상태가 없어도(기록이 비었을 때) 창들이 트리로 따라오게
            publish_element_document_changes(app);
            if let Some(status) = mutation.history_status.as_ref() {
                emit_best_effort(app, "history:status", status);
            }
            Ok(mutation.value)
        },
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    // 저장 키 네임스페이스 wire 바이트 고정
    #[test]
    fn storage_key_namespace_wire_bytes_are_stable() {
        assert_eq!(
            make_storage_key("demo/settings"),
            "plugin_data_demo/settings"
        );
    }

    #[test]
    fn only_a_full_plugin_namespace_maps_to_canonical_instances() {
        assert_eq!(
            canonical_instances_key_for_full_namespace("demo-plugin/"),
            Some("plugin_data_demo-plugin/instances".to_string())
        );
        assert_eq!(
            canonical_instances_key_for_full_namespace("demo-plugin"),
            None
        );
        assert_eq!(
            canonical_instances_key_for_full_namespace("demo-plugin/cache/"),
            None
        );
        assert_eq!(
            canonical_instances_key_for_full_namespace("invalid/id/"),
            None
        );
    }
}
