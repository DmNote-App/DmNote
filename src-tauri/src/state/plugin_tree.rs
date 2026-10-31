//! 플러그인 인스턴스 버킷 ↔ 트리 장면.
//! 인스턴스 목록(저장 모양 배열)의 항목을 탭 장면의 플러그인 종류 요소로 두고, 읽을 때 같은 배열을 돌려준다.
//! 목록 순서·겹침 순서·그룹 소속·측정 크기 유무는 요소에 둔 원본 항목이 정한다. 트리 자리는 항목의 zIndex·groupId로
//! 정하고, 트리 연산이 노드를 옮기면 그 자리에 맞게 항목 값을 다시 적는다.
//! 해석 못 한 항목·없는 탭·플러그인 안에서 겹친 id는 장면 밖 칸에 원본으로 보존한다

use std::collections::{BTreeSet, HashMap, HashSet};

use element_document::document::walk;
use element_document::schema::EXTERNAL_KIND_PREFIX;
use element_document::{Document, Element, Frame, Node};
use serde_json::{json, Map, Value};

use super::plugin::normalize_plugin_instance_tab_id;
use crate::models::legacy_layout::is_legacy_kind;

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

// 항목이 정하는 트리 자리 - (zIndex, groupId)
fn placement_of(element: &Element) -> (Option<f64>, Option<String>) {
    let entry = element.extra.get(LEGACY).map(|legacy| &legacy[ENTRY]);
    (
        entry.and_then(|entry| number(entry, "zIndex")),
        entry
            .and_then(|entry| entry.get("groupId"))
            .and_then(Value::as_str)
            .map(str::to_string),
    )
}

// 형제 사이 겹침 순서 비교 값 - 옛 종류는 저장된 zIndex, 플러그인은 항목 zIndex, 그룹은 안쪽 가장 큰 값
fn z_of(node: &Node) -> Option<f64> {
    match node {
        Node::Group(group) => group
            .children
            .iter()
            .filter_map(z_of)
            .fold(None, |max: Option<f64>, z| {
                Some(max.map_or(z, |max| max.max(z)))
            }),
        Node::Element(element) if plugin_id_of_kind(&element.kind).is_some() => {
            placement_of(element).0
        }
        Node::Element(element) if is_legacy_kind(&element.kind) => {
            let legacy = element.extra.get(LEGACY)?;
            number(legacy, "zIndex").or_else(|| number(legacy, "index"))
        }
        Node::Element(_) => None,
    }
}

// 새로 두는 노드 - groupId 그룹(없으면 장면 맨 위 단계)에서 zIndex가 더 큰 첫 형제 아래, zIndex가 없으면 맨 위
fn place(scene: &mut element_document::Scene, element: Element) {
    let (z, group) = placement_of(&element);
    let parent = group.filter(|group| {
        scene
            .find_path(group)
            .and_then(|path| scene.node_at(&path))
            .is_some_and(|node| matches!(node, Node::Group(_)))
    });
    let siblings = scene
        .children_mut(parent.as_deref())
        .expect("parent checked");
    let at = z
        .and_then(|z| {
            siblings
                .iter()
                .position(|sibling| z_of(sibling).is_some_and(|other| other > z))
        })
        .unwrap_or(siblings.len());
    siblings.insert(at, Node::Element(element));
}

// 한 형제 목록 - 플러그인 노드마다 놓기(`place`)가 같은 자리를 다시 고르는 zIndex·groupId를 항목에 적는다.
// 앞 형제의 가장 큰 값 이상이고 바로 다음 값 있는 형제보다 작으면 그대로, 아니면 앞 형제의 가장 큰 값
// (정수 - 저장 검증이 정수만 받는다). zIndex 없는 항목은 다음 값 있는 형제가 없으면(맨 위) 그대로
fn sync_siblings(nodes: &mut [Node], parent: Option<&str>, changed: &mut BTreeSet<String>) {
    let mut lower: Option<f64> = None;
    for index in 0..nodes.len() {
        if let Node::Group(group) = &mut nodes[index] {
            let id = group.id.clone();
            sync_siblings(&mut group.children, Some(&id), changed);
        }
        let z = z_of(&nodes[index]);
        let upper = nodes[index + 1..].iter().find_map(z_of);
        if let Node::Element(element) = &mut nodes[index] {
            if let Some(plugin_id) = plugin_id_of_kind(&element.kind).map(str::to_string) {
                let (frame, hidden, values) =
                    (element.frame, element.hidden, element.values.clone());
                let fits = match z {
                    Some(z) => {
                        lower.is_none_or(|lower| z >= lower) && upper.is_none_or(|upper| z < upper)
                    }
                    None => upper.is_none(),
                };
                let next_z = if fits {
                    z
                } else {
                    Some(match (lower, upper) {
                        (Some(lower), Some(upper)) if upper > lower => lower,
                        (Some(lower), _) => lower + 1.0,
                        (None, Some(upper)) => upper - 1.0,
                        (None, None) => 0.0,
                    })
                };
                if let Some(entry) = element
                    .extra
                    .get_mut(LEGACY)
                    .and_then(|legacy| legacy.get_mut(ENTRY))
                    .and_then(Value::as_object_mut)
                {
                    let mut touched = false;
                    if let Some(next_z) = next_z.filter(|_| z != next_z) {
                        entry.insert("zIndex".into(), json!(next_z as i64));
                        touched = true;
                    }
                    let current_group = entry.get("groupId").and_then(Value::as_str);
                    if current_group != parent {
                        match parent {
                            Some(group) => entry.insert("groupId".into(), json!(group)),
                            None => entry.remove("groupId"),
                        };
                        touched = true;
                    }
                    touched |= sync_entry_fields(entry, &frame, hidden, &values);
                    if touched {
                        changed.insert(plugin_id);
                    }
                }
            }
        }
        if let Some(z) = z_of(&nodes[index]) {
            lower = Some(lower.map_or(z, |lower| lower.max(z)));
        }
    }
}

// 노드의 틀·숨김·값 → 항목의 위치·측정 크기·숨김·설정 (`placeable`의 반대). 바뀐 칸만 적는다
fn sync_entry_fields(
    entry: &mut Map<String, Value>,
    frame: &Frame,
    hidden: bool,
    values: &Map<String, Value>,
) -> bool {
    let mut touched = false;
    if let Some(position) = entry.get_mut("position").and_then(Value::as_object_mut) {
        for (field, next) in [("x", frame.x), ("y", frame.y)] {
            if position.get(field).and_then(Value::as_f64) != Some(next) {
                position.insert(field.into(), json!(next));
                touched = true;
            }
        }
    }
    let size = entry
        .get("measuredSize")
        .and_then(|size| Some((number(size, "width")?, number(size, "height")?)))
        .unwrap_or(DEFAULT_SIZE);
    if size != (frame.width, frame.height) {
        entry.insert(
            "measuredSize".into(),
            json!({ "width": frame.width, "height": frame.height }),
        );
        touched = true;
    }
    if entry
        .get("hidden")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        != hidden
    {
        entry.insert("hidden".into(), json!(hidden));
        touched = true;
    }
    let settings = entry.get("settings").and_then(Value::as_object);
    if settings.map_or(!values.is_empty(), |settings| settings != values) {
        entry.insert("settings".into(), Value::Object(values.clone()));
        touched = true;
    }
    touched
}

/// 트리 연산 뒤 - 장면의 플러그인 노드 자리에 맞게 항목의 zIndex·groupId를 다시 적는다.
/// 틀·숨김·값을 고쳤으면 위치·측정 크기·숨김·설정도 다시 적는다.
/// 플러그인 노드를 품은 그룹은 옛 그룹이므로 groupId는 부모 그룹이다. 옛 종류 번호는 다시 매기지 않는다.
/// 바뀐 플러그인 id를 돌려준다(정렬)
pub(crate) fn sync_plugin_entries_from_tree(
    document: &mut Document,
    scenes: &[String],
) -> Vec<String> {
    let mut changed = BTreeSet::new();
    for scene_id in scenes {
        if let Some(scene) = document.scenes.get_mut(scene_id) {
            sync_siblings(&mut scene.nodes, None, &mut changed);
        }
    }
    changed.into_iter().collect()
}

/// 두 문서 사이에 인스턴스 목록이 달라진 플러그인 - 정렬
pub(crate) fn changed_plugin_buckets(before: &Document, after: &Document) -> Vec<String> {
    let mut ids: BTreeSet<String> = plugin_bucket_ids(before).into_iter().collect();
    ids.extend(plugin_bucket_ids(after));
    ids.into_iter()
        .filter(|id| project_plugin_bucket(before, id) != project_plugin_bucket(after, id))
        .collect()
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

    // 자리가 그대로인 노드(같은 장면, zIndex·groupId 그대로)는 제자리에서 고치고, 나머지는 빼고 다시 둔다
    for (scene_id, scene) in document.scenes.iter_mut() {
        retain_elements(&mut scene.nodes, &mut |element| {
            element.kind != kind
                || wanted.get(&element.id).is_some_and(|(tab, next)| {
                    tab == scene_id && placement_of(element) == placement_of(next)
                })
        });
    }
    for id in order_of_wanted {
        let (tab, element) = wanted.remove(&id).expect("wanted");
        let scene = document.scenes.get_mut(&tab).expect("scene checked");
        match scene.element_mut(&element.id) {
            Some(existing) => *existing = element,
            None => place(scene, element),
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
