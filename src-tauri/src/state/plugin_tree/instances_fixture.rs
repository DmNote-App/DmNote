//! 플러그인 런타임의 인스턴스 ↔ 트리 노드(src/renderer/plugins/runtime/api/pluginTreeInstances.ts)와 공유하는 fixture.
//! 저장 항목 → 노드(`placeable`·`place`), 노드 → 저장 항목 읽기(`project_plugin_bucket`), 탭 정규화를 고정한다.
//! 갱신: UPDATE_TS_BINDINGS=1 cargo test --lib instances_fixture

use element_document::document::walk;
use element_document::{Document, Node};
use serde_json::{json, Value};

use super::{apply_plugin_bucket, plugin_kind, project_plugin_bucket, LEGACY};
use crate::state::plugin::normalize_plugin_instance_tab_id;

const PLUGIN_ID: &str = "demo";

// 4key에 옛 그룹 하나 - 그룹 소속 항목이 들어갈 자리
fn base() -> Document {
    serde_json::from_value(json!({
        "formatVersion": 1,
        "scenes": {
            "4key": { "nodes": [
                { "type": "group", "id": "pg", "name": "플러그인 그룹", "children": [], "legacy": {} }
            ] },
            "5key": { "nodes": [] },
        },
    }))
    .unwrap()
}

// 런타임이 쓰는 모양 그대로의 항목 - 측정 크기(기본 틀과 같은 값 포함)·숨김·설정·겹침값·그룹
fn entries() -> Value {
    json!([
        {
            "instanceId": "a", "position": { "x": 1, "y": 2 }, "tabId": "4key", "hidden": false,
            "measuredSize": { "width": 30, "height": 40 }, "settings": { "label": "A", "count": 3 },
            "zIndex": 5
        },
        { "instanceId": "b", "position": { "x": 3, "y": 4 }, "tabId": "5key", "hidden": true },
        {
            "instanceId": "c", "position": { "x": 5, "y": 6 }, "tabId": "4key", "hidden": false,
            "zIndex": 2, "groupId": "pg"
        },
        {
            "instanceId": "d", "position": { "x": 7, "y": 8 }, "tabId": "4key", "hidden": false,
            "measuredSize": { "width": 200, "height": 150 }
        },
    ])
}

fn generate() -> String {
    let base = base();
    let mut document = base.clone();
    apply_plugin_bucket(&mut document, PLUGIN_ID, Some(&entries()));
    // 항목마다 놓인 자리와 노드(옛 정보 빼고)
    let kind = plugin_kind(PLUGIN_ID);
    let mut placed = Vec::new();
    for (scene_id, scene) in &document.scenes {
        let mut parents: Vec<Option<String>> = Vec::new();
        walk(&scene.nodes, &mut |node, path| {
            parents.truncate(path.len() - 1);
            match node {
                Node::Group(group) => parents.push(Some(group.id.clone())),
                Node::Element(element) if element.kind == kind => {
                    let mut element = element.clone();
                    element.extra.remove(LEGACY);
                    placed.push(json!({
                        "scene": scene_id,
                        "parent": parents.last().cloned().flatten(),
                        "node": Node::Element(element),
                    }));
                }
                Node::Element(_) => {}
            }
        });
    }
    let tabs: Vec<Value> = [None, Some(""), Some("5key")]
        .into_iter()
        .map(|tab| json!({ "tabId": tab, "scene": normalize_plugin_instance_tab_id(tab) }))
        .collect();
    let fixture = json!({
        "pluginId": PLUGIN_ID,
        "base": base,
        "entries": entries(),
        "document": document,
        "projected": project_plugin_bucket(&document, PLUGIN_ID),
        "placed": placed,
        "tabs": tabs,
    });
    format!("{}\n", serde_json::to_string_pretty(&fixture).unwrap())
}

#[test]
fn 플러그인_인스턴스_fixture가_백엔드_결과와_같다() {
    let generated = generate();
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../tests/fixtures/plugin-instance-tree.json");
    if std::env::var_os("UPDATE_TS_BINDINGS").is_some() {
        std::fs::write(&path, &generated).unwrap();
        return;
    }
    assert!(
        std::fs::read_to_string(&path).unwrap_or_default() == generated,
        "fixture가 백엔드 결과와 다릅니다. UPDATE_TS_BINDINGS=1 cargo test --lib instances_fixture 로 갱신하세요"
    );
}

#[test]
fn 항목을_트리에_두고_다시_읽으면_같은_항목이다() {
    let mut document = base();
    apply_plugin_bucket(&mut document, PLUGIN_ID, Some(&entries()));
    assert_eq!(project_plugin_bucket(&document, PLUGIN_ID), Some(entries()));
    // 그룹 소속은 그 그룹 안에
    let Node::Group(group) = &document.scenes["4key"].nodes[0] else {
        panic!("그룹이 맨 앞이어야 한다");
    };
    assert_eq!(group.children[0].id(), "demo::c");
}
