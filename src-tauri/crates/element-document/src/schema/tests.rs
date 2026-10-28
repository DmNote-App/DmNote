use serde_json::json;

use super::*;

fn schema(extra: serde_json::Value) -> Result<KindSchema, String> {
    let mut base = json!({
        "kind": "sample",
        "version": 1,
        "defaultSize": { "width": 10, "height": 10 },
        "fallbackSize": { "width": 10, "height": 10 }
    });
    for (key, value) in extra.as_object().unwrap() {
        base[key] = value.clone();
    }
    let schema: KindSchema = serde_json::from_value(base).map_err(|error| error.to_string())?;
    schema.check().map_err(|error| error.message)?;
    Ok(schema)
}

#[test]
fn 옮기기는_1부터_빠짐없이_버전과_맞아야_한다() {
    assert!(schema(json!({ "version": 2, "migrations": [{ "from": 1, "steps": [] }] })).is_ok());
    assert!(schema(json!({ "version": 2 })).is_err());
    assert!(schema(json!({ "version": 3, "migrations": [{ "from": 1, "steps": [] }, { "from": 3, "steps": [] }] })).is_err());
    assert!(schema(json!({ "version": 0 })).is_err());
}

#[test]
fn 기본값이_규칙에_맞지_않으면_정의를_거부한다() {
    let error = schema(json!({ "fields": [
        { "name": "speed", "value": { "type": "number", "min": 1, "max": 5 }, "default": 9 }
    ] }))
    .unwrap_err();
    assert!(error.contains("speed"));
}

#[test]
fn 조건은_있는_칸만_가리킬_수_있다() {
    assert!(schema(json!({ "fields": [
        { "name": "a", "value": { "type": "bool" }, "default": true, "when": { "field": "missing", "equals": 1 } }
    ] }))
    .is_err());
}

#[test]
fn 칸_이름은_겹칠_수_없다() {
    assert!(schema(json!({ "fields": [
        { "name": "a", "value": { "type": "bool" }, "default": true },
        { "name": "a", "value": { "type": "bool" }, "default": false }
    ] }))
    .is_err());
}

#[test]
fn 모르는_정의_칸은_읽지_않는다() {
    assert!(schema(json!({ "render": "() => null" })).is_err());
    assert!(schema(json!({ "fields": [
        { "name": "a", "value": { "type": "bool", "extra": 1 }, "default": true }
    ] }))
    .is_err());
}

#[test]
fn 조건_문법은_데이터로_읽는다() {
    let condition: crate::condition::Condition = serde_json::from_value(json!({
        "all": [{ "field": "mode", "equals": "slide" }, { "not": { "field": "size", "oneOf": [1, 2] } }]
    }))
    .unwrap();
    let values = json!({ "mode": "slide", "size": 3 });
    assert!(condition.matches(values.as_object().unwrap()));
    let values = json!({ "mode": "slide", "size": 2 });
    assert!(!condition.matches(values.as_object().unwrap()));
}
