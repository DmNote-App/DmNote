//! store의 요소 트리 문서 - 종류별 배열(옛 모양)과 늘 같은 내용을 가리키게 맞춘다
//!
//! 옛 종류는 아직 옛 모양 경로(편집 커밋·프리셋·탭 관리·되돌리기)가 쓰므로,
//! 영속 커밋마다 옛 모양이 바뀌었으면 트리에 반영한다. 트리에만 있는 정보는 지킨다.

use std::sync::atomic::Ordering;

use anyhow::{Context, Result};
use element_document::bundles::BuiltinBundles;
use element_document::document::walk;
use element_document::{
    ChangeSet, Document, Engine, IdSource, Loader, Node, Op, Violation, ViolationCode,
};
use serde::Serialize;
use serde_json::Value;

use super::AppStore;
use crate::models::legacy_layout::{
    graft_preset_scene, graft_tree_only, import_document, is_legacy_kind, is_tree_only_group,
    moved_z_fixes, project_document, reconcile_document, set_tree_z, strip_tree_only, LegacyRef,
};
use crate::models::{builtin_kind_registry, AppStoreData, EditorCommitRequest, EditorDocumentV1};
use crate::state::history::ElementTreeHistorySnapshot;

// 저장 파일에서 트리 문서가 실리는 칸
pub(crate) const ELEMENT_DOCUMENT_FIELD: &str = "elementDocument";

// 트리가 저장 원본이 된 뒤 저장 파일에 싣지 않는 옛 종류 칸 - 읽을 때 트리에서 다시 만든다
pub(crate) const LEGACY_ELEMENT_FIELDS: [&str; 7] = [
    "keys",
    "keyPositions",
    "statPositions",
    "graphPositions",
    "knobPositions",
    "spritePositions",
    "layerGroups",
];

/// 저장된 트리 문서 읽기 - 통째로 읽지 못하면 장면·노드 단위로 읽고 망가진 노드만 뺀다.
/// 두 번째 값은 뺀 노드 수 (장면째 못 읽은 것도 하나로 센다)
pub(crate) fn parse_document_lenient(value: Value) -> (Document, usize) {
    if let Ok(document) = serde_json::from_value::<Document>(value.clone()) {
        return (document, 0);
    }
    fn parse_nodes(values: &[Value], dropped: &mut usize) -> Vec<Node> {
        values
            .iter()
            .flat_map(|value| {
                if let Ok(node) = serde_json::from_value::<Node>(value.clone()) {
                    return vec![node];
                }
                let Some(object) = value.as_object() else {
                    *dropped += 1;
                    return Vec::new();
                };
                // 그룹이면 안쪽을 따로 읽어 살린다 - 머리가 망가져도 멤버는 제자리에 둔다
                if object.get("type").and_then(Value::as_str) == Some("group") {
                    let children = object
                        .get("children")
                        .and_then(Value::as_array)
                        .map(|children| parse_nodes(children, dropped))
                        .unwrap_or_default();
                    let mut header = object.clone();
                    header.insert("children".into(), Value::Array(Vec::new()));
                    if let Ok(Node::Group(mut group)) =
                        serde_json::from_value::<Node>(Value::Object(header))
                    {
                        group.children = children;
                        return vec![Node::Group(group)];
                    }
                    *dropped += 1;
                    let Some(id) = object.get("id").and_then(Value::as_str) else {
                        // id도 없으면 멤버를 부모 자리로 꺼낸다
                        return children;
                    };
                    let mut extra = serde_json::Map::new();
                    if let Some(legacy) = object.get("legacy").filter(|legacy| legacy.is_object()) {
                        extra.insert("legacy".into(), legacy.clone());
                    }
                    return vec![Node::Group(element_document::Group {
                        id: id.to_string(),
                        name: object
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        hidden: object.get("hidden").and_then(Value::as_bool) == Some(true),
                        children,
                        extra,
                    })];
                }
                *dropped += 1;
                // 옛 종류 요소는 그 자리에 기본 모양을 둔다 (keys·positions 순번 결합 유지)
                legacy_placeholder(value).into_iter().collect()
            })
            .collect()
    }
    fn legacy_placeholder(value: &Value) -> Option<Node> {
        let object = value.as_object()?;
        let kind = object.get("kind").and_then(Value::as_str)?;
        let id = object.get("id").and_then(Value::as_str)?;
        if !is_legacy_kind(kind) {
            return None;
        }
        let frame = object
            .get("frame")
            .and_then(|frame| serde_json::from_value(frame.clone()).ok())
            .unwrap_or(element_document::Frame {
                x: 0.0,
                y: 0.0,
                width: 60.0,
                height: 60.0,
                rotation: 0.0,
            });
        // 자리 정보(순번·zIndex·끊긴 그룹) 중 읽을 수 있는 것은 지키고 칸 값은 버린다
        let mut extra = serde_json::Map::new();
        if let Some(Value::Object(legacy)) = object.get("legacy") {
            extra.insert(
                "legacy".into(),
                Value::Object(crate::models::legacy_layout::valid_placement(Some(legacy))),
            );
        }
        Some(Node::Element(element_document::Element {
            id: id.to_string(),
            kind: kind.to_string(),
            frame,
            name: None,
            hidden: false,
            class_name: None,
            use_inline_styles: None,
            bundles: Default::default(),
            values: Default::default(),
            input: None,
            extra,
        }))
    }
    let mut dropped = 0;
    let mut document = Document::default();
    let Some(object) = value.as_object() else {
        return (document, 1);
    };
    if let Some(version) = object.get("formatVersion").and_then(Value::as_u64) {
        document.format_version = version as u32;
    }
    if let Some(versions) = object
        .get("kindVersions")
        .and_then(|versions| serde_json::from_value(versions.clone()).ok())
    {
        document.kind_versions = versions;
    }
    if let Some(scenes) = object.get("scenes").and_then(Value::as_object) {
        for (scene_id, scene) in scenes {
            let Some(scene_object) = scene.as_object() else {
                dropped += 1;
                continue;
            };
            let nodes = scene_object
                .get("nodes")
                .and_then(Value::as_array)
                .map(|nodes| parse_nodes(nodes, &mut dropped))
                .unwrap_or_default();
            let extra = scene_object
                .iter()
                .filter(|(name, _)| name.as_str() != "nodes")
                .map(|(name, value)| (name.clone(), value.clone()))
                .collect();
            document
                .scenes
                .insert(scene_id.clone(), element_document::Scene { nodes, extra });
        }
    }
    (document, dropped.max(1))
}

struct UuidSource;

impl IdSource for UuidSource {
    fn next_id(&mut self) -> String {
        uuid::Uuid::new_v4().to_string()
    }
}

fn legacy_changed(before: &AppStoreData, after: &AppStoreData) -> bool {
    before.keys != after.keys
        || before.key_positions != after.key_positions
        || before.stat_positions != after.stat_positions
        || before.graph_positions != after.graph_positions
        || before.knob_positions != after.knob_positions
        || before.sprite_positions != after.sprite_positions
        || before.layer_groups != after.layer_groups
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct AttachOutcome {
    // 저장할 것이 생김
    pub(crate) changed: bool,
    // 저장된 트리 문서를 읽지 못해 옛 모양에서 다시 만듦 - 손상 복구처럼 백업한다
    pub(crate) unreadable: bool,
}

/// 불러온 store에 트리 문서를 붙인다
pub(crate) fn attach_loaded_document(
    state: &mut AppStoreData,
    stored: Option<Value>,
) -> Result<AttachOutcome> {
    let legacy = EditorDocumentV1::from_store(state);
    let mut unreadable = false;
    let stored = stored.map(|value| {
        let (document, dropped) = parse_document_lenient(value);
        if dropped > 0 {
            log::warn!("[Store] 요소 트리 문서에서 읽지 못한 노드 {dropped}개를 빼고 읽습니다");
            unreadable = true;
        }
        document
    });
    let mut document = match &stored {
        Some(stored) => {
            reconcile_document(stored, None, &legacy).context("요소 트리 맞추기 실패")?
        }
        None => import_document(&legacy).context("요소 트리 가져오기 실패")?,
    };
    let report = Loader {
        kinds: builtin_kind_registry(),
        bundles: &BuiltinBundles,
        managed_elsewhere: &is_legacy_kind,
    }
    .load(&mut document, &mut UuidSource);
    if !report.pending_hooks.is_empty() || !report.locked_kinds.is_empty() {
        log::info!(
            "[Store] 요소 종류 보존: 훅 대기 {:?}, 잠금 {:?}",
            report.pending_hooks,
            report.locked_kinds
        );
    }
    // 트리 문서가 없던 파일(옛 store.json)은 부르는 쪽이 새 파일로 저장한다
    let changed = unreadable || stored.as_ref().is_some_and(|stored| stored != &document);
    state.element_document = std::sync::Arc::new(document);

    Ok(AttachOutcome {
        changed,
        unreadable,
    })
}

/// 영속 커밋 직전 - 옛 모양이 바뀌었으면 트리에 반영한다
pub(crate) fn sync_element_document(before: &AppStoreData, after: &mut AppStoreData) -> Result<()> {
    if !legacy_changed(before, after) {
        return Ok(());
    }
    after.element_document = std::sync::Arc::new(
        reconcile_document(
            &after.element_document,
            Some(LegacyRef::from(before)),
            LegacyRef::from(&*after),
        )
        .context("요소 트리 맞추기 실패")?,
    );
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ElementDocumentCommitResult {
    Committed {
        revision: u64,
        changes: ChangeSet,
    },
    Rejected {
        revision: u64,
        // VIOLATION: 규칙에 어긋남, MANAGED_ELSEWHERE: 옛 저장 모양 경로로만 고칠 수 있는 대상,
        // HISTORY_IN_PROGRESS: 되돌리기 중
        code: &'static str,
        violations: Vec<Violation>,
    },
}

const MANAGED_ELSEWHERE: &str = "MANAGED_ELSEWHERE";
const HISTORY_IN_PROGRESS: &str = "HISTORY_IN_PROGRESS";
const VIOLATION: &str = "VIOLATION";

fn element_kind<'a>(document: &'a Document, scene: &str, id: &str) -> Option<&'a str> {
    document
        .scenes
        .get(scene)
        .and_then(|scene| scene.element(id))
        .map(|element| element.kind.as_str())
}

fn node_is_tree_only(node: &Node) -> bool {
    match node {
        Node::Element(element) => !is_legacy_kind(&element.kind),
        Node::Group(group) => is_tree_only_group(group),
    }
}

// 트리에만 있는 요소 또는 그룹
fn tree_only_target(document: &Document, scene: &str, id: &str) -> bool {
    document
        .scenes
        .get(scene)
        .and_then(|scene| scene.find_path(id).and_then(|path| scene.node_at(&path)))
        .is_some_and(node_is_tree_only)
}

// 옛 종류 요소와 옛 그룹 구성은 아직 옛 모양 경로가 고친다 - 트리 쓰기는 트리에만 있는 요소·그룹만
fn touches_legacy(document: &Document, op: &Op) -> bool {
    let element_target = |scene: &str, id: &str| {
        element_kind(document, scene, id).is_some_and(|kind| !is_legacy_kind(kind))
    };
    match op {
        Op::Insert { node, .. } => !node_is_tree_only(node),
        Op::Remove { scene, ids } | Op::Move { scene, ids, .. } | Op::Group { scene, ids, .. } => {
            !ids.iter().all(|id| tree_only_target(document, scene, id))
        }
        Op::SetFrame { scene, id, .. }
        | Op::SetCommon { scene, id, .. }
        | Op::SetValues { scene, id, .. }
        | Op::SetBundle { scene, id, .. }
        | Op::SetInput { scene, id, .. } => !element_target(scene, id),
        // 그룹 숨김은 트리에만 있는 정보, 이름은 트리 전용 그룹만
        Op::SetGroup {
            scene, id, name, ..
        } => name.is_some() && !tree_only_target(document, scene, id),
        Op::Ungroup { scene, id } => !tree_only_target(document, scene, id),
        Op::AddScene { .. } | Op::RemoveScene { .. } => true,
    }
}

// 요소가 하나도 없는 트리 전용 그룹 - 가장 바깥 것만 (안쪽은 함께 지워진다)
fn empty_tree_groups<'a>(
    document: &Document,
    scenes: impl IntoIterator<Item = &'a String>,
) -> Vec<Op> {
    fn has_element(nodes: &[Node]) -> bool {
        nodes.iter().any(|node| match node {
            Node::Element(_) => true,
            Node::Group(group) => has_element(&group.children),
        })
    }
    fn collect(nodes: &[Node], out: &mut Vec<String>) {
        for node in nodes {
            if let Node::Group(group) = node {
                if is_tree_only_group(group) && !has_element(&group.children) {
                    out.push(group.id.clone());
                } else {
                    collect(&group.children, out);
                }
            }
        }
    }
    scenes
        .into_iter()
        .filter_map(|scene_id| {
            let scene = document.scenes.get(scene_id)?;
            let mut ids = Vec::new();
            collect(&scene.nodes, &mut ids);
            (!ids.is_empty()).then(|| Op::Remove {
                scene: scene_id.clone(),
                ids,
            })
        })
        .collect()
}

// 스프라이트 포즈의 빈 id에 새 id - 옛 편집 패치(v2)는 포즈 id를 꼭 받는다
fn fill_empty_pose_ids(document: &mut Document) {
    for scene in document.scenes.values_mut() {
        element_document::document::walk_mut(&mut scene.nodes, &mut |node| {
            let Node::Element(element) = node else {
                return;
            };
            if element.kind != "sprite" {
                return;
            }
            let Some(Value::Array(poses)) = element.values.get_mut("poses") else {
                return;
            };
            for pose in poses {
                if let Some(object) = pose.as_object_mut() {
                    let empty = object
                        .get("poseId")
                        .and_then(Value::as_str)
                        .is_none_or(str::is_empty);
                    if empty {
                        object.insert(
                            "poseId".into(),
                            Value::String(uuid::Uuid::new_v4().to_string()),
                        );
                    }
                }
            }
        });
    }
}

// 연산이 옮기거나 넣은 옛 종류 요소 - 장면별
fn moved_legacy_ids(
    document: &Document,
    ops: &[Op],
) -> std::collections::BTreeMap<String, std::collections::HashSet<String>> {
    let mut moved: std::collections::BTreeMap<String, std::collections::HashSet<String>> =
        Default::default();
    let mut collect = |scene: &str, nodes: &[Node]| {
        walk(nodes, &mut |node, _| {
            if let Node::Element(element) = node {
                if is_legacy_kind(&element.kind) {
                    moved
                        .entry(scene.to_string())
                        .or_default()
                        .insert(element.id.clone());
                }
            }
        });
    };
    for op in ops {
        match op {
            Op::Insert { scene, node, .. } => collect(scene, std::slice::from_ref(node)),
            Op::Move { scene, ids, .. } | Op::Group { scene, ids, .. } => {
                let Some(target) = document.scenes.get(scene) else {
                    continue;
                };
                for id in ids {
                    if let Some(node) = target.find_path(id).and_then(|path| target.node_at(&path))
                    {
                        collect(scene, std::slice::from_ref(node));
                    }
                }
            }
            _ => {}
        }
    }
    moved
}

// 옛 경로가 고칠 대상을 건드리는 첫 연산. 같은 커밋 앞쪽에서 만든 요소·그룹을 뒤에서
// 쓸 수 있도록, 처음 문서에서 걸리는 것이 있으면 앞 연산을 차례로 적용하며 다시 본다
fn first_legacy_op(engine: &Engine<'_>, document: &Document, ops: &[Op]) -> Option<usize> {
    if !ops.iter().any(|op| touches_legacy(document, op)) {
        return None;
    }
    let mut working = document.clone();
    for (index, op) in ops.iter().enumerate() {
        if touches_legacy(&working, op) {
            return Some(index);
        }
        // 적용 실패는 실제 적용에서 규칙 위반으로 돌려준다
        if engine
            .apply(&mut working, std::slice::from_ref(op))
            .is_err()
        {
            return None;
        }
    }
    None
}

// 옛 종류 요소는 id·종류만 남긴 장면 뼈대 - 되돌리기 기록용
fn tree_skeleton(nodes: &[Node]) -> Vec<Node> {
    nodes
        .iter()
        .map(|node| match node {
            Node::Group(group) => {
                let mut group = group.clone();
                group.children = tree_skeleton(&group.children);
                Node::Group(group)
            }
            Node::Element(element) if is_legacy_kind(&element.kind) => {
                Node::Element(element_document::Element {
                    id: element.id.clone(),
                    kind: element.kind.clone(),
                    frame: element_document::Frame {
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
                    extra: Default::default(),
                })
            }
            Node::Element(_) => node.clone(),
        })
        .collect()
}

pub(crate) fn element_tree_snapshot<'a>(
    document: &Document,
    scenes: impl IntoIterator<Item = &'a String>,
) -> ElementTreeHistorySnapshot {
    ElementTreeHistorySnapshot {
        scenes: scenes
            .into_iter()
            .filter_map(|scene_id| {
                let scene = document.scenes.get(scene_id)?;
                Some((
                    scene_id.clone(),
                    element_document::Scene {
                        nodes: tree_skeleton(&scene.nodes),
                        extra: Default::default(),
                    },
                ))
            })
            .collect(),
    }
}

/// 되돌리기 - 옛 종류 요소는 그대로 두고 트리에만 있는 요소를 기록 시점 자리로 되돌린다
/// `revive_missing`: 지금 없는 장면을 뼈대로 되살린다 (지운 탭 되돌리기). 아니면 건너뛴다
pub(crate) fn restore_element_tree(
    document: &Document,
    snapshot: &ElementTreeHistorySnapshot,
    revive_missing: bool,
) -> Document {
    let mut next = document.clone();
    for (scene_id, skeleton) in &snapshot.scenes {
        let Some(scene) = next.scenes.get_mut(scene_id) else {
            // 지운 탭을 되살릴 때 - 뼈대를 두면 커밋 때 옛 종류 요소가 제자리에 채워진다
            if revive_missing {
                next.scenes.insert(scene_id.clone(), skeleton.clone());
            }
            continue;
        };
        strip_tree_only(&mut scene.nodes);
        graft_tree_only(skeleton, scene);
    }
    next
}

/// 되돌리기 - 되돌릴 옛 모양에서 장면을 새로 만들고 기록한 뼈대의 트리 전용 노드를 끼운다.
/// 옛 요소 id 세대가 지금과 달라도(프리셋 불러오기) 뼈대의 자리 표가 되돌릴 옛 모양과 같아 제자리에 온다
pub(crate) fn restore_scenes_from_legacy(
    document: &Document,
    snapshot: &ElementTreeHistorySnapshot,
    legacy: &EditorDocumentV1,
) -> Result<Document> {
    let mut fresh = import_document(legacy).context("되돌릴 트리 가져오기 실패")?;
    let mut next = document.clone();
    for (scene_id, skeleton) in &snapshot.scenes {
        let Some(mut scene) = fresh.scenes.remove(scene_id) else {
            continue;
        };
        graft_tree_only(skeleton, &mut scene);
        next.scenes.insert(scene_id.clone(), scene);
    }
    Ok(next)
}

/// 전체 프리셋 불러오기 - 트리를 새 옛 모양에서 다시 만들고 프리셋의 트리 전용 노드를 끼운다.
/// 프리셋에 트리 정보가 없으면(옛 프리셋) 트리 전용 노드 없이 프리셋 그대로다
pub(crate) fn apply_full_preset_tree(
    store: &mut AppStoreData,
    preset: Option<&std::collections::BTreeMap<String, element_document::Scene>>,
) -> Result<()> {
    let mut document = import_document(&EditorDocumentV1::from_store(store))
        .context("프리셋 트리 가져오기 실패")?;
    if let Some(preset) = preset {
        for (mode, scene) in preset {
            if let Some(target) = document.scenes.get_mut(mode) {
                graft_preset_scene(scene, target, &mut || uuid::Uuid::new_v4().to_string());
            }
        }
    }
    load_document(&mut document);
    store.element_document = std::sync::Arc::new(document);
    Ok(())
}

/// 탭 프리셋 불러오기 - 프리셋에 그 탭의 트리 정보가 있으면 지금 탭의 트리 전용 노드를 바꾼다
pub(crate) fn apply_tab_preset_tree(
    store: &mut AppStoreData,
    tab_id: &str,
    preset: Option<&element_document::Scene>,
) -> Result<()> {
    let Some(preset) = preset else {
        return Ok(());
    };
    let legacy = EditorDocumentV1::from_store(store);
    let mut fresh = import_document(&legacy).context("프리셋 트리 가져오기 실패")?;
    let Some(mut scene) = fresh.scenes.remove(tab_id) else {
        return Ok(());
    };
    graft_preset_scene(preset, &mut scene, &mut || uuid::Uuid::new_v4().to_string());
    let document = std::sync::Arc::make_mut(&mut store.element_document);
    document.scenes.insert(tab_id.to_string(), scene);
    load_document(document);
    Ok(())
}

// 읽기 정리 - 기본값 채우기·버전 옮기기 (옛 종류는 옛 경로가 맡는다)
fn load_document(document: &mut Document) {
    Loader {
        kinds: builtin_kind_registry(),
        bundles: &BuiltinBundles,
        managed_elsewhere: &is_legacy_kind,
    }
    .load(document, &mut UuidSource);
}

/// 트리 쓰기를 어느 경로로 커밋할지
pub(crate) enum ElementDocumentCommitPlan {
    // 트리에만 있는 노드만 - 트리 커밋
    TreeOnly,
    // 옛 종류 요소를 건드리지만 옛 모양은 그대로(트리 전용 노드와의 순서만) - 트리 커밋
    TreeOrderOnly,
    // 옛 종류 요소를 고친다 - 편집한 트리의 옛 모양을 옛 편집 커밋(검증·되돌리기·옛 알림)으로 보낸다
    Legacy {
        request: Box<EditorCommitRequest>,
        changes: ChangeSet,
    },
    Rejected(ElementDocumentCommitResult),
}

impl AppStore {
    pub(crate) fn element_document_revision(&self) -> u64 {
        self.element_document_revision.load(Ordering::Acquire)
    }

    pub(crate) fn element_document_snapshot(&self) -> (u64, std::sync::Arc<Document>) {
        let guard = self.state.read();
        (
            self.element_document_revision(),
            guard.data.element_document.clone(),
        )
    }

    /// 트리 쓰기 경로 고르기 - 옛 종류 요소를 건드리면 편집을 적용한 트리를 옛 모양으로 내보내
    /// 바뀐 필드만 옛 편집 패치로 만든다. 같은 트리를 맞추기 기준으로 넘겨 트리 전용 노드 자리를 지킨다
    pub(crate) fn plan_element_document_commit(
        &self,
        ops: &[Op],
        gesture_id: Option<String>,
    ) -> Result<ElementDocumentCommitPlan> {
        let guard = self.state.read();
        let document = &guard.data.element_document;
        let engine = Engine {
            kinds: builtin_kind_registry(),
            bundles: &BuiltinBundles,
        };
        if first_legacy_op(&engine, document, ops).is_none() {
            return Ok(ElementDocumentCommitPlan::TreeOnly);
        }
        // 장면은 옛 탭이라 탭 관리 경로만 만들고 지운다
        if ops
            .iter()
            .any(|op| matches!(op, Op::AddScene { .. } | Op::RemoveScene { .. }))
        {
            return Ok(ElementDocumentCommitPlan::Rejected(
                ElementDocumentCommitResult::Rejected {
                    revision: self.element_document_revision(),
                    code: MANAGED_ELSEWHERE,
                    violations: Vec::new(),
                },
            ));
        }
        let mut after = (**document).clone();
        let mut changes = match engine.apply(&mut after, ops) {
            Ok(changes) => changes,
            Err(violations) => {
                return Ok(ElementDocumentCommitPlan::Rejected(
                    ElementDocumentCommitResult::Rejected {
                        revision: self.element_document_revision(),
                        code: VIOLATION,
                        violations,
                    },
                ))
            }
        };
        let prune = empty_tree_groups(&after, changes.scenes.keys());
        if !prune.is_empty() {
            if let Ok(more) = engine.apply(&mut after, &prune) {
                changes.merge(more);
            }
        }
        // 옮기거나 넣은 옛 종류 요소만 새 트리 자리에 맞는 zIndex를 받는다
        for (scene, moved) in moved_legacy_ids(&after, ops) {
            let fixes = moved_z_fixes(&after, &scene, &moved);
            set_tree_z(&mut after, &fixes);
        }
        fill_empty_pose_ids(&mut after);
        let before = EditorDocumentV1::from_store(&guard.data);
        let projected = project_document(&after)?;
        let fields = before.changed_fields(&projected);
        // 옛 모양이 그대로면(트리 전용 노드와의 순서만 바뀜) 트리 커밋으로
        if fields.is_empty() {
            return Ok(ElementDocumentCommitPlan::TreeOrderOnly);
        }
        let mut patch = projected.patch_for_fields(&fields);
        // 트리 쓰기는 id를 정해 보내므로 v2 - 옛 v1 어댑터가 id를 새로 매기지 않게 한다
        patch.schema_version = crate::models::EDITOR_COMMIT_SCHEMA_VERSION_V2;
        let request = EditorCommitRequest {
            base_revision: guard.data.editor_revision,
            mutation_id: uuid::Uuid::new_v4().to_string(),
            multi_key: true,
            gesture_id,
            gesture_ids: Vec::new(),
            changes: Some(patch),
            ops_version: None,
            ops: None,
            element_tree: Some(std::sync::Arc::new(after)),
        };
        Ok(ElementDocumentCommitPlan::Legacy {
            request: Box::new(request),
            changes,
        })
    }

    /// 트리 편집 연산 커밋 - 전부 적용하거나 아무것도 바꾸지 않는다
    #[cfg(test)]
    pub(crate) fn commit_element_document(
        &self,
        ops: &[Op],
    ) -> Result<ElementDocumentCommitResult> {
        self.commit_element_document_checked(ops, true)
    }

    /// `check_legacy`가 false면 옛 종류 요소를 건드리는 연산도 받는다 - 옛 모양이 그대로인지는
    /// 아래에서 같은 방식으로 확인한다(트리 전용 노드와의 순서만 바뀌는 편집)
    pub(crate) fn commit_element_document_checked(
        &self,
        ops: &[Op],
        check_legacy: bool,
    ) -> Result<ElementDocumentCommitResult> {
        let revision = self.element_document_revision();
        let in_progress = ElementDocumentCommitResult::Rejected {
            revision,
            code: HISTORY_IN_PROGRESS,
            violations: Vec::new(),
        };
        let Ok(admission) = self.admit_editor_mutation() else {
            return Ok(in_progress);
        };
        let mut guard = self.lock_for_update()?;
        if admission.revalidate_for(&self.history_gate).is_err() {
            return Ok(in_progress);
        }
        let rejected = |code, violations| ElementDocumentCommitResult::Rejected {
            revision,
            code,
            violations,
        };
        let engine = Engine {
            kinds: builtin_kind_registry(),
            bundles: &BuiltinBundles,
        };
        if let Some(index) = check_legacy
            .then(|| first_legacy_op(&engine, &guard.data.element_document, ops))
            .flatten()
        {
            return Ok(rejected(
                MANAGED_ELSEWHERE,
                vec![Violation::new(
                    ViolationCode::InvalidMove,
                    format!("ops[{index}]"),
                )],
            ));
        }
        let mut scratch = guard.data.clone();
        let mut changes =
            match engine.apply(std::sync::Arc::make_mut(&mut scratch.element_document), ops) {
                Ok(changes) => changes,
                Err(violations) => return Ok(rejected(VIOLATION, violations)),
            };
        // 빼기·옮기기로 비게 된 트리 전용 그룹은 함께 지운다 (옛 그룹의 빈 그룹 정리와 같다)
        let prune = empty_tree_groups(&scratch.element_document, changes.scenes.keys());
        if !prune.is_empty() {
            match engine.apply(
                std::sync::Arc::make_mut(&mut scratch.element_document),
                &prune,
            ) {
                Ok(more) => changes.merge(more),
                Err(violations) => return Ok(rejected(VIOLATION, violations)),
            }
        }
        // 옛 모양이 그대로인지 확인 - 트리에만 있는 요소만 바뀌었어야 한다
        let before = project_document(&guard.data.element_document)?;
        let after = project_document(&scratch.element_document)?;
        if before != after {
            return Ok(rejected(MANAGED_ELSEWHERE, Vec::new()));
        }
        if changes.is_empty() {
            return Ok(ElementDocumentCommitResult::Committed { revision, changes });
        }
        let before = element_tree_snapshot(&guard.data.element_document, changes.scenes.keys());
        let plan = guard
            .history
            .prepare_element_tree_entry(before)
            .map_err(anyhow::Error::msg)?;
        let state = &mut *guard;
        self.commit_locked(state, scratch, ())?;
        guard.history.apply_record_plan(plan);
        Ok(ElementDocumentCommitResult::Committed {
            revision: self.element_document_revision(),
            changes,
        })
    }
}

#[cfg(test)]
mod tests;
