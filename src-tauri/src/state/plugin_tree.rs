//! 플러그인 인스턴스 버킷 ↔ 트리 장면.
//! 인스턴스 목록(저장 모양 배열)의 항목을 탭 장면의 플러그인 종류 요소로 두고, 읽을 때 같은 배열을 돌려준다.
//! 목록 순서·겹침 순서·그룹 소속·측정 크기 유무는 요소에 둔 원본 항목이 정한다(트리 자리는 아직 쓰지 않는다).
//! 해석 못 한 항목·없는 탭·플러그인 안에서 겹친 id는 장면 밖 칸에 원본으로 보존한다

use std::collections::{BTreeSet, HashMap, HashSet};

use element_document::document::walk;
use element_document::schema::EXTERNAL_KIND_PREFIX;
use element_document::{Document, Element, Frame, Node};
use serde_json::{json, Map, Value};

use super::plugin::normalize_plugin_instance_tab_id;

const LEGACY: &str = "legacy";
const ENTRY: &str = "pluginEntry";
const ORDER: &str = "order";
// 장면 밖에 보존한 항목 - {pluginId: [{order, entry}] | {raw}}
const REST: &str = "pluginInstanceRest";
// 측정 크기가 없을 때 - 크기 조절 플러그인의 기본 크기
const DEFAULT_SIZE: (f64, f64) = (200.0, 150.0);

pub(crate) fn plugin_kind(plugin_id: &str) -> String {
    format!("{EXTERNAL_KIND_PREFIX}{plugin_id}")
}

/// 요소 id - 프론트 fullId와 같다 (플러그인 사이 instanceId 중복은 합법)
pub(crate) fn plugin_element_id(plugin_id: &str, instance_id: &str) -> String {
    format!("{plugin_id}::{instance_id}")
}

pub(crate) fn plugin_id_of_kind(kind: &str) -> Option<&str> {
    kind.strip_prefix(EXTERNAL_KIND_PREFIX)
}

fn rest_of<'a>(document: &'a Document, plugin_id: &str) -> Option<&'a Value> {
    document.extra.get(REST)?.get(plugin_id)
}

/// 인스턴스가 있는 플러그인 - 정렬
pub(crate) fn plugin_bucket_ids(document: &Document) -> Vec<String> {
    let mut ids = BTreeSet::new();
    for scene in document.scenes.values() {
        walk(&scene.nodes, &mut |node, _| {
            if let Node::Element(element) = node {
                if let Some(plugin_id) = plugin_id_of_kind(&element.kind) {
                    ids.insert(plugin_id.to_string());
                }
            }
        });
    }
    if let Some(rest) = document.extra.get(REST).and_then(Value::as_object) {
        ids.extend(rest.keys().cloned());
    }
    ids.into_iter().collect()
}

/// 문서를 다시 만들 때 - 이전 문서의 플러그인 버킷을 새 문서에 옮겨 싣는다
pub(crate) fn carry_plugin_buckets(previous: &Document, next: &mut Document) {
    for plugin_id in plugin_bucket_ids(previous) {
        apply_plugin_bucket(
            next,
            &plugin_id,
            project_plugin_bucket(previous, &plugin_id).as_ref(),
        );
    }
}

/// 트리 → 인스턴스 목록 (없으면 None)
pub(crate) fn project_plugin_bucket(document: &Document, plugin_id: &str) -> Option<Value> {
    let rest = rest_of(document, plugin_id);
    // 배열이 아니던 버킷 - 원본 그대로
    if let Some(raw) = rest.and_then(|rest| rest.get("raw")) {
        return Some(raw.clone());
    }
    let kind = plugin_kind(plugin_id);
    let mut entries: Vec<(u64, Value)> = Vec::new();
    for (scene_id, scene) in &document.scenes {
        walk(&scene.nodes, &mut |node, _| {
            let Node::Element(element) = node else {
                return;
            };
            if element.kind != kind {
                return;
            }
            let Some(legacy) = element.extra.get(LEGACY) else {
                return;
            };
            let entry = &legacy[ENTRY];
            // 원본 항목과 자리가 맞는 요소만 - 복제·옮겨 붙이기로 생긴 사본은 무시한다
            let instance_id = entry.get("instanceId").and_then(Value::as_str);
            let tab = normalize_plugin_instance_tab_id(entry.get("tabId").and_then(Value::as_str));
            if instance_id
                .map(|id| plugin_element_id(plugin_id, id))
                .as_deref()
                != Some(element.id.as_str())
                || tab != scene_id
            {
                return;
            }
            entries.push((legacy[ORDER].as_u64().unwrap_or(u64::MAX), entry.clone()));
        });
    }
    for item in rest.and_then(Value::as_array).into_iter().flatten() {
        entries.push((
            item[ORDER].as_u64().unwrap_or(u64::MAX),
            item["entry"].clone(),
        ));
    }
    if entries.is_empty() {
        return None;
    }
    entries.sort_by_key(|(order, _)| *order);
    Some(Value::Array(
        entries.into_iter().map(|(_, entry)| entry).collect(),
    ))
}

fn number(value: &Value, field: &str) -> Option<f64> {
    value
        .get(field)?
        .as_f64()
        .filter(|number| number.is_finite())
}

// 장면에 둘 수 있는 항목 - (탭, 요소)
fn placeable(
    plugin_id: &str,
    kind: &str,
    entry: &Value,
    order: usize,
) -> Option<(String, Element)> {
    let instance_id = entry
        .get("instanceId")?
        .as_str()
        .filter(|id| !id.is_empty())?;
    let position = entry.get("position")?;
    let (x, y) = (number(position, "x")?, number(position, "y")?);
    let (width, height) = entry
        .get("measuredSize")
        .and_then(|size| Some((number(size, "width")?, number(size, "height")?)))
        .unwrap_or(DEFAULT_SIZE);
    let tab = normalize_plugin_instance_tab_id(entry.get("tabId").and_then(Value::as_str));
    let values = entry
        .get("settings")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut extra = Map::new();
    extra.insert(LEGACY.into(), json!({ ENTRY: entry, ORDER: order }));
    Some((
        tab.to_string(),
        Element {
            id: plugin_element_id(plugin_id, instance_id),
            kind: kind.to_string(),
            frame: Frame {
                x,
                y,
                width,
                height,
                rotation: 0.0,
            },
            name: None,
            hidden: entry
                .get("hidden")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            class_name: None,
            use_inline_styles: None,
            bundles: Default::default(),
            values,
            input: None,
            extra,
        },
    ))
}

fn retain_elements(nodes: &mut Vec<Node>, keep: &mut dyn FnMut(&Element) -> bool) {
    nodes.retain(|node| match node {
        Node::Element(element) => keep(element),
        Node::Group(_) => true,
    });
    for node in nodes {
        if let Node::Group(group) = node {
            retain_elements(&mut group.children, keep);
        }
    }
}

/// 인스턴스 목록 → 트리. 남는 요소는 트리 자리를 지키고 새 요소는 장면 맨 위, 빠진 요소는 지운다
pub(crate) fn apply_plugin_bucket(document: &mut Document, plugin_id: &str, value: Option<&Value>) {
    let kind = plugin_kind(plugin_id);
    let mut wanted: HashMap<String, (String, Element)> = HashMap::new();
    let mut order_of_wanted: Vec<String> = Vec::new();
    let mut rest: Option<Value> = None;
    match value {
        None => {}
        Some(Value::Array(entries)) => {
            let mut kept_rest = Vec::new();
            let mut seen = HashSet::new();
            for (order, entry) in entries.iter().enumerate() {
                match placeable(plugin_id, &kind, entry, order) {
                    Some((tab, element))
                        if document.scenes.contains_key(&tab)
                            && seen.insert(element.id.clone()) =>
                    {
                        order_of_wanted.push(element.id.clone());
                        wanted.insert(element.id.clone(), (tab, element));
                    }
                    _ => kept_rest.push(json!({ ORDER: order, "entry": entry })),
                }
            }
            if !kept_rest.is_empty() {
                rest = Some(Value::Array(kept_rest));
            } else if entries.is_empty() {
                // 빈 배열 버킷 - 그대로 보존 (읽으면 [])
                rest = Some(json!({ "raw": [] }));
            }
        }
        Some(raw) => rest = Some(json!({ "raw": raw })),
    }

    for (scene_id, scene) in document.scenes.iter_mut() {
        retain_elements(&mut scene.nodes, &mut |element| {
            element.kind != kind
                || wanted
                    .get(&element.id)
                    .is_some_and(|(tab, _)| tab == scene_id)
        });
    }
    for id in order_of_wanted {
        let (tab, element) = wanted.remove(&id).expect("wanted");
        let scene = document.scenes.get_mut(&tab).expect("scene checked");
        match scene.element_mut(&element.id) {
            Some(existing) => *existing = element,
            None => scene.nodes.push(Node::Element(element)),
        }
    }

    let rest_map = document
        .extra
        .entry(REST)
        .or_insert_with(|| Value::Object(Map::new()));
    if let Some(map) = rest_map.as_object_mut() {
        match rest {
            Some(rest) => {
                map.insert(plugin_id.to_string(), rest);
            }
            None => {
                map.remove(plugin_id);
            }
        }
        if map.is_empty() {
            document.extra.remove(REST);
        }
    }
}

#[cfg(test)]
mod tests;
