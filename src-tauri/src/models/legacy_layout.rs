//! 지금 저장 모양(종류별 배열 + 키 매핑 + 평평한 그룹)과 요소 트리 문서 사이 변환
//!
//! - 가져오기: 겹치는 순서(zIndex, 없으면 배열 순번)대로 놓고, 흩어진 그룹 멤버는
//!   가장 위 멤버 자리로 모은다
//! - 내보내기: 원래 배열 순번과 zIndex를 지켜 옛 모양을 다시 만든다. 트리 순서가
//!   바뀌었으면 그 장면의 zIndex를 순서대로 다시 매긴다
//! - 맞추기: 옛 모양으로 들어온 쓰기를 트리에 반영하면서 트리에만 있는 정보
//!   (새 종류 요소, 중첩 그룹, 그룹 숨김)를 지킨다
//!
//! 옛 데이터 API(플러그인 getPositions·editor.get 등)는 이 내보내기 결과를 그대로 쓴다.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::sync::OnceLock;

use anyhow::{Context, Result};
use element_document::bundles::BuiltinBundles;
use element_document::document::walk;
use element_document::{Document, Element, Frame, Group, InputBinding, Node, Scene};
use serde_json::{json, Map, Value};

use super::{
    builtin_kind_registry, EditorDocumentV1, EditorElementTypeV1, GraphPosition, KeyPosition,
    KeySlot, KnobPosition, LayerGroupDef, ReactiveSpritePosition, StatPosition,
};

// 요소에 남겨 두는 옛 모양 정보
const LEGACY: &str = "legacy";
// 장면에 남겨 두는 "옛 모양에 있던 컬렉션" 목록 (없음과 빈 배열을 구분)
const LEGACY_PRESENT: &str = "legacyPresent";
const KEYS_FIELD: &str = "keys";
const LAYER_GROUPS_FIELD: &str = "layerGroups";

// 트리 공통 정보로 옮기는 옛 칸
const COMMON_FIELDS: [&str; 12] = [
    "id",
    "dx",
    "dy",
    "width",
    "height",
    "rotation",
    "hidden",
    "layerName",
    "className",
    "useInlineStyles",
    "zIndex",
    "groupId",
];

fn kind_name(kind: EditorElementTypeV1) -> &'static str {
    match kind {
        EditorElementTypeV1::Key => "key",
        EditorElementTypeV1::Stat => "stat",
        EditorElementTypeV1::Graph => "graph",
        EditorElementTypeV1::Knob => "knob",
        EditorElementTypeV1::Sprite => "sprite",
    }
}

fn kind_of(name: &str) -> Option<EditorElementTypeV1> {
    EditorElementTypeV1::ALL
        .into_iter()
        .find(|kind| kind_name(*kind) == name)
}

/// 옛 모양으로 관리하는 종류인지 - 아니면 트리에만 있는 종류
/// 트리에만 있는 그룹 - 옛 그룹 표시가 없고 안이 모두 트리 전용(옛 모양에는 나타나지 않는다)
pub(crate) fn is_tree_only_group(group: &Group) -> bool {
    if group.extra.contains_key(LEGACY) {
        return false;
    }
    let mut tree_only = true;
    walk(&group.children, &mut |node, _| match node {
        Node::Element(element) => tree_only &= !is_legacy_kind(&element.kind),
        Node::Group(inner) => tree_only &= !inner.extra.contains_key(LEGACY),
    });
    tree_only
}

pub(crate) fn is_legacy_kind(name: &str) -> bool {
    kind_of(name).is_some()
}

/// 옛 모양 읽기 - store나 편집 문서를 복사하지 않고 빌려 읽는다
#[derive(Clone, Copy)]
pub(crate) struct LegacyRef<'a> {
    pub keys: &'a super::KeyMappings,
    pub key_positions: &'a super::KeyPositions,
    pub stat_positions: &'a super::StatPositions,
    pub graph_positions: &'a super::GraphPositions,
    pub knob_positions: &'a super::KnobPositions,
    pub sprite_positions: &'a super::SpritePositions,
    pub layer_groups: &'a super::LayerGroups,
}

impl<'a> From<&'a EditorDocumentV1> for LegacyRef<'a> {
    fn from(document: &'a EditorDocumentV1) -> Self {
        Self {
            keys: &document.keys,
            key_positions: &document.key_positions,
            stat_positions: &document.stat_positions,
            graph_positions: &document.graph_positions,
            knob_positions: &document.knob_positions,
            sprite_positions: &document.sprite_positions,
            layer_groups: &document.layer_groups,
        }
    }
}

impl<'a> From<&'a super::AppStoreData> for LegacyRef<'a> {
    fn from(store: &'a super::AppStoreData) -> Self {
        Self {
            keys: &store.keys,
            key_positions: &store.key_positions,
            stat_positions: &store.stat_positions,
            graph_positions: &store.graph_positions,
            knob_positions: &store.knob_positions,
            sprite_positions: &store.sprite_positions,
            layer_groups: &store.layer_groups,
        }
    }
}

// 종류별 배열 길이, (id, zIndex, groupId), 그룹 목록, 키 매핑 유무
type ModeStructure<'a> = (
    Vec<(usize, Option<usize>)>,
    Vec<(String, Option<i32>, Option<String>)>,
    Option<&'a Vec<LayerGroupDef>>,
    bool,
);

/// 탭 하나의 종류별 배열
#[derive(Clone, Copy, PartialEq)]
struct ModeView<'a> {
    keys: Option<&'a Vec<KeySlot>>,
    key: Option<&'a Vec<KeyPosition>>,
    stat: Option<&'a Vec<super::StatPosition>>,
    graph: Option<&'a Vec<super::GraphPosition>>,
    knob: Option<&'a Vec<super::KnobPosition>>,
    sprite: Option<&'a Vec<ReactiveSpritePosition>>,
    groups: Option<&'a Vec<LayerGroupDef>>,
}

impl<'a> ModeView<'a> {
    fn of(legacy: LegacyRef<'a>, mode: &str) -> Self {
        Self {
            keys: legacy.keys.get(mode),
            key: legacy.key_positions.get(mode),
            stat: legacy.stat_positions.get(mode),
            graph: legacy.graph_positions.get(mode),
            knob: legacy.knob_positions.get(mode),
            sprite: legacy.sprite_positions.get(mode),
            groups: legacy.layer_groups.get(mode),
        }
    }

    fn len(&self, kind: EditorElementTypeV1) -> Option<usize> {
        match kind {
            EditorElementTypeV1::Key => self.key.map(Vec::len),
            EditorElementTypeV1::Stat => self.stat.map(Vec::len),
            EditorElementTypeV1::Graph => self.graph.map(Vec::len),
            EditorElementTypeV1::Knob => self.knob.map(Vec::len),
            EditorElementTypeV1::Sprite => self.sprite.map(Vec::len),
        }
    }

    fn value(&self, kind: EditorElementTypeV1, index: usize) -> Result<Option<Value>> {
        Ok(match kind {
            EditorElementTypeV1::Key => self
                .key
                .and_then(|list| list.get(index))
                .map(serde_json::to_value),
            EditorElementTypeV1::Stat => self
                .stat
                .and_then(|list| list.get(index))
                .map(serde_json::to_value),
            EditorElementTypeV1::Graph => self
                .graph
                .and_then(|list| list.get(index))
                .map(serde_json::to_value),
            EditorElementTypeV1::Knob => self
                .knob
                .and_then(|list| list.get(index))
                .map(serde_json::to_value),
            EditorElementTypeV1::Sprite => self
                .sprite
                .and_then(|list| list.get(index))
                .map(serde_json::to_value),
        }
        .transpose()?)
    }

    fn slot(&self, kind: EditorElementTypeV1, index: usize) -> Option<&'a KeySlot> {
        match kind {
            EditorElementTypeV1::Key => self.keys.and_then(|slots| slots.get(index)),
            _ => None,
        }
    }

    // 요소 하나가 같은지 (키는 매핑 슬롯까지)
    fn same_element(&self, other: &Self, kind: EditorElementTypeV1, index: usize) -> bool {
        let same = match kind {
            EditorElementTypeV1::Key => {
                self.key.and_then(|l| l.get(index)) == other.key.and_then(|l| l.get(index))
            }
            EditorElementTypeV1::Stat => {
                self.stat.and_then(|l| l.get(index)) == other.stat.and_then(|l| l.get(index))
            }
            EditorElementTypeV1::Graph => {
                self.graph.and_then(|l| l.get(index)) == other.graph.and_then(|l| l.get(index))
            }
            EditorElementTypeV1::Knob => {
                self.knob.and_then(|l| l.get(index)) == other.knob.and_then(|l| l.get(index))
            }
            EditorElementTypeV1::Sprite => {
                self.sprite.and_then(|l| l.get(index)) == other.sprite.and_then(|l| l.get(index))
            }
        };
        same && self.slot(kind, index) == other.slot(kind, index)
    }

    // 구조 - 종류별 (id, zIndex, groupId)와 컬렉션 유무, 그룹 목록
    fn structure(&self) -> ModeStructure<'a> {
        let mut lengths = Vec::new();
        let mut signature = Vec::new();
        let mut push = |id: &str, z: Option<i32>, group: &Option<String>| {
            signature.push((id.to_string(), z, group.clone()));
        };
        for (order, kind) in EditorElementTypeV1::ALL.into_iter().enumerate() {
            lengths.push((order, self.len(kind)));
        }
        for position in self.key.into_iter().flatten() {
            push(&position.id, position.z_index, &position.group_id);
        }
        for position in self.stat.into_iter().flatten() {
            push(
                &position.position.id,
                position.position.z_index,
                &position.position.group_id,
            );
        }
        for position in self.graph.into_iter().flatten() {
            push(
                &position.position.id,
                position.position.z_index,
                &position.position.group_id,
            );
        }
        for position in self.knob.into_iter().flatten() {
            push(
                &position.position.id,
                position.position.z_index,
                &position.position.group_id,
            );
        }
        for position in self.sprite.into_iter().flatten() {
            push(&position.id, position.z_index, &position.group_id);
        }
        (lengths, signature, self.groups, self.keys.is_some())
    }
}

fn set_collection(
    document: &mut EditorDocumentV1,
    kind: EditorElementTypeV1,
    value: Value,
) -> Result<()> {
    match kind {
        EditorElementTypeV1::Key => document.key_positions = serde_json::from_value(value)?,
        EditorElementTypeV1::Stat => document.stat_positions = serde_json::from_value(value)?,
        EditorElementTypeV1::Graph => document.graph_positions = serde_json::from_value(value)?,
        EditorElementTypeV1::Knob => document.knob_positions = serde_json::from_value(value)?,
        EditorElementTypeV1::Sprite => document.sprite_positions = serde_json::from_value(value)?,
    }
    Ok(())
}

// 종류별 기본 옛 모양 - 남는 칸이 기본값과 같으면 따로 보존하지 않는다
fn default_legacy_object(kind: EditorElementTypeV1) -> Map<String, Value> {
    let value = match kind {
        EditorElementTypeV1::Sprite => serde_json::to_value(ReactiveSpritePosition::default()),
        _ => serde_json::to_value(KeyPosition::default()),
    }
    .expect("기본 위치 직렬화");
    match value {
        Value::Object(object) => object,
        _ => unreachable!("위치는 객체"),
    }
}

// 옛 위치 객체 하나를 그 종류의 옛 모양으로 읽을 수 있는지
fn accepts_legacy_object(kind: EditorElementTypeV1, object: Map<String, Value>) -> bool {
    let value = Value::Object(object);
    match kind {
        EditorElementTypeV1::Key => serde_json::from_value::<KeyPosition>(value).is_ok(),
        EditorElementTypeV1::Stat => serde_json::from_value::<StatPosition>(value).is_ok(),
        EditorElementTypeV1::Graph => serde_json::from_value::<GraphPosition>(value).is_ok(),
        EditorElementTypeV1::Knob => serde_json::from_value::<KnobPosition>(value).is_ok(),
        EditorElementTypeV1::Sprite => {
            serde_json::from_value::<ReactiveSpritePosition>(value).is_ok()
        }
    }
}

// 옛 모양이 null을 받지 않는 칸 (값 타입 칸) - 실제로 null을 넣어 읽어 보고 정한다.
// 저장 트리에 빠져 있으면(종류 정의 변경 등) 요소 전체를 못 읽지 않게 기본값을 쓴다
fn non_nullable_fields(kind: EditorElementTypeV1) -> &'static HashSet<String> {
    static FIELDS: OnceLock<HashMap<EditorElementTypeV1, HashSet<String>>> = OnceLock::new();
    &FIELDS.get_or_init(|| {
        EditorElementTypeV1::ALL
            .iter()
            .map(|&kind| {
                // 기본 객체 + 종류 고유 값 기본값 (통계 종류처럼 기본값 없는 필수 칸이 있다)
                let mut base = default_legacy_object(kind);
                let schema = serde_json::to_value(kind)
                    .ok()
                    .and_then(|name| builtin_kind_registry().get(name.as_str()?));
                for rule in schema
                    .map(|schema| schema.fields.as_slice())
                    .unwrap_or_default()
                {
                    if !rule.default.is_null() {
                        base.insert(rule.name.clone(), rule.default.clone());
                    }
                }
                let mut names: BTreeSet<String> = base.keys().cloned().collect();
                if let Some(schema) = schema {
                    names.extend(schema.fields.iter().map(|rule| rule.name.clone()));
                    for bundle in &schema.bundles {
                        names.extend(
                            BuiltinBundles::fields(bundle)
                                .unwrap_or_default()
                                .iter()
                                .map(|rule| rule.name.clone()),
                        );
                    }
                }
                let fields = if accepts_legacy_object(kind, base.clone()) {
                    names
                        .into_iter()
                        .filter(|name| {
                            let mut object = base.clone();
                            object.insert(name.clone(), Value::Null);
                            !accepts_legacy_object(kind, object)
                        })
                        .collect()
                } else {
                    HashSet::new()
                };
                (kind, fields)
            })
            .collect()
    })[&kind]
}

fn number(object: &Map<String, Value>, name: &str) -> f64 {
    object.get(name).and_then(Value::as_f64).unwrap_or(0.0)
}

// 겹치는 순서 비교 기준 - (zIndex 없으면 배열 순번, 종류 순서, 배열 순번)
fn stacking_key(
    z_index: Option<i64>,
    kind: EditorElementTypeV1,
    index: usize,
) -> (i64, usize, usize) {
    let kind_order = EditorElementTypeV1::ALL
        .iter()
        .position(|other| *other == kind)
        .expect("내장 종류");
    (z_index.unwrap_or(index as i64), kind_order, index)
}

struct LegacyEntry {
    kind: EditorElementTypeV1,
    index: usize,
    z_index: Option<i64>,
    group_id: Option<String>,
    element: Element,
}

fn element_from_legacy(
    kind: EditorElementTypeV1,
    mut object: Map<String, Value>,
    index: usize,
    slot: Option<&KeySlot>,
) -> Result<LegacyEntry> {
    let schema = builtin_kind_registry()
        .get(kind_name(kind))
        .context("내장 종류 정의 없음")?;
    let id = object
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let frame = Frame {
        x: number(&object, "dx"),
        y: number(&object, "dy"),
        width: number(&object, "width"),
        height: number(&object, "height"),
        rotation: number(&object, "rotation"),
    };
    let name = object
        .get("layerName")
        .and_then(Value::as_str)
        .map(str::to_string);
    let hidden = object
        .get("hidden")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let class_name = object
        .get("className")
        .and_then(Value::as_str)
        .map(str::to_string);
    let use_inline_styles = object.get("useInlineStyles").and_then(Value::as_bool);
    let z_index = object.get("zIndex").and_then(Value::as_i64);
    let group_id = object
        .get("groupId")
        .and_then(Value::as_str)
        .map(str::to_string);
    for field in COMMON_FIELDS {
        object.remove(field);
    }

    // 빈(null) 칸은 싣지 않는다 - 옛 칸은 Option이라 빈 칸과 null이 같고, 저장 모양과 같아진다
    let mut values = Map::new();
    for rule in &schema.fields {
        if let Some(value) = object.remove(&rule.name).filter(|value| !value.is_null()) {
            values.insert(rule.name.clone(), value);
        }
    }
    let mut bundles = BTreeMap::new();
    for bundle in &schema.bundles {
        let Some(fields) = BuiltinBundles::fields(bundle) else {
            continue;
        };
        let mut part = Map::new();
        for rule in fields {
            if let Some(value) = object.remove(&rule.name).filter(|value| !value.is_null()) {
                part.insert(rule.name.clone(), value);
            }
        }
        bundles.insert(bundle.clone(), Value::Object(part));
    }
    let input = match kind {
        EditorElementTypeV1::Key => Some(InputBinding::Key {
            slot: serde_json::to_value(slot.cloned().unwrap_or_default())?,
        }),
        EditorElementTypeV1::Knob => object
            .remove("axisId")
            .and_then(|axis| axis.as_str().map(str::to_string))
            .filter(|axis| !axis.is_empty())
            .map(|axis_id| InputBinding::Axis { axis_id }),
        _ => None,
    };

    // 남은 칸은 기본값과 다를 때만 보존. 직렬화에서 빠진 칸(None)은 null로 적는다
    let mut defaults = default_legacy_object(kind);
    for field in COMMON_FIELDS.iter().chain(["axisId"].iter()) {
        defaults.remove(*field);
    }
    for rule in &schema.fields {
        defaults.remove(&rule.name);
    }
    for bundle in &schema.bundles {
        for rule in BuiltinBundles::fields(bundle).unwrap_or_default() {
            defaults.remove(&rule.name);
        }
    }
    let mut leftovers = Map::new();
    for (name, default) in &defaults {
        let value = object.get(name).cloned().unwrap_or(Value::Null);
        if &value != default {
            leftovers.insert(name.clone(), value);
        }
    }
    for (name, value) in object {
        if !defaults.contains_key(&name) {
            leftovers.insert(name, value);
        }
    }
    let mut legacy = Map::new();
    legacy.insert("index".into(), json!(index));
    if let Some(z_index) = z_index {
        legacy.insert("zIndex".into(), json!(z_index));
    }
    if !leftovers.is_empty() {
        legacy.insert("fields".into(), Value::Object(leftovers));
    }
    let mut extra = Map::new();
    extra.insert(LEGACY.into(), Value::Object(legacy));

    Ok(LegacyEntry {
        kind,
        index,
        z_index,
        group_id,
        element: Element {
            id,
            kind: kind_name(kind).to_string(),
            frame,
            name,
            hidden,
            class_name,
            use_inline_styles,
            bundles,
            values,
            input,
            extra,
        },
    })
}

fn scene_entries(view: &ModeView<'_>) -> Result<Vec<LegacyEntry>> {
    let mut entries = Vec::new();
    for kind in EditorElementTypeV1::ALL {
        for index in 0..view.len(kind).unwrap_or(0) {
            let Some(Value::Object(object)) = view.value(kind, index)? else {
                continue;
            };
            entries.push(element_from_legacy(
                kind,
                object,
                index,
                view.slot(kind, index),
            )?);
        }
    }
    entries.sort_by_key(|entry| stacking_key(entry.z_index, entry.kind, entry.index));
    Ok(entries)
}

fn legacy_modes(document: LegacyRef<'_>) -> BTreeSet<String> {
    let mut modes: BTreeSet<String> = document.keys.keys().cloned().collect();
    modes.extend(document.key_positions.keys().cloned());
    modes.extend(document.stat_positions.keys().cloned());
    modes.extend(document.graph_positions.keys().cloned());
    modes.extend(document.knob_positions.keys().cloned());
    modes.extend(document.sprite_positions.keys().cloned());
    modes.extend(document.layer_groups.keys().cloned());
    modes
}

fn present_fields(document: LegacyRef<'_>, mode: &str) -> Vec<Value> {
    let mut present = Vec::new();
    if document.keys.contains_key(mode) {
        present.push(json!(KEYS_FIELD));
    }
    for kind in EditorElementTypeV1::ALL {
        let has = match kind {
            EditorElementTypeV1::Key => document.key_positions.contains_key(mode),
            EditorElementTypeV1::Stat => document.stat_positions.contains_key(mode),
            EditorElementTypeV1::Graph => document.graph_positions.contains_key(mode),
            EditorElementTypeV1::Knob => document.knob_positions.contains_key(mode),
            EditorElementTypeV1::Sprite => document.sprite_positions.contains_key(mode),
        };
        if has {
            present.push(json!(kind.store_key()));
        }
    }
    if document.layer_groups.contains_key(mode) {
        present.push(json!(LAYER_GROUPS_FIELD));
    }
    present
}

fn group_node(definition: &LayerGroupDef, index: usize) -> Group {
    let mut extra = Map::new();
    extra.insert(LEGACY.into(), json!({ "index": index }));
    Group {
        id: definition.id.clone(),
        name: definition.name.clone(),
        hidden: false,
        children: Vec::new(),
        extra,
    }
}

// 겹치는 순서로 정렬된 요소에서 장면 트리를 만든다. 그룹은 가장 위 멤버 자리에 생긴다
fn build_scene(entries: Vec<LegacyEntry>, groups: &[LayerGroupDef], present: Vec<Value>) -> Scene {
    let group_index: HashMap<&str, usize> = groups
        .iter()
        .enumerate()
        .map(|(index, group)| (group.id.as_str(), index))
        .collect();
    // 위에서 아래로 쌓은 뒤 뒤집는다
    let mut top_down: Vec<Node> = Vec::new();
    let mut open: HashMap<String, usize> = HashMap::new();
    for mut entry in entries.into_iter().rev() {
        let group = entry
            .group_id
            .as_deref()
            .and_then(|id| group_index.get(id).map(|index| (id, *index)));
        match group {
            Some((id, index)) => {
                let slot = *open.entry(id.to_string()).or_insert_with(|| {
                    top_down.push(Node::Group(group_node(&groups[index], index)));
                    top_down.len() - 1
                });
                if let Node::Group(group) = &mut top_down[slot] {
                    group.children.push(Node::Element(entry.element));
                }
            }
            None => {
                // 없는 그룹을 가리키는 groupId는 그대로 보존해 되돌려 쓴다
                if let Some(dangling) = entry.group_id.take() {
                    let legacy = entry
                        .element
                        .extra
                        .entry(LEGACY)
                        .or_insert_with(|| json!({}));
                    legacy["danglingGroupId"] = json!(dangling);
                }
                top_down.push(Node::Element(entry.element));
            }
        }
    }
    // 멤버 없는 그룹(플러그인 요소만 든 그룹 등)은 맨 위에 둔다
    for (index, group) in groups.iter().enumerate() {
        if !open.contains_key(&group.id) {
            top_down.insert(0, Node::Group(group_node(group, index)));
        }
    }
    top_down.reverse();
    for node in &mut top_down {
        if let Node::Group(group) = node {
            group.children.reverse();
        }
    }
    let mut extra = Map::new();
    extra.insert(LEGACY_PRESENT.into(), Value::Array(present));
    Scene {
        nodes: top_down,
        extra,
    }
}

/// 두 옛 모양 사이 내용이 다른 탭 - 탭 추가·삭제 포함
pub(crate) fn changed_modes(left: LegacyRef<'_>, right: LegacyRef<'_>) -> Vec<String> {
    let mut modes = legacy_modes(left);
    modes.extend(legacy_modes(right));
    modes
        .into_iter()
        .filter(|mode| ModeView::of(left, mode) != ModeView::of(right, mode))
        .collect()
}

fn import_scene(legacy: LegacyRef<'_>, mode: &str) -> Result<Scene> {
    let view = ModeView::of(legacy, mode);
    let entries = scene_entries(&view)?;
    let groups = view.groups.cloned().unwrap_or_default();
    Ok(build_scene(entries, &groups, present_fields(legacy, mode)))
}

/// 옛 모양 전체를 새 트리 문서로 가져온다
pub(crate) fn import_document<'a>(legacy: impl Into<LegacyRef<'a>>) -> Result<Document> {
    let legacy = legacy.into();
    let mut document = Document::default();
    for schema in builtin_kind_registry().kinds() {
        document
            .kind_versions
            .insert(schema.kind.clone(), schema.version);
    }
    for mode in legacy_modes(legacy) {
        let scene = import_scene(legacy, &mode)?;
        document.scenes.insert(mode, scene);
    }
    Ok(document)
}

fn legacy_info(element: &Element) -> Option<&Map<String, Value>> {
    element.extra.get(LEGACY).and_then(Value::as_object)
}

struct ProjectedElement<'a> {
    element: &'a Element,
    kind: EditorElementTypeV1,
    // 트리에서의 겹치는 순서 (아래가 0)
    order: usize,
    group_id: Option<String>,
}

fn projected_object(entry: &ProjectedElement<'_>, z_index: Option<i64>) -> Map<String, Value> {
    let element = entry.element;
    let mut object = default_legacy_object(entry.kind);
    let legacy = legacy_info(element);
    if let Some(fields) = legacy
        .and_then(|legacy| legacy.get("fields"))
        .and_then(Value::as_object)
    {
        for (name, value) in fields {
            object.insert(name.clone(), value.clone());
        }
    }
    // 묶음·고유 값 칸이 비어 있으면 없음(None)이다 - 기본값으로 되살리지 않는다.
    // 다만 옛 모양이 null을 못 받는 칸은 옛 칸·기본값(종류 고유 값은 정의 기본값)을 쓴다
    let schema = builtin_kind_registry().get(&element.kind);
    let required = non_nullable_fields(entry.kind);
    let mut put = |name: &str, value: Option<&Value>, fallback: Option<&Value>| match value {
        Some(value) if !value.is_null() => {
            object.insert(name.to_string(), value.clone());
        }
        _ if required.contains(name) => {
            let kept = object.get(name).is_some_and(|value| !value.is_null());
            if let Some(fallback) = fallback.filter(|value| !kept && !value.is_null()) {
                object.insert(name.to_string(), fallback.clone());
            }
        }
        _ => {
            object.insert(name.to_string(), Value::Null);
        }
    };
    for bundle in schema
        .map(|schema| schema.bundles.as_slice())
        .unwrap_or_default()
    {
        let part = element.bundles.get(bundle).and_then(Value::as_object);
        for rule in BuiltinBundles::fields(bundle).unwrap_or_default() {
            put(&rule.name, part.and_then(|part| part.get(&rule.name)), None);
        }
    }
    for rule in schema
        .map(|schema| schema.fields.as_slice())
        .unwrap_or_default()
    {
        put(
            &rule.name,
            element.values.get(&rule.name),
            Some(&rule.default),
        );
    }
    if let Some(InputBinding::Axis { axis_id }) = &element.input {
        object.insert("axisId".into(), json!(axis_id));
    }
    object.insert("id".into(), json!(element.id));
    object.insert("dx".into(), json!(element.frame.x));
    object.insert("dy".into(), json!(element.frame.y));
    object.insert("width".into(), json!(element.frame.width));
    object.insert("height".into(), json!(element.frame.height));
    object.insert("rotation".into(), json!(element.frame.rotation));
    object.insert("hidden".into(), json!(element.hidden));
    object.insert("layerName".into(), json!(element.name));
    object.insert("className".into(), json!(element.class_name));
    object.insert("useInlineStyles".into(), json!(element.use_inline_styles));
    object.insert("zIndex".into(), json!(z_index));
    let group_id = entry.group_id.clone().or_else(|| {
        legacy
            .and_then(|legacy| legacy.get("danglingGroupId"))
            .and_then(Value::as_str)
            .map(str::to_string)
    });
    object.insert("groupId".into(), json!(group_id));
    object
}

fn collect_projection(scene: &Scene) -> (Vec<ProjectedElement<'_>>, Vec<&Group>) {
    let mut elements = Vec::new();
    let mut groups = Vec::new();
    let mut ancestors: Vec<(usize, String)> = Vec::new();
    let mut order = 0;
    walk(&scene.nodes, &mut |node, path| {
        ancestors.retain(|(depth, _)| *depth < path.len());
        match node {
            Node::Group(group) => {
                // 트리 전용 그룹은 옛 모양(layerGroups)에 나타나지 않는다
                if !is_tree_only_group(group) {
                    groups.push(group);
                }
                ancestors.push((path.len(), group.id.clone()));
            }
            Node::Element(element) => {
                if let Some(kind) = kind_of(&element.kind) {
                    elements.push(ProjectedElement {
                        element,
                        kind,
                        order,
                        group_id: ancestors.last().map(|(_, id)| id.clone()),
                    });
                }
                order += 1;
            }
        }
    });
    (elements, groups)
}

fn stored_index(element: &Element) -> Option<usize> {
    legacy_info(element)
        .and_then(|legacy| legacy.get("index"))
        .and_then(Value::as_u64)
        .map(|index| index as usize)
}

fn stored_z_index(element: &Element) -> Option<i64> {
    legacy_info(element)
        .and_then(|legacy| legacy.get("zIndex"))
        .and_then(Value::as_i64)
}

/// 트리 전용 노드를 뺀다 - 옛 종류 요소와 옛 그룹만 남는다
pub(crate) fn strip_tree_only(nodes: &mut Vec<Node>) {
    nodes.retain(|node| match node {
        Node::Element(element) => is_legacy_kind(&element.kind),
        Node::Group(group) => !is_tree_only_group(group),
    });
    for node in nodes {
        if let Node::Group(group) = node {
            strip_tree_only(&mut group.children);
        }
    }
}

// 프리셋 안 옛 종류 요소 자리 표 - 불러올 때 id가 새로 매겨지므로 종류와 배열 순번으로 적는다
fn preset_slot(kind: &str, index: usize) -> String {
    format!("{kind}#{index}")
}

fn stub_element(id: String, kind: &str) -> Element {
    Element {
        id,
        kind: kind.to_string(),
        frame: Frame {
            x: 0.0,
            y: 0.0,
            width: 1.0,
            height: 1.0,
            rotation: 0.0,
        },
        name: None,
        hidden: false,
        class_name: None,
        use_inline_styles: None,
        bundles: Default::default(),
        values: Default::default(),
        input: None,
        extra: Map::new(),
    }
}

/// 프리셋에 싣는 장면 - 트리 전용 노드 + 옛 종류 요소 자리 표. 트리 전용 노드가 없으면 None
pub(crate) fn preset_scene(scene: &Scene) -> Option<Scene> {
    fn map(nodes: &[Node], has_tree_only: &mut bool) -> Vec<Node> {
        nodes
            .iter()
            .filter_map(|node| match node {
                Node::Group(group) if is_tree_only_group(group) => {
                    *has_tree_only = true;
                    Some(node.clone())
                }
                Node::Group(group) => Some(Node::Group(Group {
                    id: group.id.clone(),
                    name: group.name.clone(),
                    hidden: group.hidden,
                    children: map(&group.children, has_tree_only),
                    extra: group.extra.clone(),
                })),
                Node::Element(element) if is_legacy_kind(&element.kind) => stored_index(element)
                    .map(|index| {
                        Node::Element(stub_element(
                            preset_slot(&element.kind, index),
                            &element.kind,
                        ))
                    }),
                Node::Element(_) => {
                    *has_tree_only = true;
                    Some(node.clone())
                }
            })
            .collect()
    }
    let mut has_tree_only = false;
    let nodes = map(&scene.nodes, &mut has_tree_only);
    has_tree_only.then(|| Scene {
        nodes,
        extra: Map::new(),
    })
}

/// 프리셋 장면의 트리 전용 노드를 지금 장면에 끼운다 - 지금 장면의 트리 전용 노드는 바뀐다.
/// 자리 표는 지금 옛 종류 요소 id로, 트리 전용 노드는 새 id로 바꾼다(요소 참조도 함께)
pub(crate) fn graft_preset_scene(
    preset: &Scene,
    target: &mut Scene,
    next_id: &mut dyn FnMut() -> String,
) {
    let mut current: HashMap<String, String> = HashMap::new();
    walk(&target.nodes, &mut |node, _| {
        if let Node::Element(element) = node {
            if let (true, Some(index)) = (is_legacy_kind(&element.kind), stored_index(element)) {
                current.insert(preset_slot(&element.kind, index), element.id.clone());
            }
        }
    });
    let mut mapping: BTreeMap<String, String> = BTreeMap::new();
    fn rewrite(
        nodes: &mut Vec<Node>,
        current: &HashMap<String, String>,
        mapping: &mut BTreeMap<String, String>,
        next_id: &mut dyn FnMut() -> String,
        inside_tree_only: bool,
    ) {
        nodes.retain_mut(|node| match node {
            Node::Element(element) if !inside_tree_only && is_legacy_kind(&element.kind) => {
                match current.get(&element.id) {
                    Some(id) => {
                        element.id = id.clone();
                        true
                    }
                    None => false,
                }
            }
            Node::Element(element) => {
                let id = next_id();
                mapping.insert(std::mem::replace(&mut element.id, id.clone()), id);
                true
            }
            Node::Group(group) => {
                let tree_only = inside_tree_only || is_tree_only_group(group);
                if tree_only {
                    let id = next_id();
                    mapping.insert(std::mem::replace(&mut group.id, id.clone()), id);
                }
                rewrite(&mut group.children, current, mapping, next_id, tree_only);
                true
            }
        });
    }
    let mut resolved = preset.clone();
    rewrite(&mut resolved.nodes, &current, &mut mapping, next_id, false);
    element_document::ops::remap_references(builtin_kind_registry(), &mut resolved.nodes, &mapping);
    strip_tree_only(&mut target.nodes);
    graft_tree_only(&resolved, target);
}

// 장면의 옛 종류 요소 배열 순번 (종류별 원래 순번, 새 요소는 트리 순서대로 뒤에)
fn scene_positions<'a>(elements: &'a [ProjectedElement<'a>]) -> HashMap<&'a str, usize> {
    let mut by_kind: BTreeMap<EditorElementTypeV1, Vec<&ProjectedElement<'_>>> = BTreeMap::new();
    for entry in elements {
        by_kind.entry(entry.kind).or_default().push(entry);
    }
    let mut positions = HashMap::new();
    for list in by_kind.values_mut() {
        list.sort_by_key(|entry| {
            (
                stored_index(entry.element).unwrap_or(usize::MAX),
                entry.order,
            )
        });
        for (index, entry) in list.iter().enumerate() {
            positions.insert(entry.element.id.as_str(), index);
        }
    }
    positions
}

/// 트리 쓰기로 옮기거나 넣은 옛 종류 요소의 zIndex - (장면, 요소 id, 새 zIndex).
/// 옮기지 않은 요소는 지금 겹침 순서(stacking_key)대로 두고, 옮긴 요소는 트리에서 바로 위
/// 요소 바로 아래(없으면 바로 아래 요소 바로 위)에 끼운다. 그 순서를 지키지 못하는 요소만
/// 앞 요소보다 하나 큰 zIndex를 받는다 - 옮기지 않은 요소끼리의 순서(흩어진 그룹 포함)는 그대로다
pub(crate) fn moved_z_fixes(
    document: &Document,
    scene_id: &str,
    moved: &HashSet<String>,
) -> Vec<(String, String, i64)> {
    let Some(scene) = document.scenes.get(scene_id) else {
        return Vec::new();
    };
    let (mut elements, _) = collect_projection(scene);
    elements.sort_by_key(|entry| entry.order);
    let positions = scene_positions(&elements);
    let key_of = |index: usize, z: Option<i64>| {
        let entry = &elements[index];
        stacking_key(z, entry.kind, positions[entry.element.id.as_str()])
    };
    let is_moved: Vec<bool> = elements
        .iter()
        .map(|entry| moved.contains(&entry.element.id))
        .collect();
    // 옮기지 않은 요소의 지금 겹침 순서
    let mut sequence: Vec<usize> = (0..elements.len())
        .filter(|&index| !is_moved[index])
        .collect();
    sequence.sort_by_key(|&index| key_of(index, stored_z_index(elements[index].element)));
    // 옮긴 요소를 트리 순서대로 끼운다
    for (index, _) in is_moved.iter().enumerate().filter(|(_, moved)| **moved) {
        let placed = |other: &usize| sequence.contains(other);
        let at = if let Some(successor) = (index + 1..elements.len()).find(|other| placed(other)) {
            // 바로 위 요소가 다른 그룹 멤버면 그 그룹 전체 아래 - 그룹은 가장 위 멤버 자리에
            // 서므로 그 그룹의 겹침 순서상 가장 위 멤버 바로 아래에 끼운다
            match &elements[successor].group_id {
                Some(group) if elements[index].group_id.as_ref() != Some(group) => sequence
                    .iter()
                    .rposition(|&other| elements[other].group_id.as_ref() == Some(group))
                    .unwrap_or(0),
                _ => sequence
                    .iter()
                    .position(|&other| other == successor)
                    .unwrap_or(0),
            }
        } else if let Some(predecessor) = (0..index).rev().find(|other| placed(other)) {
            sequence
                .iter()
                .position(|&other| other == predecessor)
                .map_or(0, |at| at + 1)
        } else {
            0
        };
        sequence.insert(at, index);
    }
    // 순서를 지키지 못하는 요소만 앞 요소보다 하나 큰 zIndex
    let mut fixes = Vec::new();
    let mut previous: Option<((i64, usize, usize), i64)> = None;
    for &index in &sequence {
        let stored = stored_z_index(elements[index].element);
        let key = key_of(index, stored);
        // 저장된 zIndex가 없으면 순번이 z 역할을 한다
        let fallback_z = key.0;
        let keep = !is_moved[index] || stored.is_some();
        let (key, z) = match previous {
            Some((previous_key, _)) if keep && key > previous_key => (key, key.0),
            None if keep => (key, key.0),
            Some((_, previous_z)) => {
                let z = previous_z + 1;
                (key_of(index, Some(z)), z)
            }
            None => (key, key.0),
        };
        if stored != Some(z) && (is_moved[index] || stored.is_some() || z != fallback_z) {
            fixes.push((scene_id.to_string(), elements[index].element.id.clone(), z));
        }
        previous = Some((key, z));
    }
    fixes
}

// 트리 쓰기로 옛 종류 요소 순서가 바뀐 장면 - 저장된 zIndex를 트리 순서로 맞춰 옛 모양에 반영한다
pub(crate) fn set_tree_z(document: &mut Document, fixes: &[(String, String, i64)]) {
    for (mode, id, z) in fixes {
        let Some(element) = document
            .scenes
            .get_mut(mode)
            .and_then(|scene| scene.element_mut(id))
        else {
            continue;
        };
        let info = element
            .extra
            .entry(LEGACY.to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        if let Value::Object(info) = info {
            info.insert("zIndex".into(), json!(z));
        }
    }
}

/// 트리 문서를 옛 모양으로 내보낸다 - 옛 종류만 나타난다
pub(crate) fn project_document(document: &Document) -> Result<EditorDocumentV1> {
    let mut legacy = EditorDocumentV1 {
        schema_version: super::EDITOR_SCHEMA_VERSION,
        keys: HashMap::new(),
        key_positions: HashMap::new(),
        stat_positions: HashMap::new(),
        graph_positions: HashMap::new(),
        knob_positions: HashMap::new(),
        sprite_positions: HashMap::new(),
        layer_groups: HashMap::new(),
    };
    let mut collections: BTreeMap<EditorElementTypeV1, Map<String, Value>> = BTreeMap::new();
    for (mode, scene) in &document.scenes {
        let present: BTreeSet<String> = scene
            .extra
            .get(LEGACY_PRESENT)
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        let (mut elements, groups) = collect_projection(scene);

        // 종류별 배열 순서 - 원래 순번, 새 요소는 트리 순서대로 뒤에
        let mut by_kind: BTreeMap<EditorElementTypeV1, Vec<&ProjectedElement<'_>>> =
            BTreeMap::new();
        elements.sort_by_key(|entry| entry.order);
        for entry in &elements {
            by_kind.entry(entry.kind).or_default().push(entry);
        }
        let mut positions: HashMap<&str, usize> = HashMap::new();
        for list in by_kind.values_mut() {
            list.sort_by_key(|entry| {
                (
                    stored_index(entry.element).unwrap_or(usize::MAX),
                    entry.order,
                )
            });
            for (index, entry) in list.iter().enumerate() {
                positions.insert(entry.element.id.as_str(), index);
            }
        }

        // 저장된 zIndex를 그대로 - 흩어진 그룹은 트리에서 모이지만 옛 모양 순서는 zIndex가
        // 정한다(옛 편집은 흩어진 그룹을 허용한다). 트리 쓰기로 순서가 바뀌면 쓰는 쪽이
        // 저장된 zIndex를 먼저 맞춘다(scattered_z_fixes)
        let z_of = |entry: &ProjectedElement<'_>| -> Option<i64> { stored_z_index(entry.element) };

        for kind in EditorElementTypeV1::ALL {
            let list = by_kind.remove(&kind).unwrap_or_default();
            if list.is_empty() && !present.contains(kind.store_key()) {
                continue;
            }
            let values: Vec<Value> = list
                .iter()
                .map(|entry| Value::Object(projected_object(entry, z_of(entry))))
                .collect();
            if kind == EditorElementTypeV1::Key {
                let slots: Vec<KeySlot> = list
                    .iter()
                    .map(|entry| match &entry.element.input {
                        Some(InputBinding::Key { slot }) => {
                            serde_json::from_value(slot.clone()).unwrap_or_default()
                        }
                        _ => KeySlot::default(),
                    })
                    .collect();
                legacy.keys.insert(mode.clone(), slots);
            }
            collections
                .entry(kind)
                .or_default()
                .insert(mode.clone(), Value::Array(values));
        }
        if !legacy.keys.contains_key(mode) && present.contains(KEYS_FIELD) {
            legacy.keys.insert(mode.clone(), Vec::new());
        }

        if !groups.is_empty() || present.contains(LAYER_GROUPS_FIELD) {
            let mut ordered: Vec<(usize, usize, LayerGroupDef)> = groups
                .iter()
                .enumerate()
                .map(|(tree_order, group)| {
                    let index = group
                        .extra
                        .get(LEGACY)
                        .and_then(|legacy| legacy.get("index"))
                        .and_then(Value::as_u64)
                        .map_or(usize::MAX, |index| index as usize);
                    (
                        index,
                        tree_order,
                        LayerGroupDef {
                            id: group.id.clone(),
                            name: group.name.clone(),
                        },
                    )
                })
                .collect();
            ordered.sort_by_key(|(index, tree_order, _)| (*index, *tree_order));
            legacy.layer_groups.insert(
                mode.clone(),
                ordered.into_iter().map(|(_, _, group)| group).collect(),
            );
        }
    }
    for (kind, modes) in collections {
        set_collection(&mut legacy, kind, Value::Object(modes))
            .with_context(|| format!("{} 옛 모양 내보내기 실패", kind.store_key()))?;
    }
    Ok(legacy)
}

/// 옛 자리 정보 중 읽을 수 있는 것만 - 순번, i32 범위 zIndex, 끊긴 그룹 id
pub(crate) fn valid_placement(info: Option<&Map<String, Value>>) -> Map<String, Value> {
    let mut kept = Map::new();
    let Some(info) = info else {
        return kept;
    };
    if let Some(index) = info.get("index").filter(|index| index.as_u64().is_some()) {
        kept.insert("index".into(), index.clone());
    }
    if let Some(z) = info
        .get("zIndex")
        .filter(|z| z.as_i64().is_some_and(|z| i32::try_from(z).is_ok()))
    {
        kept.insert("zIndex".into(), z.clone());
    }
    if let Some(group) = info
        .get("danglingGroupId")
        .filter(|group| group.is_string())
    {
        kept.insert("danglingGroupId".into(), group.clone());
    }
    kept
}

/// 읽을 때 쓰는 내보내기 - 옛 모양으로 못 바꾸는 요소는 그 자리에 기본 모양을 둔다
/// (keys·positions 순번 결합을 지키는 제자리 대체). 두 번째 값은 대체가 있었는지
pub(crate) fn project_document_lenient(document: &Document) -> Result<(EditorDocumentV1, bool)> {
    if let Ok(legacy) = project_document(document) {
        return Ok((legacy, false));
    }
    let mut repaired = document.clone();
    for scene in repaired.scenes.values_mut() {
        element_document::document::walk_mut(&mut scene.nodes, &mut |node| {
            let Node::Element(element) = node else {
                return;
            };
            let Some(kind) = kind_of(&element.kind) else {
                return;
            };
            let mut probe = Document {
                scenes: Default::default(),
                ..Document::default()
            };
            probe.scenes.insert(
                "probe".into(),
                Scene {
                    nodes: vec![Node::Element(element.clone())],
                    extra: Map::new(),
                },
            );
            if project_document(&probe).is_ok() {
                return;
            }
            // 공통 정보와 자리(순번·zIndex·끊긴 그룹)만 남긴 기본 모양 - 자리 값도 범위를 벗어나면 버린다
            let info = valid_placement(legacy_info(element));
            // 종류의 기본 값과 기능 묶음 기본값
            if let Some(schema) = builtin_kind_registry().get(&element.kind) {
                element.values = element_document::value::default_fields(&schema.fields);
                element.bundles = schema
                    .bundles
                    .iter()
                    .filter_map(|bundle| {
                        BuiltinBundles::fields(bundle).map(|fields| {
                            (
                                bundle.clone(),
                                Value::Object(element_document::value::default_fields(fields)),
                            )
                        })
                    })
                    .collect();
            }
            element.extra = Map::from_iter([(LEGACY.to_string(), Value::Object(info))]);
            if kind == EditorElementTypeV1::Key
                && !matches!(element.input, Some(InputBinding::Key { .. }))
            {
                element.input = Some(InputBinding::Key {
                    slot: serde_json::to_value(KeySlot::default()).unwrap_or(Value::Null),
                });
            }
        });
    }
    let legacy =
        project_document(&repaired).context("요소 단위 대체 뒤에도 옛 모양 내보내기 실패")?;
    Ok((legacy, true))
}

// 옛 종류 요소 순서·그룹 소속·그룹 목록 - 같으면 트리 구조를 그대로 둔다
type LegacyShape = (Vec<(String, Option<String>)>, Vec<(String, String)>);

fn legacy_shape(scene: &Scene) -> LegacyShape {
    let (elements, groups) = collect_projection(scene);
    let mut groups: Vec<(String, String)> = groups
        .into_iter()
        .map(|group| (group.id.clone(), group.name.clone()))
        .collect();
    groups.sort();
    (
        elements
            .into_iter()
            .map(|entry| (entry.element.id.clone(), entry.group_id))
            .collect(),
        groups,
    )
}

fn replace_legacy_elements(nodes: &mut [Node], fresh: &mut HashMap<String, Element>) {
    for node in nodes {
        match node {
            Node::Group(group) => replace_legacy_elements(&mut group.children, fresh),
            Node::Element(element) => {
                if is_legacy_kind(&element.kind) {
                    if let Some(next) = fresh.remove(&element.id) {
                        *element = next;
                    }
                }
            }
        }
    }
}

fn take_elements(nodes: &[Node]) -> HashMap<String, Element> {
    let mut out = HashMap::new();
    walk(nodes, &mut |node, _| {
        if let Node::Element(element) = node {
            out.insert(element.id.clone(), element.clone());
        }
    });
    out
}

// 트리에만 있는 노드를 새 구조에 다시 끼운다 - 바로 아래 옛 종류 요소 뒤에 둔다
// 옛 종류 요소를 품은 그룹
fn groups_with_legacy(nodes: &[Node]) -> HashSet<String> {
    let mut groups = HashSet::new();
    let mut ancestors: Vec<(usize, String)> = Vec::new();
    walk(nodes, &mut |node, path| {
        ancestors.retain(|(depth, _)| *depth < path.len());
        match node {
            Node::Group(group) => ancestors.push((path.len(), group.id.clone())),
            Node::Element(element) if is_legacy_kind(&element.kind) => {
                groups.extend(ancestors.iter().map(|(_, id)| id.clone()));
            }
            Node::Element(_) => {}
        }
    });
    groups
}

pub(crate) fn graft_tree_only(previous: &Scene, next: &mut Scene) {
    // 트리 전용 노드마다 (조상 그룹 - 가까운 것부터, 아래 이웃 후보 - 장면 전체에서 가까운 것부터).
    // 트리 전용 그룹은 안쪽까지 한 덩어리로 끼운다.
    // 후보는 옛 종류 요소와 옛 종류 멤버가 없는 옛 그룹이다. 옛 종류 멤버가 있는 그룹은
    // 그룹 해제·이동으로 노드만 옮겨질 수 있어 기준으로 삼지 않는다
    struct Graft {
        ancestors: Vec<String>,
        below: Vec<String>,
        node: Node,
    }
    fn collect(
        nodes: &[Node],
        legacy_before: &HashSet<String>,
        ancestors: &mut Vec<String>,
        stable_seen: &mut Vec<String>,
        grafts: &mut Vec<Graft>,
    ) {
        for node in nodes {
            match node {
                Node::Group(group) if is_tree_only_group(group) => grafts.push(Graft {
                    ancestors: ancestors.iter().rev().cloned().collect(),
                    below: stable_seen.iter().rev().cloned().collect(),
                    node: node.clone(),
                }),
                Node::Group(group) => {
                    if !legacy_before.contains(&group.id) {
                        stable_seen.push(group.id.clone());
                    }
                    ancestors.push(group.id.clone());
                    collect(
                        &group.children,
                        legacy_before,
                        ancestors,
                        stable_seen,
                        grafts,
                    );
                    ancestors.pop();
                }
                Node::Element(element) if is_legacy_kind(&element.kind) => {
                    stable_seen.push(element.id.clone());
                }
                Node::Element(_) => grafts.push(Graft {
                    ancestors: ancestors.iter().rev().cloned().collect(),
                    below: stable_seen.iter().rev().cloned().collect(),
                    node: node.clone(),
                }),
            }
        }
    }
    let legacy_before = groups_with_legacy(&previous.nodes);
    let legacy_after = groups_with_legacy(&next.nodes);
    let mut grafts: Vec<Graft> = Vec::new();
    collect(
        &previous.nodes,
        &legacy_before,
        &mut Vec::new(),
        &mut Vec::new(),
        &mut grafts,
    );
    // 같은 자리(부모 그룹, 바로 아래 노드)에 여럿이면 원래 순서대로 이어 붙인다
    let mut offsets: HashMap<(Option<String>, Option<String>), usize> = HashMap::new();
    for graft in grafts {
        // 남아 있는 가장 가까운 조상을 부모로 (없으면 장면 맨 위 단계)
        let (parent_id, parent_path) = graft
            .ancestors
            .iter()
            .find_map(|id| next.find_path(id).map(|path| (Some(id.clone()), path)))
            .unwrap_or((None, Vec::new()));
        // 부모 안에서 살아남은 가장 가까운 아래 이웃을 품은 같은 단계 노드 바로 위
        let mut placed: Option<(String, usize)> = None;
        for anchor in &graft.below {
            // 그룹 후보는 지금도 옛 종류 멤버가 없어야 한다
            if legacy_after.contains(anchor) {
                continue;
            }
            let Some(path) = next.find_path(anchor) else {
                continue;
            };
            if path.len() > parent_path.len() && path.starts_with(&parent_path) {
                let slot = &path[..=parent_path.len()];
                let slot_id = next
                    .node_at(slot)
                    .map(|node| node.id().to_string())
                    .unwrap_or_default();
                placed = Some((slot_id, path[parent_path.len()]));
                break;
            }
        }
        let (key, index) = match placed {
            Some((slot_id, slot_index)) => ((parent_id, Some(slot_id)), slot_index + 1),
            None => ((parent_id, None), 0),
        };
        let offset = offsets.entry(key).or_insert(0);
        let siblings = if parent_path.is_empty() {
            &mut next.nodes
        } else {
            match next.node_at_mut(&parent_path) {
                Some(Node::Group(group)) => &mut group.children,
                _ => &mut next.nodes,
            }
        };
        let at = (index + *offset).min(siblings.len());
        siblings.insert(at, graft.node);
        *offset += 1;
    }
    // 그룹 숨김은 트리에만 있다
    let mut hidden = HashMap::new();
    walk(&previous.nodes, &mut |node, _| {
        if let Node::Group(group) = node {
            hidden.insert(group.id.clone(), group.hidden);
        }
    });
    element_document::document::walk_mut(&mut next.nodes, &mut |node| {
        if let Node::Group(group) = node {
            if let Some(flag) = hidden.get(&group.id) {
                group.hidden = *flag;
            }
        }
    });
}

// 구조가 같은 장면 - 옛 트리를 두고 옛 종류 요소 값만 바꾼다
fn replace_scene_legacy(old: &Scene, fresh_scene: &Scene) -> Scene {
    let mut fresh = take_elements(&fresh_scene.nodes);
    let mut kept = old.clone();
    kept.extra.insert(
        LEGACY_PRESENT.into(),
        fresh_scene
            .extra
            .get(LEGACY_PRESENT)
            .cloned()
            .unwrap_or(Value::Array(Vec::new())),
    );
    replace_legacy_elements(&mut kept.nodes, &mut fresh);
    kept
}

fn reconcile_scene(previous: Option<&Scene>, legacy: LegacyRef<'_>, mode: &str) -> Result<Scene> {
    let mut scene = import_scene(legacy, mode)?;
    if let Some(old) = previous {
        if legacy_shape(old) == legacy_shape(&scene) {
            scene = replace_scene_legacy(old, &scene);
        } else {
            graft_tree_only(old, &mut scene);
        }
    }
    Ok(scene)
}

/// 옛 모양으로 들어온 쓰기를 트리에 맞춘다. `before`는 이 쓰기 전 옛 모양 -
/// 주면 바뀐 장면만, 구조가 그대로면 바뀐 요소만 다시 변환한다
pub(crate) fn reconcile_document<'a, 'b>(
    previous: &Document,
    before: Option<LegacyRef<'b>>,
    legacy: impl Into<LegacyRef<'a>>,
) -> Result<Document> {
    let legacy = legacy.into();
    let mut next = Document {
        scenes: Default::default(),
        ..previous.clone()
    };
    for schema in builtin_kind_registry().kinds() {
        next.kind_versions
            .entry(schema.kind.clone())
            .or_insert(schema.version);
    }
    for mode in legacy_modes(legacy) {
        let old = previous.scenes.get(&mode);
        let after_view = ModeView::of(legacy, &mode);
        let before_view = before.map(|before| ModeView::of(before, &mode));
        let scene = match (old, before_view) {
            // 이 탭은 그대로
            (Some(old), Some(before_view)) if before_view == after_view => old.clone(),
            // 구조가 같으면 바뀐 요소만
            (Some(old), Some(before_view)) if before_view.structure() == after_view.structure() => {
                let mut scene = old.clone();
                let mut fresh = HashMap::new();
                for kind in EditorElementTypeV1::ALL {
                    for index in 0..after_view.len(kind).unwrap_or(0) {
                        if before_view.same_element(&after_view, kind, index) {
                            continue;
                        }
                        let Some(Value::Object(object)) = after_view.value(kind, index)? else {
                            continue;
                        };
                        let entry =
                            element_from_legacy(kind, object, index, after_view.slot(kind, index))?;
                        fresh.insert(entry.element.id.clone(), entry.element);
                    }
                }
                replace_legacy_elements(&mut scene.nodes, &mut fresh);
                scene
            }
            _ => reconcile_scene(old, legacy, &mode)?,
        };
        next.scenes.insert(mode, scene);
    }
    Ok(next)
}

#[cfg(test)]
mod tests;
