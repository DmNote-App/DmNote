use element_document::{Document, Node, Scene};
use serde_json::{json, Value};

use super::*;

fn document(tabs: &[&str]) -> Document {
    let mut document = Document::default();
    for tab in tabs {
        document.scenes.insert(tab.to_string(), Scene::default());
    }
    document
}

fn bucket() -> Value {
    json!([
        { "instanceId": "a", "position": { "x": 1, "y": 2 }, "settings": { "label": "A" },
          "measuredSize": { "width": 30, "height": 40 }, "tabId": "4key", "zIndex": 5, "groupId": "g1" },
        "broken entry",
        { "instanceId": "b", "position": { "x": 3, "y": 4 }, "tabId": "5key", "hidden": true },
        { "instanceId": "c", "position": { "x": 0, "y": 0 }, "tabId": "gone" }
    ])
}

#[test]
fn 버킷을_트리에_쓰고_다시_읽으면_같은_배열이다() {
    let mut doc = document(&["4key", "5key"]);
    apply_plugin_bucket(&mut doc, "demo", Some(&bucket()));
    assert_eq!(project_plugin_bucket(&doc, "demo"), Some(bucket()));
    assert_eq!(plugin_bucket_ids(&doc), vec!["demo".to_string()]);
}

#[test]
fn 인스턴스는_탭_장면의_플러그인_종류_요소로_틀_값_숨김을_비춘다() {
    let mut doc = document(&["4key", "5key"]);
    apply_plugin_bucket(&mut doc, "demo", Some(&bucket()));
    let a = doc.scenes["4key"].element("demo::a").unwrap();
    assert_eq!(a.kind, "plugin:demo");
    assert_eq!(
        (a.frame.x, a.frame.y, a.frame.width, a.frame.height),
        (1.0, 2.0, 30.0, 40.0)
    );
    assert_eq!(a.values["label"], json!("A"));
    let b = doc.scenes["5key"].element("demo::b").unwrap();
    assert!(b.hidden);
    // 측정 크기가 없으면 기본 크기
    assert_eq!((b.frame.width, b.frame.height), (200.0, 150.0));
    // 해석 못 한 항목·없는 탭은 장면 밖에 보존
    assert!(doc
        .scenes
        .values()
        .all(|scene| scene.element("demo::c").is_none()));
}

#[test]
fn 다시_쓰면_남은_요소는_트리_자리를_지키고_새_요소는_장면_맨_위로_빠진_요소는_지운다() {
    let mut doc = document(&["4key", "5key"]);
    apply_plugin_bucket(&mut doc, "demo", Some(&bucket()));
    // 트리에서 다른 노드 아래로 옮겨 둔 상태
    let scene = doc.scenes.get_mut("4key").unwrap();
    scene.nodes.insert(
        0,
        Node::Element(element_document::Element {
            id: "other".into(),
            kind: "cursorTracker".into(),
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
        }),
    );
    let next = json!([
        { "instanceId": "a", "position": { "x": 9, "y": 2 }, "settings": { "label": "A2" },
          "measuredSize": { "width": 30, "height": 40 }, "tabId": "4key", "zIndex": 5, "groupId": "g1" },
        { "instanceId": "d", "position": { "x": 0, "y": 0 }, "tabId": "4key" }
    ]);
    apply_plugin_bucket(&mut doc, "demo", Some(&next));
    assert_eq!(project_plugin_bucket(&doc, "demo"), Some(next));
    let ids: Vec<_> = doc.scenes["4key"].nodes.iter().map(Node::id).collect();
    assert_eq!(ids, vec!["other", "demo::a", "demo::d"]);
    assert!(doc.scenes["5key"].element("demo::b").is_none());
    assert_eq!(doc.scenes["4key"].element("demo::a").unwrap().frame.x, 9.0);
}

#[test]
fn 버킷을_비우면_요소와_장면_밖_보존분이_모두_빠지고_다른_플러그인은_그대로다() {
    let mut doc = document(&["4key", "5key"]);
    apply_plugin_bucket(&mut doc, "demo", Some(&bucket()));
    apply_plugin_bucket(
        &mut doc,
        "other",
        Some(&json!([{ "instanceId": "a", "position": { "x": 0, "y": 0 }, "tabId": "4key" }])),
    );
    apply_plugin_bucket(&mut doc, "demo", None);
    assert_eq!(project_plugin_bucket(&doc, "demo"), None);
    assert_eq!(plugin_bucket_ids(&doc), vec!["other".to_string()]);
    // 같은 instanceId라도 플러그인마다 다른 요소
    assert!(doc.scenes["4key"].element("other::a").is_some());
}

#[test]
fn 플러그인_안에서_겹친_인스턴스_id는_뒤의_것을_장면_밖에_보존한다() {
    let mut doc = document(&["4key"]);
    let duplicated = json!([
        { "instanceId": "a", "position": { "x": 0, "y": 0 }, "tabId": "4key" },
        { "instanceId": "a", "position": { "x": 5, "y": 5 }, "tabId": "4key" }
    ]);
    apply_plugin_bucket(&mut doc, "demo", Some(&duplicated));
    assert_eq!(project_plugin_bucket(&doc, "demo"), Some(duplicated));
    assert_eq!(doc.scenes["4key"].elements().len(), 1);
}

fn native(id: &str, z: i64) -> Node {
    Node::Element(element_document::Element {
        id: id.into(),
        kind: "key".into(),
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
        extra: serde_json::from_value(json!({ "legacy": { "zIndex": z } })).unwrap(),
    })
}

fn ids_of(nodes: &[Node]) -> Vec<&str> {
    nodes.iter().map(Node::id).collect()
}

#[test]
fn 플러그인_노드는_항목의_겹침값으로_형제_사이에_그룹값으로_부모_그룹에_둔다() {
    let mut doc = document(&["4key"]);
    let scene = doc.scenes.get_mut("4key").unwrap();
    scene.nodes = vec![
        native("k1", 1),
        native("k3", 3),
        Node::Group(element_document::Group {
            id: "g1".into(),
            name: "g".into(),
            hidden: false,
            children: vec![native("k5", 5)],
            extra: Default::default(),
        }),
    ];
    apply_plugin_bucket(
        &mut doc,
        "demo",
        Some(&json!([
            { "instanceId": "a", "position": { "x": 0, "y": 0 }, "tabId": "4key", "zIndex": 2 },
            { "instanceId": "b", "position": { "x": 0, "y": 0 }, "tabId": "4key", "zIndex": 6, "groupId": "g1" },
            { "instanceId": "c", "position": { "x": 0, "y": 0 }, "tabId": "4key" }
        ])),
    );
    let scene = &doc.scenes["4key"];
    // zIndex 없는 항목은 맨 위
    assert_eq!(
        ids_of(&scene.nodes),
        vec!["k1", "demo::a", "k3", "g1", "demo::c"]
    );
    let Node::Group(group) = &scene.nodes[3] else {
        panic!()
    };
    assert_eq!(ids_of(&group.children), vec!["k5", "demo::b"]);
}

#[test]
fn 이미_있던_노드는_겹침값_그룹값이_그대로면_자리를_지키고_바뀌면_다시_둔다() {
    let mut doc = document(&["4key"]);
    doc.scenes.get_mut("4key").unwrap().nodes = vec![native("k1", 1), native("k3", 3)];
    let entry = |z: i64, x: i64| json!([{ "instanceId": "a", "position": { "x": x, "y": 0 }, "tabId": "4key", "zIndex": z }]);
    apply_plugin_bucket(&mut doc, "demo", Some(&entry(2, 0)));
    // 트리에서 맨 아래로 옮겨 둔 상태 - zIndex가 그대로면 자리를 지킨다
    let scene = doc.scenes.get_mut("4key").unwrap();
    let moved = scene.nodes.remove(1);
    scene.nodes.insert(0, moved);
    apply_plugin_bucket(&mut doc, "demo", Some(&entry(2, 9)));
    assert_eq!(
        ids_of(&doc.scenes["4key"].nodes),
        vec!["demo::a", "k1", "k3"]
    );
    // zIndex가 바뀌면 그 값의 자리로
    apply_plugin_bucket(&mut doc, "demo", Some(&entry(4, 9)));
    assert_eq!(
        ids_of(&doc.scenes["4key"].nodes),
        vec!["k1", "k3", "demo::a"]
    );
}

fn legacy_group(id: &str, children: Vec<Node>) -> Node {
    Node::Group(element_document::Group {
        id: id.into(),
        name: id.into(),
        hidden: false,
        children,
        extra: serde_json::from_value(json!({ "legacy": {} })).unwrap(),
    })
}

fn entry_of(doc: &Document, id: &str) -> Value {
    for scene in doc.scenes.values() {
        if let Some(element) = scene.element(id) {
            return element.extra["legacy"]["pluginEntry"].clone();
        }
    }
    panic!("missing {id}")
}

#[test]
fn 트리에서_옮긴_플러그인_노드는_자리에_맞게_겹침값과_그룹값을_다시_적고_바뀐_플러그인을_알린다() {
    let mut doc = document(&["4key"]);
    doc.scenes.get_mut("4key").unwrap().nodes = vec![native("k1", 1), native("k3", 3)];
    apply_plugin_bucket(
        &mut doc,
        "demo",
        Some(&json!([
            { "instanceId": "a", "position": { "x": 0, "y": 0 }, "tabId": "4key", "zIndex": 2 },
            { "instanceId": "b", "position": { "x": 0, "y": 0 }, "tabId": "4key", "zIndex": 4 }
        ])),
    );
    assert_eq!(
        ids_of(&doc.scenes["4key"].nodes),
        vec!["k1", "demo::a", "k3", "demo::b"]
    );
    // 자리가 맞으면 아무것도 바꾸지 않는다
    assert!(sync_plugin_entries_from_tree(&mut doc, &["4key".to_string()]).is_empty());

    // 트리에서 a를 맨 위로, b를 옛 그룹 안(k3 아래)으로 옮긴 상태
    let scene = doc.scenes.get_mut("4key").unwrap();
    let a = scene.nodes.remove(1);
    let b = scene.nodes.pop().unwrap();
    let k3 = scene.nodes.pop().unwrap();
    scene.nodes.push(legacy_group("g1", vec![b, k3]));
    scene.nodes.push(a);
    let changed = sync_plugin_entries_from_tree(&mut doc, &["4key".to_string()]);
    assert_eq!(changed, vec!["demo".to_string()]);
    // b: k1(1) 위·k3(3) 아래 → 사이 값, 그룹 안이면 groupId
    let b = entry_of(&doc, "demo::b");
    let bz = b["zIndex"].as_f64().unwrap();
    assert!(bz > 1.0 && bz < 3.0, "{bz}");
    assert_eq!(b["groupId"], json!("g1"));
    // a: 맨 위 → 아래 가장 큰 값보다 크게, 그룹 밖이면 groupId 없음
    let a = entry_of(&doc, "demo::a");
    assert!(a["zIndex"].as_f64().unwrap() > 3.0);
    assert!(a.get("groupId").is_none());
    // 투영도 같은 값 - 버킷 왕복
    let projected = project_plugin_bucket(&doc, "demo").unwrap();
    assert_eq!(projected[0], a);
    assert_eq!(projected[1], b);
}

#[test]
fn 트리에서_고친_플러그인_노드의_틀_숨김_값은_항목의_위치_측정_크기_숨김_설정으로_다시_적는다() {
    let mut doc = document(&["4key"]);
    apply_plugin_bucket(
        &mut doc,
        "demo",
        Some(&json!([
            { "instanceId": "a", "position": { "x": 1, "y": 2, "anchor": "kept" },
              "settings": { "label": "A" }, "tabId": "4key" },
            { "instanceId": "b", "position": { "x": 0, "y": 0 },
              "measuredSize": { "width": 30, "height": 40 }, "tabId": "4key", "hidden": true }
        ])),
    );
    let scenes = ["4key".to_string()];
    assert!(sync_plugin_entries_from_tree(&mut doc, &scenes).is_empty());

    let scene = doc.scenes.get_mut("4key").unwrap();
    let a = scene.element_mut("demo::a").unwrap();
    a.frame.x = 15.0;
    a.frame.y = 25.0;
    a.values.insert("label".into(), json!("B"));
    let b = scene.element_mut("demo::b").unwrap();
    b.frame.width = 60.0;
    b.hidden = false;

    assert_eq!(
        sync_plugin_entries_from_tree(&mut doc, &scenes),
        vec!["demo".to_string()]
    );
    let a = entry_of(&doc, "demo::a");
    // 위치 객체의 다른 칸은 지킨다
    assert_eq!(
        a["position"],
        json!({ "x": 15.0, "y": 25.0, "anchor": "kept" })
    );
    assert_eq!(a["settings"], json!({ "label": "B" }));
    // 크기를 바꾸지 않았으면 측정 크기를 새로 적지 않는다 (없던 칸은 없는 그대로)
    assert!(a.get("measuredSize").is_none());
    let b = entry_of(&doc, "demo::b");
    assert_eq!(b["measuredSize"], json!({ "width": 60.0, "height": 40.0 }));
    assert_eq!(b["hidden"], json!(false));
    // 버킷 왕복 - 다시 쓰고 읽어도 같다
    let projected = project_plugin_bucket(&doc, "demo").unwrap();
    let mut again = document(&["4key"]);
    apply_plugin_bucket(&mut again, "demo", Some(&projected));
    assert_eq!(project_plugin_bucket(&again, "demo"), Some(projected));
    assert!(sync_plugin_entries_from_tree(&mut doc, &scenes).is_empty());
}

#[test]
fn 이미_사라진_플러그인_요소의_지우기만_빼고_나머지_연산은_그대로_둔다() {
    let mut doc = document(&["4key"]);
    doc.scenes.get_mut("4key").unwrap().nodes = vec![native("k1", 1)];
    apply_plugin_bucket(
        &mut doc,
        "demo",
        Some(&json!([{ "instanceId": "a", "position": { "x": 0, "y": 0 }, "tabId": "4key" }])),
    );
    let ops: Vec<Op> = serde_json::from_value(json!([
        { "op": "remove", "scene": "4key", "ids": ["k1", "demo::a", "demo::gone"] },
        { "op": "remove", "scene": "4key", "ids": ["demo::gone"] },
        { "op": "setFrame", "scene": "4key", "id": "k1", "frame": { "x": 1 } }
    ]))
    .unwrap();
    let skipped = skip_removed_plugin_nodes(&doc, &ops).unwrap();
    assert_eq!(
        serde_json::to_value(&skipped).unwrap(),
        json!([
            { "op": "remove", "scene": "4key", "ids": ["k1", "demo::a"] },
            { "op": "setFrame", "scene": "4key", "id": "k1", "frame": { "x": 1.0 } }
        ])
    );
    // 없는 옛 요소는 그대로 두어 거절되게 한다, 건드릴 것이 없으면 None
    let ops: Vec<Op> =
        serde_json::from_value(json!([{ "op": "remove", "scene": "4key", "ids": ["missing"] }]))
            .unwrap();
    assert!(skip_removed_plugin_nodes(&doc, &ops).is_none());
}
