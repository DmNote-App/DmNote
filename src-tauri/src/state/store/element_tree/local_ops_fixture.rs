//! 편집 창 낙관 적용(src/renderer/editor/document/documentLocalOps.ts)·새 요소 기본값
//! (src/renderer/elementKinds/runtime/elementKindDefaults.ts)과 공유하는 fixture.
//! 백엔드 트리 편집 적용(엔진 + 빈 트리 전용 그룹 정리)과 엔진 넣기의 기본값 채우기 결과를 고정한다.
//! 갱신: UPDATE_TS_BINDINGS=1 cargo test --lib local_ops_fixture

use std::collections::BTreeMap;

use element_document::bundles::BuiltinBundles;
use element_document::{Document, Engine, Node, Op, Scene};
use serde_json::{json, Value};

use super::apply_tree_ops;
use crate::models::builtin_kind_registry;

const BASE: &str = "기본";
const WITH_COMMON: &str = "공통 정보를 쓴 뒤";
const WITH_INPUT: &str = "입력을 쓴 뒤";
const WITH_GROUP_INFO: &str = "그룹 정보를 쓴 뒤";

fn parse(ops: &Value) -> Vec<Op> {
    serde_json::from_value(ops.clone()).unwrap()
}

fn apply(document: &Document, ops: &Value) -> Document {
    let ops = parse(ops);
    let mut after = document.clone();
    apply_tree_ops(
        &Engine {
            kinds: builtin_kind_registry(),
            bundles: &BuiltinBundles,
        },
        &mut after,
        &ops,
    )
    .unwrap();
    after
}

fn tracker(id: &str, x: f64) -> Value {
    json!({
        "type": "element", "id": id, "kind": "cursorTracker",
        "frame": { "x": x, "y": 0, "width": 120, "height": 120 }
    })
}

fn group(id: &str, children: Value) -> Value {
    json!({ "type": "group", "id": id, "name": id, "children": children })
}

// 엔진 넣기가 기본값을 채운 노드 - 넣기는 완성된 노드를 보낸다 (붙여넣기·복제·새 요소 모두)
fn filled(node: Value) -> Value {
    let mut document = Document::default();
    document.scenes.insert("tab".into(), Scene::default());
    let document = apply(
        &document,
        &json!([{ "op": "insert", "scene": "tab", "node": node }]),
    );
    serde_json::to_value(&document.scenes["tab"].nodes[0]).unwrap()
}

fn common_ops() -> Value {
    json!([{
        "op": "setCommon", "scene": "tab", "id": "b",
        "name": "B", "hidden": true, "className": "glow", "useInlineStyles": false
    }])
}

fn input_ops() -> Value {
    json!([{ "op": "setInput", "scene": "tab", "id": "a", "input": { "type": "pointer" } }])
}

fn group_info_ops() -> Value {
    json!([{ "op": "setGroup", "scene": "tab", "id": "g1", "name": "Renamed", "hidden": true }])
}

// 기본 - tab: [a, g1[b, c], d, lg(옛 그룹)[e], g2[g3[f]]], other: [x].
// 연산의 뜻만 보면 되므로 요소는 틀만 둔다 (빠진 묶음에 쓰기는 묶음 기본값에서 시작한다)
fn bases() -> BTreeMap<&'static str, Document> {
    let mut legacy_group = group("lg", json!([tracker("e", 40.0)]));
    legacy_group["legacy"] = json!({});
    let base: Document = serde_json::from_value(json!({
        "formatVersion": 1,
        "scenes": {
            "tab": { "nodes": [
                tracker("a", 0.0),
                group("g1", json!([tracker("b", 10.0), tracker("c", 20.0)])),
                tracker("d", 30.0),
                legacy_group,
                group("g2", json!([group("g3", json!([tracker("f", 50.0)]))])),
            ] },
            "other": { "nodes": [tracker("x", 0.0)] },
        },
    }))
    .unwrap();
    BTreeMap::from([
        (WITH_COMMON, apply(&base, &common_ops())),
        (WITH_INPUT, apply(&base, &input_ops())),
        (WITH_GROUP_INFO, apply(&base, &group_info_ops())),
        (BASE, base),
    ])
}

fn cases() -> Vec<(&'static str, &'static str, Value)> {
    let node = |id: &str| filled(tracker(id, 70.0));
    vec![
        (
            "위치 일부 칸",
            BASE,
            json!([{ "op": "setFrame", "scene": "tab", "id": "a", "frame": { "x": 5, "rotation": 45 } }]),
        ),
        ("공통 정보 쓰기", BASE, common_ops()),
        (
            "공통 정보 지우기",
            WITH_COMMON,
            json!([{
                "op": "setCommon", "scene": "tab", "id": "b",
                "name": null, "hidden": false, "className": null, "useInlineStyles": null
            }]),
        ),
        (
            "고유 값 일부 칸",
            BASE,
            json!([{ "op": "setValues", "scene": "tab", "id": "c", "values": { "sensitivity": 2.5, "monitor": "primary" } }]),
        ),
        (
            "기능 묶음 일부 칸 - 없던 묶음은 묶음 기본값에서",
            BASE,
            json!([
                {
                    "op": "setBundle", "scene": "tab", "id": "d", "bundle": "surface",
                    "fields": { "backgroundColor": "#FF0000", "borderWidth": 2 }
                },
                {
                    "op": "setBundle", "scene": "tab", "id": "d", "bundle": "surface",
                    "fields": { "borderWidth": 4 }
                },
            ]),
        ),
        ("입력 쓰기", BASE, input_ops()),
        (
            "입력 지우기",
            WITH_INPUT,
            json!([{ "op": "setInput", "scene": "tab", "id": "a", "input": null }]),
        ),
        (
            "넣기 - 자리, 그룹 안, 맨 위, 그룹째",
            BASE,
            json!([
                { "op": "insert", "scene": "tab", "index": 1, "node": node("n1") },
                { "op": "insert", "scene": "tab", "parent": "g1", "index": 0, "node": node("n2") },
                { "op": "insert", "scene": "tab", "node": node("n3") },
                { "op": "insert", "scene": "tab", "index": 0, "node": {
                    "type": "group", "id": "pg", "name": "붙인 그룹", "children": [node("n4")]
                } },
            ]),
        ),
        (
            "빼기 - 비게 된 트리 전용 그룹은 함께 지우고 옛 그룹은 남긴다",
            BASE,
            json!([
                { "op": "remove", "scene": "tab", "ids": ["b", "c"] },
                { "op": "remove", "scene": "tab", "ids": ["e"] },
                { "op": "remove", "scene": "tab", "ids": ["f"] },
            ]),
        ),
        (
            "옮기기 - 지금 순서를 지켜 옮기기 전 목록 기준 자리에",
            BASE,
            json!([{ "op": "move", "scene": "tab", "ids": ["d", "a"], "parent": "g1", "index": 1 }]),
        ),
        (
            "옮기기 - 그룹과 그 자손을 함께 고르면 그룹째",
            BASE,
            json!([{ "op": "move", "scene": "tab", "ids": ["b", "g1"], "index": null }]),
        ),
        (
            "옮기기 - 비게 된 트리 전용 그룹은 함께 지운다",
            BASE,
            json!([{ "op": "move", "scene": "tab", "ids": ["f"], "index": 0 }]),
        ),
        (
            "묶기 - 같은 부모",
            BASE,
            json!([{ "op": "group", "scene": "tab", "id": "ng", "name": "새 그룹", "ids": ["d", "a"] }]),
        ),
        (
            "묶기 - 다른 부모, 그룹 멤버의 자손은 그룹과 함께",
            BASE,
            json!([{ "op": "group", "scene": "tab", "id": "ng", "name": "새 그룹", "ids": ["b", "g2", "f"] }]),
        ),
        (
            "묶기 - 비게 된 트리 전용 그룹은 함께 지운다",
            BASE,
            json!([{ "op": "group", "scene": "tab", "id": "ng", "name": "새 그룹", "ids": ["b", "c", "d"] }]),
        ),
        (
            "풀기",
            BASE,
            json!([{ "op": "ungroup", "scene": "tab", "id": "g1" }]),
        ),
        ("그룹 정보 쓰기", BASE, group_info_ops()),
        (
            "그룹 정보 - 숨김 풀기",
            WITH_GROUP_INFO,
            json!([{ "op": "setGroup", "scene": "tab", "id": "g1", "hidden": false }]),
        ),
        (
            "빈 그룹 정리는 묶음 끝에서 한 번 - 비운 그룹에 다시 넣으면 남는다",
            BASE,
            json!([
                { "op": "remove", "scene": "tab", "ids": ["b", "c"] },
                { "op": "insert", "scene": "tab", "parent": "g1", "node": node("n1") },
            ]),
        ),
        (
            "빈 그룹 정리는 묶음 끝에서 한 번 - 옮겨 비운 그룹에 다시 옮겨 넣으면 남는다",
            BASE,
            json!([
                { "op": "move", "scene": "tab", "ids": ["f"], "index": 0 },
                { "op": "move", "scene": "tab", "ids": ["a"], "parent": "g3", "index": 0 },
            ]),
        ),
        (
            "여러 연산 묶음",
            BASE,
            json!([
                { "op": "insert", "scene": "tab", "parent": "g1", "index": 0, "node": node("n1") },
                { "op": "setFrame", "scene": "tab", "id": "n1", "frame": { "x": 99 } },
                { "op": "setValues", "scene": "tab", "id": "n1", "values": { "dotSize": 20 } },
                { "op": "move", "scene": "tab", "ids": ["n1"], "index": 0 },
                { "op": "remove", "scene": "tab", "ids": ["b", "c"] },
            ]),
        ),
    ]
}

fn after(name: &str) -> Document {
    let bases = bases();
    let (_, from, ops) = cases()
        .into_iter()
        .find(|(case, _, _)| *case == name)
        .unwrap();
    apply(&bases[from], &ops)
}

fn generate() -> String {
    let bases = bases();
    let ops: Vec<Value> = cases()
        .into_iter()
        .map(|(name, from, ops)| {
            let after = apply(&bases[from], &ops);
            // 연산은 Rust가 쓴 모양 그대로 - 프론트 Op 타입과 같은 원본이다
            json!({ "name": name, "before": from, "ops": parse(&ops), "after": after })
        })
        .collect();
    // 종류마다 틀만 둔 노드 → 엔진 넣기가 채운 노드 (고유 값 기본값·종류가 쓰는 기능 묶음 기본값)
    let fills: Vec<Value> = builtin_kind_registry()
        .kinds()
        .map(|schema| {
            // Rust가 쓴 모양 그대로 (틀의 회전 등 기본 칸 포함)
            let node: Node = serde_json::from_value(json!({
                "type": "element", "id": "n", "kind": schema.kind,
                "frame": { "x": 0, "y": 0, "width": 60, "height": 60 }
            }))
            .unwrap();
            let node = serde_json::to_value(node).unwrap();
            json!({ "kind": schema.kind, "node": node, "filled": filled(node.clone()) })
        })
        .collect();
    let fixture = json!({ "bases": bases, "ops": ops, "fills": fills });
    format!("{}\n", serde_json::to_string_pretty(&fixture).unwrap())
}

#[test]
fn 낙관_적용_fixture가_백엔드_결과와_같다() {
    let generated = generate();
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../tests/fixtures/element-document-local-ops.json");
    if std::env::var_os("UPDATE_TS_BINDINGS").is_some() {
        std::fs::write(&path, &generated).unwrap();
        return;
    }
    assert!(
        std::fs::read_to_string(&path).unwrap_or_default() == generated,
        "fixture가 백엔드 결과와 다릅니다. UPDATE_TS_BINDINGS=1 cargo test --lib local_ops_fixture 로 갱신하세요"
    );
}

fn top_ids(document: &Document) -> Vec<String> {
    document.scenes["tab"]
        .nodes
        .iter()
        .map(|node| node.id().to_string())
        .collect()
}

#[test]
fn fixture_경우가_뜻한_대로_정리하고_남긴다() {
    // 비운 트리 전용 그룹(g1·g2)은 지우고 옛 그룹(lg)은 남긴다
    assert_eq!(
        top_ids(&after(
            "빼기 - 비게 된 트리 전용 그룹은 함께 지우고 옛 그룹은 남긴다"
        )),
        ["a", "d", "lg"]
    );
    assert_eq!(
        top_ids(&after("묶기 - 비게 된 트리 전용 그룹은 함께 지운다")),
        ["a", "ng", "lg", "g2"]
    );
    // 묶음 중간에 비었다가 다시 채워진 그룹은 남는다
    assert_eq!(
        top_ids(&after(
            "빈 그룹 정리는 묶음 끝에서 한 번 - 비운 그룹에 다시 넣으면 남는다"
        )),
        ["a", "g1", "d", "lg", "g2"]
    );
    assert_eq!(
        top_ids(&after(
            "빈 그룹 정리는 묶음 끝에서 한 번 - 옮겨 비운 그룹에 다시 옮겨 넣으면 남는다"
        )),
        ["f", "g1", "d", "lg", "g2"]
    );
    // 없던 묶음에 쓰면 묶음 기본값에서 시작한다
    let bundled = after("기능 묶음 일부 칸 - 없던 묶음은 묶음 기본값에서");
    let surface = &bundled.scenes["tab"].element("d").unwrap().bundles["surface"];
    assert_eq!(surface["backgroundColor"], "#FF0000");
    assert_eq!(surface["borderWidth"], 4);
    assert!(surface["shadow"].is_null());
}
