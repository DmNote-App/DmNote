use serde_json::json;

use super::*;
use crate::bundles::NoBundles;
use crate::document::Node;
use crate::schema::KindRegistry;
use crate::test_support::{document, element, registry};

fn engine(kinds: &KindRegistry) -> Engine<'_> {
    Engine {
        kinds,
        bundles: &NoBundles,
    }
}

fn nudge(id: &str, edit: &str, x: f64) -> PendingEdit {
    PendingEdit {
        id: edit.to_string(),
        ops: serde_json::from_value(
            json!([{ "op": "setFrame", "scene": "tab", "id": id, "frame": { "x": x } }]),
        )
        .unwrap(),
        acknowledged: None,
    }
}

fn x_of(session: &Session, id: &str) -> f64 {
    session.view().scenes["tab"].element(id).unwrap().frame.x
}

#[test]
fn 미확정_편집은_화면에_먼저_반영되고_거부되면_빠진다() {
    let kinds = registry();
    let engine = engine(&kinds);
    let mut session = Session::new(
        document(vec![Node::Element(element("a", "pad", json!({})))]),
        1,
    );
    session.push(&engine, nudge("a", "e1", 10.0)).unwrap();
    session.push(&engine, nudge("a", "e2", 20.0)).unwrap();
    assert_eq!(x_of(&session, "a"), 20.0);

    let changes = session.reject(&engine, "e2");
    assert_eq!(x_of(&session, "a"), 10.0);
    assert!(changes.scenes["tab"].changed.contains("a"));

    // 응답이 먼저 오면 패치가 올 때까지 화면을 지킨다
    assert!(session.acknowledge(&engine, "e1", 2).is_empty());
    assert_eq!(x_of(&session, "a"), 10.0);
    let mut confirmed = session.confirmed().clone();
    confirmed
        .scenes
        .get_mut("tab")
        .unwrap()
        .element_mut("a")
        .unwrap()
        .frame
        .x = 10.0;
    let changes = session.rebase(&engine, confirmed, 2);
    assert!(changes.is_empty(), "확정 값이 화면과 같으면 알릴 것이 없다");
    assert!(session.pending().is_empty());
    assert_eq!(session.revision(), 2);
}

#[test]
fn 다른_창의_확정_위에_남은_편집을_다시_쌓고_맞지_않는_편집은_버린다() {
    let kinds = registry();
    let engine = engine(&kinds);
    let start = document(vec![
        Node::Element(element("a", "pad", json!({}))),
        Node::Element(element("b", "pad", json!({}))),
    ]);
    let mut session = Session::new(start.clone(), 1);
    session.push(&engine, nudge("a", "e1", 10.0)).unwrap();
    session.push(&engine, nudge("b", "e2", 30.0)).unwrap();

    // 다른 창이 b를 지웠다
    let mut remote = start;
    remote.scenes.get_mut("tab").unwrap().nodes.remove(1);
    let changes = session.rebase(&engine, remote, 5);
    assert_eq!(x_of(&session, "a"), 10.0);
    assert_eq!(session.pending().len(), 1);
    assert!(changes.scenes["tab"].removed.contains("b"));
}

#[test]
fn 검사에_걸린_편집은_목록에_넣지_않는다() {
    let kinds = registry();
    let engine = engine(&kinds);
    let mut session = Session::new(
        document(vec![Node::Element(element("a", "pad", json!({})))]),
        1,
    );
    let bad = PendingEdit {
        id: "bad".into(),
        ops: serde_json::from_value(
            json!([{ "op": "setFrame", "scene": "tab", "id": "a", "frame": { "width": -1 } }]),
        )
        .unwrap(),
        acknowledged: None,
    };
    assert!(session.push(&engine, bad).is_err());
    assert!(session.pending().is_empty());
}

#[test]
fn 패치가_응답보다_먼저_오면_응답_때_빠진다() {
    let kinds = registry();
    let engine = engine(&kinds);
    let mut session = Session::new(
        document(vec![Node::Element(element("a", "pad", json!({})))]),
        1,
    );
    session.push(&engine, nudge("a", "e1", 10.0)).unwrap();
    let mut confirmed = session.confirmed().clone();
    confirmed
        .scenes
        .get_mut("tab")
        .unwrap()
        .element_mut("a")
        .unwrap()
        .frame
        .x = 10.0;
    session.rebase(&engine, confirmed, 2);
    assert_eq!(session.pending().len(), 1, "아직 응답 전이라 남는다");
    assert!(session.acknowledge(&engine, "e1", 2).is_empty());
    assert!(session.pending().is_empty());
    assert_eq!(x_of(&session, "a"), 10.0);
}
