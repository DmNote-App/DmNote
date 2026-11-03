use std::collections::{HashMap, HashSet};

use serde_json::Value;

use crate::models::{AppStoreData, SavedPluginInstance};
use crate::state::editor::is_valid_group_id_shape;
use crate::state::native_element_id::{is_valid_element_id, new_unique_id, BackfillOutcome};

// 한 플러그인 인스턴스 목록을 읽을 때 받는 크기 - 넘는 뒤쪽 항목은 읽지 않는다
const MAX_PLUGIN_INSTANCES_BYTES: usize = 8 * 1024 * 1024;
// 플러그인 스토리지 키 네임스페이스 - storage 커맨드와 canonical 헬퍼의 단일 원천
pub(crate) const PLUGIN_DATA_KEY_PREFIX: &str = "plugin_data_";
const MAX_PLUGIN_INSTANCES: usize = 4_096;
const MAX_TAB_ID_BYTES: usize = 128;
const MAX_SETTING_FIELDS: usize = 1_024;
const MAX_SETTING_KEY_BYTES: usize = 256;
const MAX_SETTING_STRING_BYTES: usize = 64 * 1024;

pub(crate) fn validate_plugin_id(plugin_id: &str) -> Result<(), String> {
    if plugin_id.is_empty()
        || !plugin_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("INVALID_PLUGIN_ID".to_string());
    }
    Ok(())
}

fn validate_saved_plugin_instances_envelope(
    instances: &[SavedPluginInstance],
) -> Result<(), String> {
    if instances.len() > MAX_PLUGIN_INSTANCES {
        return Err("TOO_MANY_PLUGIN_INSTANCES".to_string());
    }
    let mut seen_instance_ids = HashSet::new();
    for (index, instance) in instances.iter().enumerate() {
        // 영구 인스턴스 ID는 canonical element ID와 같은 UUID 형식, 같은 플러그인 안에서 유일.
        // None은 허용 - backfill 전 저장 데이터 읽기.
        // group_id는 형상만 검증 (비어있지 않음, 바이트 상한) - 그룹 존재
        // 검증은 도메인 결합 회피로 미수행, dangling은 읽기 가드가 무해화
        if let Some(instance_id) = instance.instance_id.as_deref() {
            if !is_valid_element_id(instance_id) {
                return Err(format!("INVALID_PLUGIN_INSTANCE_ID:{index}"));
            }
            if !seen_instance_ids.insert(instance_id) {
                return Err(format!("DUPLICATE_PLUGIN_INSTANCE_ID:{index}"));
            }
        }
        if !instance.position.x.is_finite() || !instance.position.y.is_finite() {
            return Err(format!("INVALID_PLUGIN_INSTANCE_POSITION:{index}"));
        }
        if let Some(size) = &instance.measured_size {
            if !size.width.is_finite() || !size.height.is_finite() {
                return Err(format!("INVALID_PLUGIN_INSTANCE_SIZE:{index}"));
            }
        }
        if instance.z_index.is_some_and(|z_index| {
            !z_index.is_finite()
                || z_index.fract() != 0.0
                || z_index < f64::from(i32::MIN)
                || z_index > f64::from(i32::MAX)
        }) {
            return Err(format!("INVALID_PLUGIN_INSTANCE_Z_INDEX:{index}"));
        }
        if instance
            .tab_id
            .as_deref()
            .is_some_and(|tab_id| !valid_plugin_tab_id(tab_id))
        {
            return Err(format!("INVALID_PLUGIN_INSTANCE_TAB_ID:{index}"));
        }
        if instance
            .group_id
            .as_deref()
            .is_some_and(|group_id| !is_valid_group_id_shape(group_id))
        {
            return Err(format!("INVALID_PLUGIN_INSTANCE_GROUP_ID:{index}"));
        }
        if let Some(settings) = &instance.settings {
            if settings.len() > MAX_SETTING_FIELDS {
                return Err(format!("TOO_MANY_PLUGIN_INSTANCE_SETTINGS:{index}"));
            }
            for (key, value) in settings {
                if key.is_empty() || key.len() > MAX_SETTING_KEY_BYTES {
                    return Err(format!("INVALID_PLUGIN_SETTING_KEY:{index}"));
                }
                match value {
                    crate::models::PluginSettingValue::String(value)
                        if value.len() > MAX_SETTING_STRING_BYTES =>
                    {
                        return Err(format!("PLUGIN_SETTING_STRING_TOO_LARGE:{index}"));
                    }
                    crate::models::PluginSettingValue::Number(value) if !value.is_finite() => {
                        return Err(format!("INVALID_PLUGIN_SETTING_NUMBER:{index}"));
                    }
                    _ => {}
                }
            }
        }
    }
    Ok(())
}

fn valid_plugin_tab_id(tab_id: &str) -> bool {
    !tab_id.is_empty() && tab_id.len() <= MAX_TAB_ID_BYTES
}

pub(crate) fn normalize_plugin_instance_tab_id(tab_id: Option<&str>) -> &str {
    // 프론트 normalizePluginInstanceTabId(`tabId || '4key'`)와 동일 규칙 -
    // 빈 문자열도 4key로 접는다. 정상 커밋은 ""를 거절하지만 관대 decode
    // 경로(backfill, 그룹 refs 수집)는 검증을 안 거치므로 여기서 맞춘다
    tab_id.filter(|tab_id| !tab_id.is_empty()).unwrap_or("4key")
}

// 모드별 플러그인 그룹 참조 집합 - remove_empty_layer_groups의 생존 판정 입력.
// 모드 판정은 저장 규칙(tab_id normalize)과 동일해야 프론트 집계와 드리프트가 없다
pub(crate) type PluginGroupRefs = HashMap<String, HashSet<String>>;

pub(crate) fn add_plugin_group_refs(refs: &mut PluginGroupRefs, instances: &[SavedPluginInstance]) {
    for instance in instances {
        if let Some(group_id) = instance.group_id.as_deref() {
            let mode = normalize_plugin_instance_tab_id(instance.tab_id.as_deref());
            refs.entry(mode.to_string())
                .or_default()
                .insert(group_id.to_string());
        }
    }
}

// plugin_data의 인스턴스 키를 관대한 decode로 순회 - 그룹 refs 수집의 단일
// 규칙 소스. 잘못된 항목은 로그 후 제외하고 정상 항목은 유지한다
pub(crate) fn for_each_stored_plugin_instances(
    data: &AppStoreData,
    mut visit: impl FnMut(&str, Vec<SavedPluginInstance>),
) {
    for plugin_id in plugin_instance_bucket_ids(data) {
        let key = plugin_instances_storage_key(&plugin_id);
        let instances = decode_plugin_instances_lenient(
            read_plugin_instance_bucket(data, &plugin_id).as_ref(),
            &key,
        )
        .unwrap_or_default();
        visit(&plugin_id, instances);
    }
}

// store의 인스턴스에서 그룹 참조 수집
pub(crate) fn plugin_group_refs_from_store(data: &AppStoreData) -> PluginGroupRefs {
    let mut refs = PluginGroupRefs::new();
    for_each_stored_plugin_instances(data, |_, instances| {
        add_plugin_group_refs(&mut refs, &instances);
    });
    refs
}

// 플러그인 인스턴스 버킷 - 인스턴스 목록(저장 모양 배열)을 읽고 쓰는 단일 입구.
// 저장 위치는 트리 장면(플러그인 종류 요소, state::plugin_tree) - 플러그인 런타임은 같은 목록을 주고받는다
pub(crate) fn plugin_instance_bucket_ids(data: &AppStoreData) -> Vec<String> {
    crate::state::plugin_tree::plugin_bucket_ids(data.element_document())
}

pub(crate) fn read_plugin_instance_bucket(data: &AppStoreData, plugin_id: &str) -> Option<Value> {
    crate::state::plugin_tree::project_plugin_bucket(data.element_document(), plugin_id)
}

pub(crate) fn write_plugin_instance_bucket(
    data: &mut AppStoreData,
    plugin_id: &str,
    value: Option<Value>,
) {
    crate::state::plugin_tree::apply_plugin_bucket(
        data.element_document_mut(),
        plugin_id,
        value.as_ref(),
    );
}

// 처음 한 번 - plugin_data의 인스턴스 키를 트리로 옮긴다. 표식이 있으면 다시 옮기지 않는다
// (남은 키는 쓰지 않고 그대로 둔다). 같은 영속 한 번에 담겨 중간 크래시면 옛 파일로 다시 돈다
/// `reissued_groups` - 트리를 읽을 때 다시 매긴 그룹 id (장면, 옛 id, 새 id). 버킷 항목의 그룹값도 따라 옮긴다
pub(crate) fn migrate_plugin_buckets_into_tree(
    data: &mut AppStoreData,
    reissued_groups: &[(String, String, String)],
) -> bool {
    const IMPORTED: &str = "pluginInstancesImported";
    let keys = data
        .plugin_data
        .keys()
        .filter(|key| is_plugin_instances_storage_key(key))
        .cloned()
        .collect::<Vec<_>>();
    if data.element_document().extra.contains_key(IMPORTED) {
        if !keys.is_empty() {
            log::warn!("[Store] Ignoring plugin instance buckets left after import: {keys:?}");
        }
        return false;
    }
    // 옮길 것이 없으면 표식도 두지 않는다 (이후 버킷은 트리에만 쓰인다)
    if keys.is_empty() {
        return false;
    }
    let mut keys = keys;
    keys.sort_unstable();
    for key in keys {
        let Some(plugin_id) = plugin_id_from_instances_storage_key(&key).map(str::to_string) else {
            continue;
        };
        if let Some(mut value) = data.plugin_data.remove(&key) {
            remap_entry_groups(&mut value, reissued_groups);
            write_plugin_instance_bucket(data, &plugin_id, Some(value));
        }
    }
    data.element_document_mut()
        .extra
        .insert(IMPORTED.into(), Value::from(1));
    true
}

// 버킷 항목의 그룹값 - 그 탭에서 다시 매긴 그룹이면 새 id로
fn remap_entry_groups(bucket: &mut Value, reissued_groups: &[(String, String, String)]) {
    if reissued_groups.is_empty() {
        return;
    }
    for entry in bucket.as_array_mut().into_iter().flatten() {
        let tab = normalize_plugin_instance_tab_id(entry.get("tabId").and_then(Value::as_str))
            .to_string();
        let Some(group) = entry.get("groupId").and_then(Value::as_str) else {
            continue;
        };
        if let Some((_, _, fresh)) = reissued_groups
            .iter()
            .find(|(scene, old, _)| *scene == tab && old == group)
        {
            entry["groupId"] = Value::String(fresh.clone());
        }
    }
}

pub(crate) fn plugin_instances_storage_key(plugin_id: &str) -> String {
    format!("{PLUGIN_DATA_KEY_PREFIX}{plugin_id}/instances")
}

pub(crate) fn plugin_id_from_instances_storage_key(key: &str) -> Option<&str> {
    key.strip_prefix(PLUGIN_DATA_KEY_PREFIX)
        .and_then(|key| key.strip_suffix("/instances"))
        .filter(|plugin_id| validate_plugin_id(plugin_id).is_ok())
}

pub(crate) fn is_plugin_instances_storage_key(key: &str) -> bool {
    plugin_id_from_instances_storage_key(key).is_some()
}

#[derive(Debug)]
pub(crate) enum StoredPluginInstanceEntry {
    Parsed {
        instance: SavedPluginInstance,
        original: Value,
    },
    Unparsed(Value),
}

pub(crate) fn decode_plugin_instance_entries(
    value: &Value,
    storage_key: &str,
) -> Option<Vec<StoredPluginInstanceEntry>> {
    let Some(entries) = value.as_array() else {
        log::warn!("[Store] Invalid plugin instance bucket {storage_key}: expected array");
        return None;
    };

    Some(
        entries
            .iter()
            .enumerate()
            .map(|(index, entry)| {
                match serde_json::from_value::<SavedPluginInstance>(entry.clone()) {
                    Ok(instance) => StoredPluginInstanceEntry::Parsed {
                        instance,
                        original: entry.clone(),
                    },
                    Err(error) => {
                        log::warn!(
                            "[Store] Invalid plugin instance entry key={storage_key} index={index}: {error}"
                        );
                        StoredPluginInstanceEntry::Unparsed(entry.clone())
                    }
                }
            })
            .collect(),
    )
}

pub(crate) fn encode_plugin_instance_entries(
    entries: Vec<StoredPluginInstanceEntry>,
    storage_key: &str,
) -> Value {
    Value::Array(
        entries
            .into_iter()
            .enumerate()
            .map(|(index, entry)| match entry {
                StoredPluginInstanceEntry::Parsed { instance, original } => {
                    serde_json::to_value(instance).unwrap_or_else(|error| {
                        log::warn!(
                            "[Store] Preserving original plugin instance key={storage_key} index={index}: {error}"
                        );
                        original
                    })
                }
                StoredPluginInstanceEntry::Unparsed(value) => value,
            })
            .collect(),
    )
}

// 로드 시점 backfill: 무ID 플러그인 인스턴스에 영구 instanceId 부여.
// recovery 완료 후 호출 전제 - None은 구데이터 승격(changed만),
// invalid나 플러그인 내 중복은 수리(repaired)로 재발급
pub(crate) fn backfill_plugin_instance_ids(data: &mut AppStoreData) -> BackfillOutcome {
    let mut outcome = BackfillOutcome::default();
    // 정렬 순회로 HashMap 비결정성 제거 - 첫 출현 보존이 결정적이게
    let plugin_ids = plugin_instance_bucket_ids(data);

    // 1차 패스: 전 플러그인의 유효 기존 instanceId 수집 (재발급 충돌 예약)
    let mut reserved = HashSet::new();
    let mut decoded = Vec::with_capacity(plugin_ids.len());
    for plugin_id in plugin_ids {
        let key = plugin_instances_storage_key(&plugin_id);
        let Some(value) = read_plugin_instance_bucket(data, &plugin_id) else {
            continue;
        };
        let Some(entries) = decode_plugin_instance_entries(&value, &key) else {
            continue;
        };
        if entries.is_empty() {
            continue;
        }
        for entry in &entries {
            let StoredPluginInstanceEntry::Parsed { instance, .. } = entry else {
                continue;
            };
            if let Some(id) = instance.instance_id.as_deref() {
                if is_valid_element_id(id) {
                    reserved.insert(id.to_string());
                }
            }
        }
        decoded.push((plugin_id, key, entries));
    }

    // 2차 패스: 유효하고 플러그인 내 최초 출현인 ID만 보존, 나머지 재발급.
    // 유일성 판정은 커밋 검증과 동일하게 플러그인 키 단위 - 교차 플러그인
    // 중복은 합법이라 무변경 (fullId가 pluginId 접두 네임스페이스라 충돌 없음).
    // reserved는 전역 유지 - 신규 발급이 기존 어떤 ID와도 겹치지 않게
    for (plugin_id, key, mut entries) in decoded {
        let mut seen = HashSet::new();
        let mut changed = false;
        for entry in &mut entries {
            let StoredPluginInstanceEntry::Parsed { instance, .. } = entry else {
                continue;
            };
            let kept = instance
                .instance_id
                .as_deref()
                .is_some_and(|id| is_valid_element_id(id) && seen.insert(id.to_string()));
            if kept {
                continue;
            }
            if instance.instance_id.is_some() {
                outcome.repaired = true;
            }
            let id = new_unique_id(&mut reserved);
            seen.insert(id.clone());
            instance.instance_id = Some(id);
            changed = true;
        }
        if !changed {
            continue;
        }
        let value = encode_plugin_instance_entries(entries, &key);
        write_plugin_instance_bucket(data, &plugin_id, Some(value));
        outcome.changed = true;
    }
    outcome
}

#[cfg(test)]
pub(crate) fn decode_plugin_instances(
    value: Option<&Value>,
) -> Result<Option<Vec<SavedPluginInstance>>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let instances = serde_json::from_value::<Vec<SavedPluginInstance>>(value.clone())
        .map_err(|error| format!("INVALID_STORED_PLUGIN_INSTANCES:{error}"))?;
    validate_saved_plugin_instances_envelope(&instances)?;
    Ok((!instances.is_empty()).then_some(instances))
}

pub(crate) fn decode_plugin_instances_lenient(
    value: Option<&Value>,
    storage_key: &str,
) -> Option<Vec<SavedPluginInstance>> {
    let value = value?;
    let entries = decode_plugin_instance_entries(value, storage_key)?;

    let mut instances = Vec::with_capacity(entries.len().min(MAX_PLUGIN_INSTANCES));
    let mut seen_instance_ids = HashSet::new();
    let mut encoded_bytes = 2usize;
    for (index, entry) in entries.into_iter().enumerate() {
        if instances.len() == MAX_PLUGIN_INSTANCES {
            log::warn!(
                "[Store] Ignoring plugin instance entries beyond limit key={storage_key} limit={MAX_PLUGIN_INSTANCES}"
            );
            break;
        }
        let StoredPluginInstanceEntry::Parsed { instance, .. } = entry else {
            continue;
        };
        let mut validation_instance = instance.clone();
        if validation_instance.tab_id.as_deref() == Some("") {
            validation_instance.tab_id = None;
        }
        if let Err(error) =
            validate_saved_plugin_instances_envelope(std::slice::from_ref(&validation_instance))
        {
            log::warn!(
                "[Store] Ignoring invalid plugin instance key={storage_key} index={index}: {error}"
            );
            continue;
        }
        if instance
            .instance_id
            .as_deref()
            .is_some_and(|id| !seen_instance_ids.insert(id.to_string()))
        {
            log::warn!(
                "[Store] Ignoring duplicate plugin instance ID key={storage_key} index={index}"
            );
            continue;
        }
        let entry_bytes = match serde_json::to_vec(&instance) {
            Ok(bytes) => bytes.len(),
            Err(error) => {
                log::warn!(
                    "[Store] Ignoring unserializable plugin instance key={storage_key} index={index}: {error}"
                );
                continue;
            }
        };
        let separator_bytes = usize::from(!instances.is_empty());
        if encoded_bytes
            .saturating_add(separator_bytes)
            .saturating_add(entry_bytes)
            > MAX_PLUGIN_INSTANCES_BYTES
        {
            log::warn!(
                "[Store] Ignoring oversized plugin instance suffix key={storage_key} index={index}"
            );
            break;
        }
        encoded_bytes += separator_bytes + entry_bytes;
        instances.push(instance);
    }

    (!instances.is_empty()).then_some(instances)
}

pub(crate) fn encode_plugin_instances(
    instances: &[SavedPluginInstance],
) -> Result<Option<Value>, String> {
    if instances.is_empty() {
        return Ok(None);
    }
    serde_json::to_value(instances)
        .map(Some)
        .map_err(|error| format!("INVALID_PLUGIN_INSTANCES_PAYLOAD:{error}"))
}

#[cfg(test)]
mod tests;
