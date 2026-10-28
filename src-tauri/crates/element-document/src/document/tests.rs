use serde_json::json;

use super::*;
use crate::test_support::{dial_values, document, element, group, ids};

#[test]
fn 요소_순서는_트리를_깊이_우선으로_읽은_순서다() {
    let doc = document(vec![
        Node::Element(element("a", "pad", json!({}))),
        group(
            "g",
            vec![
                Node::Element(element("b", "pad", json!({}))),
                group("h", vec![Node::Element(element("c", "pad", json!({})))]),
            ],
        ),
        Node::Element(element("d", "dial", dial_values())),
    ]);
    let scene = &doc.scenes["tab"];
    let order: Vec<&str> = scene
        .elements()
        .iter()
        .map(|element| element.id.as_str())
        .collect();
    assert_eq!(order, vec!["a", "b", "c", "d"]);
    assert_eq!(
        ids(&doc),
        vec!["a@0", "g@1", "b@1.0", "h@1.1", "c@1.1.0", "d@2"]
    );
    assert_eq!(scene.parent_of("c"), Some(Some("h".to_string())));
    assert_eq!(scene.parent_of("a"), Some(None));
}

#[test]
fn 문서는_모르는_칸을_보존해_되돌려_쓴다() {
    let raw = json!({
        "formatVersion": 1,
        "kindVersions": { "pad": 1 },
        "future": { "x": 1 },
        "scenes": { "tab": { "nodes": [
            { "type": "element", "id": "a", "kind": "pad", "frame": { "x": 1, "y": 2, "width": 3, "height": 4 }, "later": true },
            { "type": "group", "id": "g", "name": "G", "children": [], "color": "red" }
        ], "background": "x" } }
    });
    let doc: Document = serde_json::from_value(raw.clone()).unwrap();
    let back = serde_json::to_value(&doc).unwrap();
    assert_eq!(back["future"], raw["future"]);
    assert_eq!(back["scenes"]["tab"]["background"], json!("x"));
    assert_eq!(back["scenes"]["tab"]["nodes"][0]["later"], json!(true));
    assert_eq!(back["scenes"]["tab"]["nodes"][1]["color"], json!("red"));
}

#[test]
fn 키_슬롯은_단일_키나_정규형_멀티_슬롯만_받는다() {
    assert!(is_valid_key_slot(&json!("A")));
    assert!(is_valid_key_slot(&json!("")));
    assert!(is_valid_key_slot(
        &json!({ "keys": ["A", "B"], "match": "any" })
    ));
    assert!(!is_valid_key_slot(
        &json!({ "keys": ["A"], "match": "any" })
    ));
    assert!(!is_valid_key_slot(
        &json!({ "keys": ["A", "A"], "match": "all" })
    ));
    assert!(!is_valid_key_slot(
        &json!({ "keys": ["A+B", "C"], "match": "all" })
    ));
    assert!(!is_valid_key_slot(
        &json!({ "keys": ["A", "B"], "match": "one" })
    ));
    assert!(!is_valid_key_slot(&json!(3)));
}
