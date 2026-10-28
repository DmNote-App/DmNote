//! 내장 기능 묶음 - 앱이 정하는 구조라 Rust에 원본을 둔다. 칸 이름은 지금 저장 형식과 같다.
//! 안쪽이 복잡한 값(카운터 설정, 노트 색 조합)은 앱의 Rust 타입이 따로 검사한다.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use serde_json::{json, Value};

use super::BundleCatalog;
use crate::value::{
    default_fields, normalize_fields, validate_fields, AssetKind, FieldRule, NoReferences,
    ValueKind, Violation,
};

pub const BUILTIN_BUNDLE_NAMES: [&str; 6] =
    ["surface", "font", "image", "note", "counter", "sound"];

fn rules(value: Value) -> Vec<FieldRule> {
    serde_json::from_value(value).expect("내장 묶음 규칙표")
}

fn nullable(name: &str, value: Value) -> Value {
    json!({ "name": name, "value": value, "default": null, "nullable": true })
}

fn shadow() -> Value {
    json!({ "type": "object", "fields": [
        { "name": "enabled", "value": { "type": "bool" }, "default": false },
        { "name": "color", "value": { "type": "color" }, "default": "#000000" },
        { "name": "offsetX", "value": { "type": "number", "min": -100, "max": 100 }, "default": 0 },
        { "name": "offsetY", "value": { "type": "number", "min": -100, "max": 100 }, "default": 0 },
        { "name": "blur", "value": { "type": "number", "min": 0, "max": 100 }, "default": 0 }
    ] })
}

fn image_transform() -> Value {
    json!({ "type": "object", "fields": [
        { "name": "offsetX", "value": { "type": "number", "min": -500, "max": 500 }, "default": 0 },
        { "name": "offsetY", "value": { "type": "number", "min": -500, "max": 500 }, "default": 0 },
        { "name": "rotation", "value": { "type": "number", "min": -180, "max": 180 }, "default": 0 },
        { "name": "scale", "value": { "type": "number", "min": 0.1, "max": 10 }, "default": 1 }
    ] })
}

fn image_fit() -> Value {
    json!({ "type": "enum", "options": ["cover", "contain", "fill", "none"] })
}

fn surface() -> Vec<FieldRule> {
    let color = json!({ "type": "color" });
    let gradient = json!({ "type": "gradient" });
    let size = json!({ "type": "number", "min": 0 });
    rules(json!([
        nullable("backgroundColor", color.clone()),
        nullable("backgroundGradient", gradient.clone()),
        nullable("activeBackgroundColor", color.clone()),
        nullable("activeBackgroundGradient", gradient.clone()),
        nullable("borderColor", color.clone()),
        nullable("borderGradient", gradient.clone()),
        nullable("activeBorderColor", color.clone()),
        nullable("activeBorderGradient", gradient),
        nullable("borderWidth", size.clone()),
        nullable("borderRadius", size),
        nullable("shadow", shadow()),
        nullable("activeShadow", shadow()),
    ]))
}

fn font() -> Vec<FieldRule> {
    let color = json!({ "type": "color" });
    let gradient = json!({ "type": "gradient" });
    let flag = json!({ "type": "bool" });
    rules(json!([
        nullable("fontSize", json!({ "type": "number", "min": 0 })),
        nullable("fontColor", color.clone()),
        nullable("fontGradient", gradient.clone()),
        nullable("activeFontColor", color),
        nullable("activeFontGradient", gradient),
        nullable("fontFamily", json!({ "type": "string" })),
        nullable(
            "fontWeight",
            json!({ "type": "number", "min": 1, "max": 1000, "integer": true })
        ),
        nullable("fontBold", flag.clone()),
        nullable("fontItalic", flag.clone()),
        nullable("fontUnderline", flag.clone()),
        nullable("fontStrikethrough", flag),
    ]))
}

fn image() -> Vec<FieldRule> {
    let file = json!({ "type": "file", "asset": "image" });
    rules(json!([
        nullable("activeImage", file.clone()),
        nullable("inactiveImage", file),
        nullable("imageFit", image_fit()),
        nullable("idleImageFit", image_fit()),
        nullable("activeImageFit", image_fit()),
        nullable("imageMode", json!({ "type": "enum", "options": ["replace", "overlay"] })),
        nullable("idleImageTransform", image_transform()),
        nullable("activeImageTransform", image_transform()),
        { "name": "activeTransparent", "value": { "type": "bool" }, "default": false },
        { "name": "idleTransparent", "value": { "type": "bool" }, "default": false }
    ]))
}

fn note() -> Vec<FieldRule> {
    let percent = json!({ "type": "number", "min": 0, "max": 100, "integer": true });
    let length = json!({ "type": "number" });
    let gradient = json!({ "type": "gradient" });
    let flag = json!({ "type": "bool" });
    rules(json!([
        // 단색 문자열 또는 {top, bottom} - 앱 타입이 검사
        { "name": "noteColor", "value": { "type": "json" }, "default": "#FFFFFF" },
        nullable("noteGradient", gradient.clone()),
        { "name": "noteOpacity", "value": percent, "default": 90 },
        nullable("noteOpacityTop", percent.clone()),
        nullable("noteOpacityBottom", percent.clone()),
        nullable("noteBorderRadius", length.clone()),
        nullable("noteWidth", length.clone()),
        { "name": "noteAlignment", "value": { "type": "enum", "options": ["left", "center", "right"] }, "default": "center" },
        { "name": "noteEffectEnabled", "value": flag, "default": true },
        { "name": "noteGlowEnabled", "value": flag, "default": false },
        { "name": "noteGlowSyncPaint", "value": flag, "default": false },
        { "name": "noteGlowSize", "value": { "type": "number", "min": 0 }, "default": 10 },
        { "name": "noteGlowOpacity", "value": percent, "default": 70 },
        nullable("noteGlowOpacityTop", percent.clone()),
        nullable("noteGlowOpacityBottom", percent.clone()),
        nullable("noteGlowColor", json!({ "type": "json" })),
        nullable("noteGlowGradient", gradient.clone()),
        { "name": "noteAutoYCorrection", "value": flag, "default": true },
        nullable("noteOffsetX", length.clone()),
        nullable("noteOffsetY", length.clone()),
        nullable("noteBorderWidth", length),
        nullable("noteBorderColor", json!({ "type": "color" })),
        nullable("noteBorderGradient", gradient),
        { "name": "noteBorderOpacity", "value": percent, "default": 100 },
        nullable("noteBorderSide", json!({ "type": "string" }))
    ]))
}

fn counter() -> Vec<FieldRule> {
    // 카운터 설정 전체 - 앱 타입(KeyCounterSettings)이 검사
    rules(json!([{ "name": "counter", "value": { "type": "json" }, "default": {} }]))
}

fn sound() -> Vec<FieldRule> {
    rules(json!([
        nullable("soundEnabled", json!({ "type": "bool" })),
        nullable("soundPath", json!({ "type": "file", "asset": "sound" })),
        nullable(
            "soundVolume",
            json!({ "type": "number", "min": 0, "max": 200 })
        ),
    ]))
}

fn catalog() -> &'static BTreeMap<&'static str, Vec<FieldRule>> {
    static CATALOG: OnceLock<BTreeMap<&'static str, Vec<FieldRule>>> = OnceLock::new();
    CATALOG.get_or_init(|| {
        BTreeMap::from([
            ("surface", surface()),
            ("font", font()),
            ("image", image()),
            ("note", note()),
            ("counter", counter()),
            ("sound", sound()),
        ])
    })
}

/// 내장 묶음 목록
pub struct BuiltinBundles;

impl BuiltinBundles {
    pub fn fields(name: &str) -> Option<&'static [FieldRule]> {
        catalog().get(name).map(Vec::as_slice)
    }
}

impl BundleCatalog for BuiltinBundles {
    fn knows(&self, name: &str) -> bool {
        catalog().contains_key(name)
    }

    fn default_value(&self, name: &str) -> Value {
        Self::fields(name).map_or(Value::Null, |fields| Value::Object(default_fields(fields)))
    }

    fn validate(
        &self,
        name: &str,
        value: &Value,
        previous: Option<&Value>,
        path: &str,
        out: &mut Vec<Violation>,
    ) {
        let Some(fields) = Self::fields(name) else {
            return;
        };
        let Some(object) = value.as_object() else {
            out.push(Violation::new(
                crate::value::ViolationCode::InvalidBundle,
                path,
            ));
            return;
        };
        validate_fields(
            fields,
            object,
            previous.and_then(Value::as_object),
            path,
            &NoReferences,
            out,
        );
    }

    fn normalize(&self, name: &str, value: &Value) -> Option<Value> {
        let fields = Self::fields(name)?;
        let object = value.as_object()?;
        Some(Value::Object(
            normalize_fields(fields, object, &NoReferences).0,
        ))
    }

    fn files<'a>(&self, name: &str, value: &'a Value, out: &mut Vec<(AssetKind, &'a str)>) {
        let (Some(fields), Some(object)) = (Self::fields(name), value.as_object()) else {
            return;
        };
        crate::value::visit_values(fields, object, &mut |kind, value| {
            if let (ValueKind::File { asset }, Some(path)) = (kind, value.as_str()) {
                out.push((*asset, path));
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 내장_묶음_기본값은_자기_규칙에_맞는다() {
        for name in BUILTIN_BUNDLE_NAMES {
            let value = BuiltinBundles.default_value(name);
            let mut out = Vec::new();
            BuiltinBundles.validate(name, &value, None, name, &mut out);
            assert!(out.is_empty(), "{name}: {out:?}");
        }
    }

    #[test]
    fn 묶음_안_파일_경로를_모은다() {
        let mut value = BuiltinBundles.default_value("image");
        value["activeImage"] = json!("images/a.png");
        let mut files = Vec::new();
        BuiltinBundles.files("image", &value, &mut files);
        assert_eq!(files, vec![(AssetKind::Image, "images/a.png")]);
    }
}
