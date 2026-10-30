use serde_json::{json, Value};

use super::*;
use crate::document::SceneKinds;
use crate::test_support::{document, element, registry};

fn kind(json: Value) -> ValueKind {
    serde_json::from_value(json).unwrap()
}

fn violations(kind: &ValueKind, value: Value) -> Vec<ViolationCode> {
    let mut out = Vec::new();
    kind.validate(&value, "v", &NoReferences, &mut out);
    out.into_iter().map(|violation| violation.code).collect()
}

#[test]
fn 숫자는_범위와_정수를_쓰기에서_거부하고_읽기에서_고친다() {
    let number = kind(json!({ "type": "number", "min": 0, "max": 10, "integer": true }));
    assert!(violations(&number, json!(3)).is_empty());
    assert_eq!(
        violations(&number, json!(11)),
        vec![ViolationCode::ValueOutOfRange]
    );
    assert_eq!(
        violations(&number, json!(2.5)),
        vec![ViolationCode::ValueNotInteger]
    );
    assert_eq!(
        violations(&number, json!("3")),
        vec![ViolationCode::ValueTypeMismatch]
    );

    assert_eq!(number.normalize(&json!(11), &NoReferences), Some(json!(10)));
    assert_eq!(
        number.normalize(&json!(-1.2), &NoReferences),
        Some(json!(0))
    );
    assert_eq!(number.normalize(&json!(2.6), &NoReferences), Some(json!(3)));
    assert_eq!(number.normalize(&json!("x"), &NoReferences), None);
}

#[test]
fn 색은_hex와_rgb_rgba만_받는다() {
    let color = kind(json!({ "type": "color" }));
    for ok in [
        "#FFF",
        "#FFFF",
        "#00C3AE",
        "#00C3AE80",
        "rgba(20, 20, 24, 0.9)",
        "rgb(1,2,3)",
        "transparent",
    ] {
        assert!(violations(&color, json!(ok)).is_empty(), "{ok}");
    }
    for bad in ["", "#GGG", "red", "rgba(1,2)", "#12345"] {
        assert_eq!(
            violations(&color, json!(bad)),
            vec![ViolationCode::ValueInvalidColor],
            "{bad}"
        );
    }
}

#[test]
fn 그라데이션은_정지점_개수와_위치를_본다() {
    let gradient = kind(json!({ "type": "gradient" }));
    let ok = json!({ "angle": 90, "stops": [{ "color": "#000", "pos": 0 }, { "color": "#FFF", "pos": 100 }] });
    assert!(violations(&gradient, ok.clone()).is_empty());
    let one = json!({ "angle": 90, "stops": [{ "color": "#000", "pos": 0 }] });
    assert_eq!(
        violations(&gradient, one.clone()),
        vec![ViolationCode::ValueInvalidGradient]
    );
    assert_eq!(gradient.normalize(&one, &NoReferences), None);

    let messy = json!({ "angle": "x", "stops": [
        { "color": "#000", "pos": -5 }, { "color": "bad", "pos": 50 }, { "color": "#FFF", "pos": 120 }
    ] });
    assert_eq!(
        gradient.normalize(&messy, &NoReferences),
        Some(
            json!({ "angle": 90.0, "stops": [{ "color": "#000", "pos": 0.0 }, { "color": "#FFF", "pos": 100.0 }] })
        )
    );
}

#[test]
fn 목록은_개수_상한과_중복을_보고_읽을_때는_항목을_빼서_고친다() {
    let list = kind(
        json!({ "type": "list", "maxItems": 2, "unique": true, "item": { "type": "string" } }),
    );
    assert_eq!(
        violations(&list, json!(["a", "b", "c"])),
        vec![ViolationCode::ValueTooManyItems]
    );
    assert_eq!(
        violations(&list, json!(["a", "a"])),
        vec![ViolationCode::ValueDuplicateItem]
    );
    assert_eq!(
        list.normalize(&json!(["a", 1, "a", "b", "c"]), &NoReferences),
        Some(json!(["a", "b"]))
    );
}

#[test]
fn 목록_안_객체의_id는_겹칠_수_없다() {
    let list = kind(
        json!({ "type": "list", "item": { "type": "object", "fields": [
        { "name": "poseId", "value": { "type": "id" }, "default": "" }
    ] } }),
    );
    assert_eq!(
        violations(&list, json!([{ "poseId": "a" }, { "poseId": "a" }])),
        vec![ViolationCode::DuplicateId]
    );
}

#[test]
fn 요소_참조는_장면에_있는_허용_종류만_가리킨다() {
    let doc = document(vec![
        crate::document::Node::Element(element("p1", "pad", json!({}))),
        crate::document::Node::Element(element("d1", "dial", crate::test_support::dial_values())),
    ]);
    let scope: SceneKinds = doc.scenes["tab"].kind_index();
    let reference = kind(json!({ "type": "elementRef", "kinds": ["pad"] }));
    let mut out = Vec::new();
    reference.validate(&json!("p1"), "v", &scope, &mut out);
    assert!(out.is_empty());
    reference.validate(&json!("d1"), "v", &scope, &mut out);
    reference.validate(&json!("missing"), "v", &scope, &mut out);
    // 다른 종류를 가리키면 막고, 없는 요소(끊긴 참조)는 허용한다
    let codes: Vec<_> = out.iter().map(|violation| violation.code).collect();
    assert_eq!(codes, vec![ViolationCode::ReferenceWrongKind]);
    assert_eq!(reference.normalize(&json!("missing"), &scope), None);
}

#[test]
fn 칸_묶음_쓰기는_새_모르는_칸을_막고_저장돼_있던_모르는_칸은_보존한다() {
    let schema = registry().get("dial").unwrap().clone();
    let mut values = schema.default_values();
    values.insert("future".into(), json!(1));
    let mut out = Vec::new();
    validate_fields(
        &schema.fields,
        &values,
        None,
        "values",
        &NoReferences,
        &mut out,
    );
    assert_eq!(
        out,
        vec![Violation::new(ViolationCode::UnknownField, "values.future")]
    );

    let mut out = Vec::new();
    validate_fields(
        &schema.fields,
        &values,
        Some(&values),
        "values",
        &NoReferences,
        &mut out,
    );
    assert!(out.is_empty());
}

#[test]
fn 조건이_안_맞는_칸은_검사하지_않고_보존한다() {
    let schema = registry().get("dial").unwrap().clone();
    let mut values = schema.default_values();
    values.insert("slideLength".into(), json!(9999));
    let mut out = Vec::new();
    validate_fields(
        &schema.fields,
        &values,
        None,
        "values",
        &NoReferences,
        &mut out,
    );
    assert!(out.is_empty(), "spin 모드에서는 slideLength를 보지 않는다");

    values.insert("mode".into(), json!("slide"));
    validate_fields(
        &schema.fields,
        &values,
        None,
        "values",
        &NoReferences,
        &mut out,
    );
    assert_eq!(
        out,
        vec![Violation::new(
            ViolationCode::ValueOutOfRange,
            "values.slideLength"
        )]
    );

    let (normalized, repaired) = normalize_fields(&schema.fields, &values, &NoReferences);
    assert_eq!(normalized["slideLength"], json!(500));
    assert_eq!(repaired, vec!["slideLength".to_string()]);
}

#[test]
fn 읽기_정리는_빠진_칸을_기본값으로_채우고_모르는_칸을_남긴다() {
    let schema = registry().get("dial").unwrap().clone();
    let values = json!({ "sensitivity": 99, "future": "keep" });
    let (normalized, repaired) =
        normalize_fields(&schema.fields, values.as_object().unwrap(), &NoReferences);
    assert_eq!(normalized["sensitivity"], json!(10.0));
    assert_eq!(normalized["mode"], json!("spin"));
    assert_eq!(normalized["future"], json!("keep"));
    assert_eq!(repaired, vec!["sensitivity".to_string()]);
}

#[test]
fn null은_nullable_칸에만_허용한다() {
    let schema = registry().get("dial").unwrap().clone();
    let mut values = schema.default_values();
    values.insert("color".into(), Value::Null);
    let mut out = Vec::new();
    validate_fields(
        &schema.fields,
        &values,
        None,
        "values",
        &NoReferences,
        &mut out,
    );
    assert_eq!(
        out,
        vec![Violation::new(
            ViolationCode::ValueNotNullable,
            "values.color"
        )]
    );
}

#[test]
fn 값_방문은_목록과_객체_안까지_내려간다() {
    let schema = registry().get("dial").unwrap().clone();
    let mut values = schema.default_values();
    values.insert("target".into(), json!("p1"));
    values.insert(
        "poses".into(),
        json!([{ "poseId": "a", "triggers": ["p2", "p3"] }]),
    );
    let mut refs = Vec::new();
    visit_values(&schema.fields, &values, &mut |kind, value| {
        if matches!(kind, ValueKind::ElementRef { .. }) {
            refs.push(value.clone());
        }
    });
    assert_eq!(refs, vec![json!("p1"), json!("p2"), json!("p3")]);
}

#[test]
fn 그라데이션_정리는_맞는_값의_표기와_모르는_칸을_지킨다() {
    let gradient = kind(json!({ "type": "gradient" }));
    let ok = json!({ "angle": 90, "stops": [{ "color": "#000", "pos": 0, "future": 1 }, { "color": "#FFF", "pos": 100 }] });
    assert_eq!(gradient.normalize(&ok, &NoReferences), Some(ok));
}

#[test]
fn 안쪽_객체에_저장돼_있던_모르는_칸도_보존용으로_허용한다() {
    let rules: Vec<FieldRule> = serde_json::from_value(json!([
        { "name": "n", "value": { "type": "number" }, "default": 0 },
        { "name": "o", "value": { "type": "object", "fields": [
            { "name": "a", "value": { "type": "bool" }, "default": false }
        ] }, "default": { "a": false } }
    ]))
    .unwrap();
    let previous = json!({ "n": 1, "o": { "a": true, "future": 3 } });
    let next = json!({ "n": 5, "o": { "a": true, "future": 3 } });
    let mut out = Vec::new();
    validate_fields(
        &rules,
        next.as_object().unwrap(),
        previous.as_object(),
        "values",
        &NoReferences,
        &mut out,
    );
    assert!(out.is_empty(), "{out:?}");
    let fresh = json!({ "n": 5, "o": { "a": true, "future": 4 } });
    validate_fields(
        &rules,
        fresh.as_object().unwrap(),
        previous.as_object(),
        "values",
        &NoReferences,
        &mut out,
    );
    assert_eq!(
        out,
        vec![Violation::new(
            ViolationCode::UnknownField,
            "values.o.future"
        )]
    );
}
