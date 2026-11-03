use super::*;
use crate::models::PluginPoint;
use crate::state::editor::MAX_GROUP_ID_BYTES;

fn saved_instance() -> SavedPluginInstance {
    SavedPluginInstance {
        instance_id: Some(uuid::Uuid::new_v4().to_string()),
        position: PluginPoint { x: 1.0, y: 2.0 },
        settings: None,
        measured_size: None,
        tab_id: Some("4key".to_string()),
        hidden: false,
        z_index: None,
        group_id: None,
    }
}

// lease가 잠금을 들면 번호표 turn 대기 중 reset·다른 admit이 막혀 교착한다
#[test]
fn saved_instance_wire_rejects_unknown_fields() {
    let error = serde_json::from_value::<SavedPluginInstance>(serde_json::json!({
        "position": { "x": 1.0, "y": 2.0 },
        "tabId": "4key",
        "handler": "not allowed"
    }))
    .unwrap_err();
    assert!(error.to_string().contains("unknown field"));

    validate_saved_plugin_instances_envelope(&[saved_instance()]).unwrap();
}

#[test]
fn saved_instance_wire_defaults_legacy_visibility_and_z_index() {
    let instance = serde_json::from_value::<SavedPluginInstance>(serde_json::json!({
        "position": { "x": 1.0, "y": 2.0 },
        "tabId": "4key"
    }))
    .unwrap();

    assert!(!instance.hidden);
    assert_eq!(instance.z_index, None);
}

#[test]
fn saved_instance_wire_rejects_invalid_z_indexes() {
    for z_index in [1.5, f64::from(i32::MAX) + 1.0, f64::NAN] {
        let instance = SavedPluginInstance {
            z_index: Some(z_index),
            ..saved_instance()
        };

        assert_eq!(
            validate_saved_plugin_instances_envelope(&[instance]).unwrap_err(),
            "INVALID_PLUGIN_INSTANCE_Z_INDEX:0"
        );
    }
}

#[test]
fn legacy_saved_instances_decode_without_identity_fields() {
    // 구형 JSON에는 instanceId/groupId가 없다 - decode(validate 경유) 통과와 None 기본값 고정
    let legacy = serde_json::json!([
        { "position": { "x": 1.0, "y": 2.0 }, "tabId": "4key" },
        { "position": { "x": 3.0, "y": 4.0 }, "tabId": "4key" }
    ]);

    let instances = decode_plugin_instances(Some(&legacy)).unwrap().unwrap();

    assert_eq!(instances.len(), 2);
    assert!(instances
        .iter()
        .all(|instance| instance.instance_id.is_none() && instance.group_id.is_none()));
}

#[test]
fn saved_instance_identity_fields_survive_encode_decode_round_trip() {
    let instance = SavedPluginInstance {
        instance_id: Some(uuid::Uuid::new_v4().to_string()),
        group_id: Some("layer-group".to_string()),
        ..saved_instance()
    };

    let encoded = encode_plugin_instances(std::slice::from_ref(&instance))
        .unwrap()
        .unwrap();
    let decoded = decode_plugin_instances(Some(&encoded)).unwrap().unwrap();

    assert_eq!(decoded, vec![instance]);
}

#[test]
fn saved_instance_wire_rejects_invalid_instance_ids() {
    for invalid_id in ["not-a-uuid".to_string(), uuid::Uuid::nil().to_string()] {
        let instance = SavedPluginInstance {
            instance_id: Some(invalid_id),
            ..saved_instance()
        };

        assert_eq!(
            validate_saved_plugin_instances_envelope(&[instance]).unwrap_err(),
            "INVALID_PLUGIN_INSTANCE_ID:0"
        );
    }
}

#[test]
fn decode_rejects_stored_instances_with_invalid_instance_id() {
    // decode 경로가 validate를 경유하는지 고정
    let stored = serde_json::json!([{
        "position": { "x": 1.0, "y": 2.0 },
        "tabId": "4key",
        "instanceId": "not-a-uuid"
    }]);

    assert_eq!(
        decode_plugin_instances(Some(&stored)).unwrap_err(),
        "INVALID_PLUGIN_INSTANCE_ID:0"
    );
}

#[test]
fn saved_instance_wire_rejects_invalid_group_ids() {
    for invalid_group_id in [String::new(), "x".repeat(MAX_GROUP_ID_BYTES + 1)] {
        let instance = SavedPluginInstance {
            group_id: Some(invalid_group_id),
            ..saved_instance()
        };

        assert_eq!(
            validate_saved_plugin_instances_envelope(&[instance]).unwrap_err(),
            "INVALID_PLUGIN_INSTANCE_GROUP_ID:0"
        );
    }

    // 상한 경계 길이는 통과
    let boundary = SavedPluginInstance {
        group_id: Some("x".repeat(MAX_GROUP_ID_BYTES)),
        ..saved_instance()
    };
    validate_saved_plugin_instances_envelope(&[boundary]).unwrap();
}

#[test]
fn decode_rejects_stored_instances_with_empty_group_id() {
    // decode도 validate 공유 - 손상 group_id는 해당 플러그인만 격리 초기화
    let stored = serde_json::json!([{
        "position": { "x": 1.0, "y": 2.0 },
        "tabId": "4key",
        "instanceId": uuid::Uuid::new_v4().to_string(),
        "groupId": ""
    }]);

    assert_eq!(
        decode_plugin_instances(Some(&stored)).unwrap_err(),
        "INVALID_PLUGIN_INSTANCE_GROUP_ID:0"
    );
}

#[test]
fn normalize_tab_id_folds_missing_and_empty_to_default_mode() {
    // 프론트 normalizePluginInstanceTabId(`tabId || '4key'`)와 동일 규칙 고정
    assert_eq!(normalize_plugin_instance_tab_id(None), "4key");
    assert_eq!(normalize_plugin_instance_tab_id(Some("")), "4key");
    assert_eq!(normalize_plugin_instance_tab_id(Some("8key")), "8key");
}

#[test]
fn group_refs_fold_empty_tab_id_into_default_mode() {
    // 손상 store의 "" tabId도 4key 모드로 집계 - 모드 판정 드리프트 방지
    let mut refs = PluginGroupRefs::new();
    let instance = SavedPluginInstance {
        tab_id: Some(String::new()),
        group_id: Some("plugin-group".to_string()),
        ..saved_instance()
    };
    add_plugin_group_refs(&mut refs, &[instance]);
    assert!(refs["4key"].contains("plugin-group"));
    assert!(!refs.contains_key(""));

    // store 수집(관대 decode 경로)도 동일 판정
    let mut data = AppStoreData::default();
    write_plugin_instance_bucket(
        &mut data,
        "demo",
        Some(serde_json::json!([{
            "position": { "x": 1.0, "y": 2.0 },
            "tabId": "",
            "groupId": "stored-group"
        }])),
    );
    let refs = plugin_group_refs_from_store(&data);
    assert!(refs["4key"].contains("stored-group"));
    assert!(!refs.contains_key(""));
}

#[test]
fn saved_instance_wire_rejects_duplicate_instance_ids_within_plugin() {
    let shared = uuid::Uuid::new_v4().to_string();
    let instances = [
        SavedPluginInstance {
            instance_id: Some(shared.clone()),
            ..saved_instance()
        },
        SavedPluginInstance {
            instance_id: Some(shared),
            ..saved_instance()
        },
    ];

    assert_eq!(
        validate_saved_plugin_instances_envelope(&instances).unwrap_err(),
        "DUPLICATE_PLUGIN_INSTANCE_ID:1"
    );
}

#[test]
fn plugin_storage_key_wire_bytes_are_stable() {
    assert_eq!(
        plugin_instances_storage_key("demo"),
        "plugin_data_demo/instances"
    );
    assert_eq!(
        plugin_id_from_instances_storage_key("plugin_data_demo/instances"),
        Some("demo")
    );
    assert!(is_plugin_instances_storage_key(
        "plugin_data_demo/instances"
    ));
    assert!(!is_plugin_instances_storage_key(
        "plugin_data_invalid/id/instances"
    ));
}

#[test]
fn legacy_long_plugin_ids_remain_addressable() {
    for length in [129, 255, 256, 1_024] {
        let plugin_id = "a".repeat(length);
        validate_plugin_id(&plugin_id).unwrap();
        let key = plugin_instances_storage_key(&plugin_id);
        assert_eq!(
            plugin_id_from_instances_storage_key(&key),
            Some(plugin_id.as_str())
        );
    }

    for plugin_id in ["", "contains/slash", "한글"] {
        assert_eq!(
            validate_plugin_id(plugin_id).unwrap_err(),
            "INVALID_PLUGIN_ID"
        );
        assert_eq!(
            plugin_id_from_instances_storage_key(&plugin_instances_storage_key(plugin_id)),
            None
        );
    }
}

#[test]
fn existing_instance_namespace_is_canonical_without_copying() {
    let key = "plugin_data_demo/instances".to_string();
    let value = serde_json::json!([{
        "position": { "x": 4.0, "y": 5.0 },
        "tabId": "4key",
        "instanceId": uuid::Uuid::new_v4().to_string()
    }]);
    let mut data = AppStoreData::default();
    data.plugin_data.insert(key.clone(), value.clone());

    assert!(!backfill_plugin_instance_ids(&mut data).changed);
    assert_eq!(plugin_instances_storage_key("demo"), key);
    assert_eq!(data.plugin_data[&key], value);
}

#[test]
fn lenient_decode_keeps_valid_entries_and_skips_invalid_siblings() {
    let instance = saved_instance();
    let valid = serde_json::to_value(&instance).unwrap();
    let stored = serde_json::json!([
        valid.clone(),
        { "position": "broken" },
        valid
    ]);

    let decoded =
        decode_plugin_instances_lenient(Some(&stored), "plugin_data_demo/instances").unwrap();

    assert_eq!(decoded, vec![instance]);
}

#[test]
fn legacy_finite_metrics_are_readable() {
    let mut legacy = saved_instance();
    legacy.position.x = 40_000.0;
    let stored = serde_json::to_value(vec![legacy.clone()]).unwrap();
    assert_eq!(
        decode_plugin_instances(Some(&stored)).unwrap().unwrap(),
        vec![legacy]
    );
}
