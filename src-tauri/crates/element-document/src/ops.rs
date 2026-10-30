//! 일반 편집 연산 - 넣기, 빼기, 옮기기, 칸 값 바꾸기, 그룹 묶기·풀기.
//! 연산 묶음은 전부 성공하거나 문서를 그대로 둔다.

use std::collections::{BTreeMap, BTreeSet, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::bundles::BundleCatalog;
use crate::document::{walk, Document, Element, Frame, Group, InputBinding, Node, Scene};
use crate::schema::{KindRegistry, KindSchema};
use crate::value::{rewrite_values, validate_fields, ValueKind, Violation, ViolationCode};

// 칸이 있으면 Some - null은 Some(None)(지우기), 칸이 없으면 default로 None(그대로)
fn present_or_null<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub enum Op {
    // index가 없으면 맨 위(목록 끝)
    #[serde(rename_all = "camelCase")]
    Insert {
        scene: String,
        #[serde(default)]
        parent: Option<String>,
        #[serde(default)]
        index: Option<usize>,
        node: Node,
    },
    Remove {
        scene: String,
        ids: Vec<String>,
    },
    // ids는 지금 겹치는 순서를 지킨 채 parent 안 index 자리로 옮긴다
    #[serde(rename_all = "camelCase")]
    Move {
        scene: String,
        ids: Vec<String>,
        #[serde(default)]
        parent: Option<String>,
        #[serde(default)]
        index: Option<usize>,
    },
    SetFrame {
        scene: String,
        id: String,
        frame: FramePatch,
    },
    #[serde(rename_all = "camelCase")]
    SetCommon {
        scene: String,
        id: String,
        #[serde(
            default,
            deserialize_with = "present_or_null",
            skip_serializing_if = "Option::is_none"
        )]
        name: Option<Option<String>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        hidden: Option<bool>,
        #[serde(
            default,
            deserialize_with = "present_or_null",
            skip_serializing_if = "Option::is_none"
        )]
        class_name: Option<Option<String>>,
        #[serde(
            default,
            deserialize_with = "present_or_null",
            skip_serializing_if = "Option::is_none"
        )]
        use_inline_styles: Option<Option<bool>>,
    },
    // 고유 값 일부 바꾸기 - 적은 칸만 바뀐다
    SetValues {
        scene: String,
        id: String,
        values: Map<String, Value>,
    },
    // 기능 묶음 칸 일부 바꾸기
    SetBundle {
        scene: String,
        id: String,
        bundle: String,
        fields: Map<String, Value>,
    },
    SetInput {
        scene: String,
        id: String,
        input: Option<InputBinding>,
    },
    // ids를 새 그룹으로 묶는다. 그룹은 가장 위 멤버 자리에 생긴다
    Group {
        scene: String,
        id: String,
        #[serde(default)]
        name: String,
        ids: Vec<String>,
    },
    Ungroup {
        scene: String,
        id: String,
    },
    SetGroup {
        scene: String,
        id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        name: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        hidden: Option<bool>,
    },
    AddScene {
        scene: String,
    },
    RemoveScene {
        scene: String,
    },
}

impl Op {
    pub fn scene(&self) -> &str {
        match self {
            Op::Insert { scene, .. }
            | Op::Remove { scene, .. }
            | Op::Move { scene, .. }
            | Op::SetFrame { scene, .. }
            | Op::SetCommon { scene, .. }
            | Op::SetValues { scene, .. }
            | Op::SetBundle { scene, .. }
            | Op::SetInput { scene, .. }
            | Op::Group { scene, .. }
            | Op::Ungroup { scene, .. }
            | Op::SetGroup { scene, .. }
            | Op::AddScene { scene }
            | Op::RemoveScene { scene } => scene,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct FramePatch {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f64>,
}

pub const ROTATION_MIN: f64 = -180.0;
pub const ROTATION_MAX: f64 = 180.0;

/// 바뀐 곳 - 엔진은 바뀐 요소만 알린다
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct ChangeSet {
    pub scenes: BTreeMap<String, SceneChange>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct SceneChange {
    // 값이 바뀌었거나 새로 생긴 노드
    pub changed: BTreeSet<String>,
    pub removed: BTreeSet<String>,
    // 순서·그룹 구성이 바뀜
    pub structure: bool,
    // 장면이 새로 생기거나 없어짐
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub created: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub deleted: bool,
}

impl ChangeSet {
    pub fn is_empty(&self) -> bool {
        self.scenes.is_empty()
    }

    fn scene(&mut self, scene: &str) -> &mut SceneChange {
        self.scenes.entry(scene.to_string()).or_default()
    }

    pub fn merge(&mut self, other: ChangeSet) {
        for (scene, change) in other.scenes {
            let target = self.scene(&scene);
            for id in change.removed {
                target.changed.remove(&id);
                target.removed.insert(id);
            }
            for id in change.changed {
                target.removed.remove(&id);
                target.changed.insert(id);
            }
            target.structure |= change.structure;
            target.created |= change.created;
            target.deleted |= change.deleted;
        }
    }
}

/// 두 문서 사이 바뀐 곳 - 미확정 편집을 빼거나 확정 문서가 바뀌었을 때 쓴다
pub fn diff(before: &Document, after: &Document) -> ChangeSet {
    let mut changes = ChangeSet::default();
    let scenes: BTreeSet<&String> = before.scenes.keys().chain(after.scenes.keys()).collect();
    for scene in scenes {
        match (before.scenes.get(scene), after.scenes.get(scene)) {
            (Some(_), None) => {
                changes.scene(scene).deleted = true;
            }
            (None, Some(next)) => {
                let change = changes.scene(scene);
                change.created = true;
                change.structure = true;
                walk(&next.nodes, &mut |node, _| {
                    change.changed.insert(node.id().to_string());
                });
            }
            (Some(previous), Some(next)) => {
                if previous == next {
                    continue;
                }
                let change = diff_scene(previous, next);
                if change != SceneChange::default() {
                    changes.scenes.insert(scene.clone(), change);
                }
            }
            (None, None) => {}
        }
    }
    changes
}

fn shape(nodes: &[Node]) -> Vec<(String, Vec<usize>)> {
    let mut out = Vec::new();
    walk(nodes, &mut |node, path| {
        out.push((node.id().to_string(), path.to_vec()))
    });
    out
}

fn diff_scene(previous: &Scene, next: &Scene) -> SceneChange {
    let mut change = SceneChange::default();
    let mut before: BTreeMap<String, &Node> = BTreeMap::new();
    walk(&previous.nodes, &mut |node, _| {
        before.insert(node.id().to_string(), node);
    });
    let mut seen = HashSet::new();
    walk(&next.nodes, &mut |node, _| {
        seen.insert(node.id().to_string());
        let same = match (before.get(node.id()), node) {
            (Some(Node::Element(old)), Node::Element(new)) => old == new,
            (Some(Node::Group(old)), Node::Group(new)) => {
                old.name == new.name && old.hidden == new.hidden && old.extra == new.extra
            }
            _ => false,
        };
        if !same {
            change.changed.insert(node.id().to_string());
        }
    });
    for id in before.keys() {
        if !seen.contains(id) {
            change.removed.insert(id.clone());
        }
    }
    change.structure = shape(&previous.nodes) != shape(&next.nodes) || previous.extra != next.extra;
    change
}

pub struct Engine<'a> {
    pub kinds: &'a KindRegistry,
    pub bundles: &'a dyn BundleCatalog,
}

enum KindAccess<'a> {
    Editable(&'a KindSchema),
    // 앱보다 새 버전 - 보존만 하고 값은 못 바꾼다
    Locked,
    // 모르는 종류(플러그인 삭제 등) - 옮기기·크기·삭제만
    Unknown,
}

fn fail(code: ViolationCode, path: impl Into<String>) -> Vec<Violation> {
    vec![Violation::new(code, path)]
}

fn is_valid_frame(frame: &Frame) -> bool {
    [frame.x, frame.y, frame.width, frame.height, frame.rotation]
        .iter()
        .all(|value| value.is_finite())
        && frame.width > 0.0
        && frame.height > 0.0
        && (ROTATION_MIN..=ROTATION_MAX).contains(&frame.rotation)
}

impl Engine<'_> {
    fn access(&self, document: &Document, kind: &str) -> KindAccess<'_> {
        match self.kinds.get(kind) {
            None => KindAccess::Unknown,
            Some(schema) => {
                let stored = document
                    .kind_versions
                    .get(kind)
                    .copied()
                    .unwrap_or(schema.version);
                if stored > schema.version {
                    KindAccess::Locked
                } else {
                    KindAccess::Editable(schema)
                }
            }
        }
    }

    /// 연산 묶음 적용. 하나라도 어긋나면 문서는 그대로다
    pub fn apply(&self, document: &mut Document, ops: &[Op]) -> Result<ChangeSet, Vec<Violation>> {
        let mut next = document.clone();
        let mut changes = ChangeSet::default();
        for (index, op) in ops.iter().enumerate() {
            let change = self.apply_one(&mut next, op).map_err(|violations| {
                violations
                    .into_iter()
                    .map(|violation| {
                        Violation::new(violation.code, format!("ops[{index}].{}", violation.path))
                    })
                    .collect::<Vec<_>>()
            })?;
            changes.merge(change);
        }
        self.check_scenes(&next, &changes)?;
        *document = next;
        Ok(changes)
    }

    // 묶음 끝에서 장면 단위로 검사 - 이 묶음이 바꾼 요소의 참조와 그 종류의 개수 상한.
    // 손대지 않은 요소의 끊긴 참조(다른 경로가 남긴 것)는 이 편집을 막지 않는다
    fn check_scenes(&self, document: &Document, changes: &ChangeSet) -> Result<(), Vec<Violation>> {
        let mut violations = Vec::new();
        for (scene_id, change) in &changes.scenes {
            let Some(scene) = document.scenes.get(scene_id) else {
                continue;
            };
            let scope = scene.kind_index();
            let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
            let mut touched_kinds = HashSet::new();
            for element in scene.elements() {
                *counts.entry(element.kind.as_str()).or_default() += 1;
                if !change.changed.contains(&element.id) {
                    continue;
                }
                touched_kinds.insert(element.kind.as_str());
                let KindAccess::Editable(schema) = self.access(document, &element.kind) else {
                    continue;
                };
                for (kind, value) in reference_values(schema, &element.values) {
                    let mut out = Vec::new();
                    kind.validate(
                        value,
                        &format!("{scene_id}.{}.values", element.id),
                        &scope,
                        &mut out,
                    );
                    violations.extend(out);
                }
            }
            for (kind, count) in counts {
                if !touched_kinds.contains(kind) {
                    continue;
                }
                if let Some(schema) = self.kinds.get(kind) {
                    if schema.max_per_scene.is_some_and(|max| count > max) {
                        violations.push(Violation::new(
                            ViolationCode::ValueTooManyItems,
                            format!("{scene_id}.{kind}"),
                        ));
                    }
                }
            }
        }
        if violations.is_empty() {
            Ok(())
        } else {
            Err(violations)
        }
    }

    fn apply_one(&self, document: &mut Document, op: &Op) -> Result<ChangeSet, Vec<Violation>> {
        let mut changes = ChangeSet::default();
        let scene_id = op.scene().to_string();
        match op {
            Op::AddScene { scene } => {
                if document.scenes.contains_key(scene) {
                    return Ok(changes);
                }
                document.scenes.insert(scene.clone(), Scene::default());
                let change = changes.scene(scene);
                change.created = true;
                change.structure = true;
                return Ok(changes);
            }
            Op::RemoveScene { scene } => {
                if document.scenes.remove(scene).is_none() {
                    return Err(fail(ViolationCode::SceneNotFound, "scene"));
                }
                changes.scene(scene).deleted = true;
                return Ok(changes);
            }
            _ => {}
        }
        if !document.scenes.contains_key(&scene_id) {
            return Err(fail(ViolationCode::SceneNotFound, "scene"));
        }
        match op {
            Op::Insert {
                parent,
                index,
                node,
                ..
            } => {
                let mut node = node.clone();
                self.prepare_insert(document, &mut node)?;
                let existing = document.all_ids();
                let mut ids = Vec::new();
                walk(std::slice::from_ref(&node), &mut |node, _| {
                    ids.push(node.id().to_string())
                });
                for (position, id) in ids.iter().enumerate() {
                    if id.is_empty() || existing.contains(id) || ids[..position].contains(id) {
                        return Err(fail(ViolationCode::DuplicateId, "node.id"));
                    }
                }
                let scene = document.scenes.get_mut(&scene_id).expect("scene checked");
                let Some(siblings) = scene.children_mut(parent.as_deref()) else {
                    return Err(fail(ViolationCode::GroupNotFound, "parent"));
                };
                let at = index.unwrap_or(siblings.len()).min(siblings.len());
                siblings.insert(at, node);
                let change = changes.scene(&scene_id);
                change.changed.extend(ids);
                change.structure = true;
            }
            Op::Remove { ids, .. } => {
                let scene = document.scenes.get_mut(&scene_id).expect("scene checked");
                let mut removed = BTreeSet::new();
                for id in ids {
                    let Some(path) = scene.find_path(id) else {
                        return Err(fail(ViolationCode::ElementNotFound, "ids"));
                    };
                    let node = scene.take_at(&path).expect("path from find");
                    walk(std::slice::from_ref(&node), &mut |node, _| {
                        removed.insert(node.id().to_string());
                    });
                }
                // 지운 요소를 가리키던 참조는 그대로 둔다 - 끊긴 참조 허용(되돌리면 다시 이어진다)
                let change = changes.scene(&scene_id);
                change.removed.extend(removed);
                change.structure = true;
            }
            Op::Move {
                ids, parent, index, ..
            } => {
                let scene = document.scenes.get_mut(&scene_id).expect("scene checked");
                if let Some(parent) = parent {
                    // 그룹을 자기 안으로 옮길 수 없다
                    let Some(parent_path) = scene.find_path(parent) else {
                        return Err(fail(ViolationCode::GroupNotFound, "parent"));
                    };
                    for id in ids {
                        let Some(path) = scene.find_path(id) else {
                            return Err(fail(ViolationCode::ElementNotFound, "ids"));
                        };
                        if parent_path.starts_with(&path) {
                            return Err(fail(ViolationCode::InvalidMove, "parent"));
                        }
                    }
                }
                // 지금 순서대로 떼어 낸다
                let mut ordered: Vec<(Vec<usize>, String)> = Vec::new();
                for id in ids {
                    let Some(path) = scene.find_path(id) else {
                        return Err(fail(ViolationCode::ElementNotFound, "ids"));
                    };
                    if ordered.iter().any(|(_, other)| other == id) {
                        continue;
                    }
                    ordered.push((path, id.clone()));
                }
                ordered.sort();
                // 다른 멤버의 조상이 함께 옮겨지면 자손은 따로 떼지 않는다
                let paths: Vec<Vec<usize>> = ordered.iter().map(|(path, _)| path.clone()).collect();
                ordered.retain(|(path, _)| {
                    !paths
                        .iter()
                        .any(|other| other != path && path.starts_with(other))
                });
                // 자리 기준: 옮기기 전 대상 목록에서 index 앞에 있던 남는 노드 수
                let anchor = match index {
                    None => None,
                    Some(index) => {
                        let siblings = match parent {
                            None => &scene.nodes,
                            Some(parent) => {
                                let path = scene.find_path(parent).expect("checked");
                                match scene.node_at(&path) {
                                    Some(Node::Group(group)) => &group.children,
                                    _ => return Err(fail(ViolationCode::GroupNotFound, "parent")),
                                }
                            }
                        };
                        let moving: HashSet<&str> =
                            ordered.iter().map(|(_, id)| id.as_str()).collect();
                        Some(
                            siblings
                                .iter()
                                .take(*index)
                                .filter(|node| !moving.contains(node.id()))
                                .count(),
                        )
                    }
                };
                let mut taken = Vec::new();
                for (_, id) in &ordered {
                    let path = scene.find_path(id).expect("checked");
                    taken.push(scene.take_at(&path).expect("path from find"));
                }
                let Some(siblings) = scene.children_mut(parent.as_deref()) else {
                    return Err(fail(ViolationCode::GroupNotFound, "parent"));
                };
                let at = anchor.unwrap_or(siblings.len()).min(siblings.len());
                for (offset, node) in taken.into_iter().enumerate() {
                    siblings.insert(at + offset, node);
                }
                changes.scene(&scene_id).structure = true;
            }
            Op::SetFrame { id, frame, .. } => {
                let scene = document.scenes.get_mut(&scene_id).expect("scene checked");
                let Some(element) = scene.element_mut(id) else {
                    return Err(fail(ViolationCode::ElementNotFound, "id"));
                };
                let mut next = element.frame;
                if let Some(x) = frame.x {
                    next.x = x;
                }
                if let Some(y) = frame.y {
                    next.y = y;
                }
                if let Some(width) = frame.width {
                    next.width = width;
                }
                if let Some(height) = frame.height {
                    next.height = height;
                }
                if let Some(rotation) = frame.rotation {
                    next.rotation = rotation;
                }
                if !is_valid_frame(&next) {
                    return Err(fail(ViolationCode::InvalidFrame, "frame"));
                }
                if next != element.frame {
                    element.frame = next;
                    changes.scene(&scene_id).changed.insert(id.clone());
                }
            }
            Op::SetCommon {
                id,
                name,
                hidden,
                class_name,
                use_inline_styles,
                ..
            } => {
                let scene = document.scenes.get_mut(&scene_id).expect("scene checked");
                let Some(element) = scene.element_mut(id) else {
                    return Err(fail(ViolationCode::ElementNotFound, "id"));
                };
                let before = element.clone();
                if let Some(name) = name {
                    element.name = name.clone();
                }
                if let Some(hidden) = hidden {
                    element.hidden = *hidden;
                }
                if let Some(class_name) = class_name {
                    element.class_name = class_name.clone();
                }
                if let Some(use_inline_styles) = use_inline_styles {
                    element.use_inline_styles = *use_inline_styles;
                }
                if *element != before {
                    changes.scene(&scene_id).changed.insert(id.clone());
                }
            }
            Op::SetValues { id, values, .. } => {
                let kind = self.element_kind(document, &scene_id, id)?;
                let KindAccess::Editable(schema) = self.access(document, &kind) else {
                    return Err(fail(locked_code(self, document, &kind), "id"));
                };
                let scene = document.scenes.get_mut(&scene_id).expect("scene checked");
                let element = scene.element_mut(id).expect("kind found");
                let mut next = element.values.clone();
                for (name, value) in values {
                    next.insert(name.clone(), value.clone());
                }
                let mut violations = Vec::new();
                validate_fields(
                    &schema.fields,
                    &next,
                    Some(&element.values),
                    "values",
                    &crate::value::NoReferences,
                    &mut violations,
                );
                // 참조 종류는 묶음 끝에서 장면 기준으로 본다
                if !violations.is_empty() {
                    return Err(violations);
                }
                if next != element.values {
                    element.values = next;
                    changes.scene(&scene_id).changed.insert(id.clone());
                }
            }
            Op::SetBundle {
                id, bundle, fields, ..
            } => {
                let kind = self.element_kind(document, &scene_id, id)?;
                let KindAccess::Editable(schema) = self.access(document, &kind) else {
                    return Err(fail(locked_code(self, document, &kind), "id"));
                };
                if !schema.uses_bundle(bundle) || !self.bundles.knows(bundle) {
                    return Err(fail(ViolationCode::BundleNotAllowed, "bundle"));
                }
                let scene = document.scenes.get_mut(&scene_id).expect("scene checked");
                let element = scene.element_mut(id).expect("kind found");
                let previous = element.bundles.get(bundle).cloned();
                let mut next = previous
                    .clone()
                    .unwrap_or_else(|| self.bundles.default_value(bundle));
                let Some(object) = next.as_object_mut() else {
                    return Err(fail(ViolationCode::InvalidBundle, "bundle"));
                };
                for (name, value) in fields {
                    object.insert(name.clone(), value.clone());
                }
                let mut violations = Vec::new();
                self.bundles.validate(
                    bundle,
                    &next,
                    previous.as_ref(),
                    &format!("bundles.{bundle}"),
                    &mut violations,
                );
                if !violations.is_empty() {
                    return Err(violations);
                }
                if previous.as_ref() != Some(&next) {
                    element.bundles.insert(bundle.clone(), next);
                    changes.scene(&scene_id).changed.insert(id.clone());
                }
            }
            Op::SetInput { id, input, .. } => {
                let kind = self.element_kind(document, &scene_id, id)?;
                let KindAccess::Editable(schema) = self.access(document, &kind) else {
                    return Err(fail(locked_code(self, document, &kind), "id"));
                };
                if let Some(input) = input {
                    if !schema.accepts_input(input.type_name()) || !input.is_valid() {
                        return Err(fail(ViolationCode::InvalidInput, "input"));
                    }
                }
                let scene = document.scenes.get_mut(&scene_id).expect("scene checked");
                let element = scene.element_mut(id).expect("kind found");
                if element.input != *input {
                    element.input = input.clone();
                    changes.scene(&scene_id).changed.insert(id.clone());
                }
            }
            Op::Group { id, name, ids, .. } => {
                if id.is_empty() || document.all_ids().contains(id) {
                    return Err(fail(ViolationCode::DuplicateId, "id"));
                }
                if ids.is_empty() {
                    return Err(fail(ViolationCode::ElementNotFound, "ids"));
                }
                let scene = document.scenes.get_mut(&scene_id).expect("scene checked");
                // 멤버 중 가장 위 노드 자리(같은 부모)에 그룹을 만든다
                let mut members_by_path = Vec::new();
                for member in ids {
                    let Some(path) = scene.find_path(member) else {
                        return Err(fail(ViolationCode::ElementNotFound, "ids"));
                    };
                    if !members_by_path.iter().any(|(_, other)| other == member) {
                        members_by_path.push((path, member.clone()));
                    }
                }
                // 다른 멤버(그룹)의 자손은 그 그룹과 함께 옮겨지므로 따로 넣지 않는다
                let all_paths: Vec<Vec<usize>> = members_by_path
                    .iter()
                    .map(|(path, _)| path.clone())
                    .collect();
                members_by_path.retain(|(path, _)| {
                    !all_paths
                        .iter()
                        .any(|other| other != path && path.starts_with(other))
                });
                let ids: Vec<String> = members_by_path.iter().map(|(_, id)| id.clone()).collect();
                let mut paths: Vec<Vec<usize>> =
                    members_by_path.into_iter().map(|(path, _)| path).collect();
                paths.sort();
                let top = paths.last().expect("not empty").clone();
                let parent_path = top[..top.len() - 1].to_vec();
                let parent_id = if parent_path.is_empty() {
                    None
                } else {
                    scene
                        .node_at(&parent_path)
                        .map(|node| node.id().to_string())
                };
                let marker = Node::Group(Group {
                    id: String::new(),
                    name: String::new(),
                    hidden: false,
                    children: Vec::new(),
                    extra: Map::new(),
                });
                // 가장 위 멤버 자리에 표시를 남기고 멤버를 떼어 낸다
                let top_node = scene.node_at_mut(&top).expect("path from find");
                let top_member = std::mem::replace(top_node, marker);
                let mut remaining: Vec<String> = ids
                    .iter()
                    .filter(|member| *member != top_member.id())
                    .cloned()
                    .collect();
                remaining.sort_by_key(|member| scene.find_path(member));
                remaining.dedup();
                let mut members: Vec<Node> = Vec::new();
                for member in &remaining {
                    let path = scene.find_path(member).expect("checked");
                    members.push(scene.take_at(&path).expect("path from find"));
                }
                members.push(top_member);
                let group = Node::Group(Group {
                    id: id.clone(),
                    name: name.clone(),
                    hidden: false,
                    children: members,
                    extra: Map::new(),
                });
                let siblings = scene
                    .children_mut(parent_id.as_deref())
                    .expect("parent exists");
                let marker_index = siblings
                    .iter()
                    .position(|node| node.id().is_empty())
                    .expect("marker placed");
                siblings[marker_index] = group;
                let change = changes.scene(&scene_id);
                change.changed.insert(id.clone());
                change.structure = true;
            }
            Op::Ungroup { id, .. } => {
                let scene = document.scenes.get_mut(&scene_id).expect("scene checked");
                let Some(path) = scene.find_path(id) else {
                    return Err(fail(ViolationCode::GroupNotFound, "id"));
                };
                if !matches!(scene.node_at(&path), Some(Node::Group(_))) {
                    return Err(fail(ViolationCode::GroupNotFound, "id"));
                }
                let Some(Node::Group(group)) = scene.take_at(&path) else {
                    unreachable!("checked group");
                };
                let parent = &path[..path.len() - 1];
                let siblings = if parent.is_empty() {
                    &mut scene.nodes
                } else {
                    match scene.node_at_mut(parent) {
                        Some(Node::Group(parent)) => &mut parent.children,
                        _ => unreachable!("parent of a node is a group"),
                    }
                };
                let at = *path.last().expect("not empty");
                for (offset, child) in group.children.into_iter().enumerate() {
                    siblings.insert(at + offset, child);
                }
                let change = changes.scene(&scene_id);
                change.removed.insert(id.clone());
                change.structure = true;
            }
            Op::SetGroup {
                id, name, hidden, ..
            } => {
                let scene = document.scenes.get_mut(&scene_id).expect("scene checked");
                let Some(path) = scene.find_path(id) else {
                    return Err(fail(ViolationCode::GroupNotFound, "id"));
                };
                let Some(Node::Group(group)) = scene.node_at_mut(&path) else {
                    return Err(fail(ViolationCode::GroupNotFound, "id"));
                };
                let before = (group.name.clone(), group.hidden);
                if let Some(name) = name {
                    group.name = name.clone();
                }
                if let Some(hidden) = hidden {
                    group.hidden = *hidden;
                }
                if before != (group.name.clone(), group.hidden) {
                    changes.scene(&scene_id).changed.insert(id.clone());
                }
            }
            Op::AddScene { .. } | Op::RemoveScene { .. } => unreachable!("handled above"),
        }
        Ok(changes)
    }

    fn element_kind(
        &self,
        document: &Document,
        scene: &str,
        id: &str,
    ) -> Result<String, Vec<Violation>> {
        document.scenes[scene]
            .element(id)
            .map(|element| element.kind.clone())
            .ok_or_else(|| fail(ViolationCode::ElementNotFound, "id"))
    }

    // 넣을 노드 채우기·검사 - 빠진 고유 값과 묶음은 기본값으로 채운다
    fn prepare_insert(&self, document: &Document, node: &mut Node) -> Result<(), Vec<Violation>> {
        match node {
            Node::Group(group) => {
                for child in &mut group.children {
                    self.prepare_insert(document, child)?;
                }
                Ok(())
            }
            Node::Element(element) => self.prepare_element(document, element),
        }
    }

    fn prepare_element(
        &self,
        document: &Document,
        element: &mut Element,
    ) -> Result<(), Vec<Violation>> {
        let schema = match self.access(document, &element.kind) {
            KindAccess::Editable(schema) => schema,
            KindAccess::Locked => return Err(fail(ViolationCode::KindVersionLocked, "node.kind")),
            KindAccess::Unknown => return Err(fail(ViolationCode::UnknownKind, "node.kind")),
        };
        if !is_valid_frame(&element.frame) {
            return Err(fail(ViolationCode::InvalidFrame, "node.frame"));
        }
        for rule in &schema.fields {
            if !element.values.contains_key(&rule.name) {
                element
                    .values
                    .insert(rule.name.clone(), rule.default.clone());
            }
        }
        let mut violations = Vec::new();
        validate_fields(
            &schema.fields,
            &element.values,
            None,
            "node.values",
            &crate::value::NoReferences,
            &mut violations,
        );
        for name in element.bundles.keys() {
            if !schema.uses_bundle(name) || !self.bundles.knows(name) {
                violations.push(Violation::new(
                    ViolationCode::BundleNotAllowed,
                    format!("node.bundles.{name}"),
                ));
            }
        }
        for name in &schema.bundles {
            if !element.bundles.contains_key(name) {
                element
                    .bundles
                    .insert(name.clone(), self.bundles.default_value(name));
            }
        }
        for (name, value) in &element.bundles {
            self.bundles.validate(
                name,
                value,
                None,
                &format!("node.bundles.{name}"),
                &mut violations,
            );
        }
        if let Some(input) = &element.input {
            if !schema.accepts_input(input.type_name()) || !input.is_valid() {
                violations.push(Violation::new(ViolationCode::InvalidInput, "node.input"));
            }
        }
        if violations.is_empty() {
            Ok(())
        } else {
            Err(violations)
        }
    }
}

fn locked_code(engine: &Engine<'_>, document: &Document, kind: &str) -> ViolationCode {
    match engine.access(document, kind) {
        KindAccess::Unknown => ViolationCode::UnknownKind,
        _ => ViolationCode::KindVersionLocked,
    }
}

fn reference_values<'a>(
    schema: &'a KindSchema,
    values: &'a Map<String, Value>,
) -> Vec<(&'a ValueKind, &'a Value)> {
    let mut out = Vec::new();
    crate::value::visit_values(&schema.fields, values, &mut |kind, value| {
        if matches!(kind, ValueKind::ElementRef { .. }) && !value.is_null() {
            out.push((kind, value));
        }
    });
    out
}

/// 복제·붙여넣기 때 참조 다시 잇기 - 함께 복제된 요소를 가리키면 복제본으로 바꾼다
pub fn remap_references(
    kinds: &KindRegistry,
    nodes: &mut [Node],
    mapping: &BTreeMap<String, String>,
) {
    crate::document::walk_mut(nodes, &mut |node| {
        let Node::Element(element) = node else {
            return;
        };
        let Some(schema) = kinds.get(&element.kind) else {
            return;
        };
        rewrite_values(&schema.fields, &mut element.values, &mut |kind, value| {
            if !matches!(kind, ValueKind::ElementRef { .. }) {
                return false;
            }
            let Some(next) = value.as_str().and_then(|id| mapping.get(id)) else {
                return false;
            };
            *value = Value::String(next.clone());
            true
        });
    });
}

#[cfg(test)]
mod tests;
