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
