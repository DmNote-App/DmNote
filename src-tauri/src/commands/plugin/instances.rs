use tauri::{AppHandle, Emitter, Manager};

use crate::models::PluginInstancesChangedPayload;

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
