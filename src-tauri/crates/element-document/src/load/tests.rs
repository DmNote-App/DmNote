use serde_json::json;

use super::*;
use crate::bundles::NoBundles;
use crate::test_support::{dial_values, document, element, group, registry, Sequence};

fn loader(kinds: &KindRegistry) -> Loader<'_> {
    Loader {
        kinds,
        bundles: &NoBundles,
        managed_elsewhere: &|_| false,
    }
}

#[test]
fn 옛_버전_값을_선언대로_최신으로_옮긴다() {
    let kinds = registry();
    let mut doc = document(vec![Node::Element(element(
        "d",
        "dial",
        json!({ "speed": 1.40625, "color": "#000" }),
    ))]);
    doc.kind_versions.insert("dial".into(), 1);
    let report = loader(&kinds).load(&mut doc, &mut Sequence(0));
    let values = &doc.scenes["tab"].element("d").unwrap().values;
    assert_eq!(values["sensitivity"], json!(1.0));
    assert_eq!(values["mode"], json!("spin"));
    assert!(values.get("speed").is_none());
    assert_eq!(doc.kind_versions["dial"], 2);
    assert_eq!(report.migrated, vec![("dial".to_string(), 1, 2)]);
}

#[test]
fn 코드_훅이_필요한_종류는_옛_버전으로_보존하고_기다린다() {
    let mut kinds = registry();
    let mut schema = kinds.get("dial").unwrap().clone();
    schema.migrations[0].steps.push(MigrationStep::Hook {
        name: "splitSpeed".into(),
    });
    kinds.register(schema).unwrap();
    let mut doc = document(vec![Node::Element(element(
        "d",
        "dial",
        json!({ "speed": 3 }),
    ))]);
    doc.kind_versions.insert("dial".into(), 1);
    let report = loader(&kinds).load(&mut doc, &mut Sequence(0));
    assert_eq!(
        report.pending_hooks,
        vec![("dial".to_string(), "splitSpeed".to_string())]
    );
    assert_eq!(doc.kind_versions["dial"], 1);
    assert_eq!(
        doc.scenes["tab"].element("d").unwrap().values,
        *json!({ "speed": 3 }).as_object().unwrap()
    );

    // 편집 창이 훅을 돌린 결과는 새 규칙표로만 검사한다
    let bad = json!({ "sensitivity": 99 }).as_object().unwrap().clone();
    assert!(
        apply_hook_result(&kinds, &mut doc, "dial", &[("tab".into(), "d".into(), bad)]).is_err()
    );
    let mut good = dial_values().as_object().unwrap().clone();
    good.insert("sensitivity".into(), json!(3));
    assert_eq!(
        apply_hook_result(
            &kinds,
            &mut doc,
            "dial",
            &[("tab".into(), "d".into(), good)]
        ),
        Ok(2)
    );
    assert_eq!(doc.kind_versions["dial"], 2);
    assert_eq!(
        doc.scenes["tab"].element("d").unwrap().values["sensitivity"],
        json!(3)
    );
}

#[test]
fn 앱보다_새_버전과_모르는_종류는_건드리지_않는다() {
    let kinds = registry();
    let newer = element("d", "dial", json!({ "sensitivity": 999, "brandNew": true }));
    let unknown = element("x", "gone", json!({ "anything": [1, 2] }));
    let mut doc = document(vec![
        Node::Element(newer.clone()),
        Node::Element(unknown.clone()),
    ]);
    doc.kind_versions.insert("dial".into(), 7);
    let report = loader(&kinds).load(&mut doc, &mut Sequence(0));
    assert_eq!(doc.scenes["tab"].element("d").unwrap(), &newer);
    assert_eq!(doc.scenes["tab"].element("x").unwrap(), &unknown);
    assert_eq!(report.locked_kinds, vec!["dial".to_string()]);
    assert_eq!(report.unknown_kinds, vec!["gone".to_string()]);
    assert_eq!(doc.kind_versions["dial"], 7);
}

#[test]
fn 겹친_id는_뒤에_나온_쪽을_새로_발급한다() {
    let kinds = registry();
    let mut doc = document(vec![
        Node::Element(element("a", "pad", json!({}))),
        group("g", vec![Node::Element(element("a", "pad", json!({})))]),
        Node::Element(element("", "pad", json!({}))),
    ]);
    let report = loader(&kinds).load(&mut doc, &mut Sequence(0));
    assert_eq!(
        report.reissued,
        vec![
            ("tab".to_string(), "a".to_string(), "new-1".to_string()),
            ("tab".to_string(), String::new(), "new-2".to_string())
        ]
    );
}

#[test]
fn 값과_위치를_너그럽게_고치고_고친_요소를_알린다() {
    let kinds = registry();
    let mut broken = element(
        "d",
        "dial",
        json!({ "sensitivity": "fast", "target": "missing", "future": 1 }),
    );
    broken.frame.width = -3.0;
    broken.frame.rotation = 400.0;
    let mut doc = document(vec![
        Node::Element(broken),
        Node::Element(element("p", "pad", json!({}))),
    ]);
    let report = loader(&kinds).load(&mut doc, &mut Sequence(0));
    let element = doc.scenes["tab"].element("d").unwrap();
    assert_eq!(element.values["sensitivity"], json!(1));
    assert_eq!(element.values["target"], json!(null));
    assert_eq!(element.values["future"], json!(1));
    assert_eq!(element.frame.width, 80.0);
    assert_eq!(element.frame.rotation, 180.0);
    assert_eq!(report.repaired, vec![("tab".to_string(), "d".to_string())]);
    assert!(report.changed());

    // 두 번째 읽기는 고칠 것이 없다
    let report = loader(&kinds).load(&mut doc, &mut Sequence(10));
    assert!(!report.changed());
}

#[test]
fn 받지_않는_입력은_떼어_낸다() {
    let kinds = registry();
    let mut wrong = element("d", "dial", dial_values());
    wrong.input = Some(crate::document::InputBinding::Key { slot: json!("A") });
    let mut doc = document(vec![Node::Element(wrong)]);
    loader(&kinds).load(&mut doc, &mut Sequence(0));
    assert_eq!(doc.scenes["tab"].element("d").unwrap().input, None);
}

#[test]
fn 다른_곳에서_관리하는_종류는_값도_id도_건드리지_않는다() {
    let kinds = registry();
    let broken = element("a", "dial", json!({ "sensitivity": "fast" }));
    let mut doc = document(vec![
        Node::Element(element("a", "pad", json!({}))),
        Node::Element(broken.clone()),
    ]);
    let loader = Loader {
        kinds: &kinds,
        bundles: &NoBundles,
        managed_elsewhere: &|kind| kind == "dial",
    };
    let report = loader.load(&mut doc, &mut Sequence(0));
    // 겹친 id는 관리되지 않는 쪽(pad)을 새로 발급한다
    assert_eq!(
        report.reissued,
        vec![("tab".to_string(), "a".to_string(), "new-1".to_string())]
    );
    assert_eq!(doc.scenes["tab"].element("a").unwrap(), &broken);
}
