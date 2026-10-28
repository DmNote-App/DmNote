//! 규칙표의 값 종류 - 칸 하나가 받을 수 있는 값과 읽기·쓰기 규칙
//!
//! 쓰기는 엄격하게(어긋나면 거부), 읽기는 너그럽게(값 종류 단위로 고치고 모르는 칸은 보존) 한다.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::condition::Condition;

pub const MAX_GRADIENT_STOPS: usize = 8;
pub const MIN_GRADIENT_STOPS: usize = 2;
pub const DEFAULT_GRADIENT_ANGLE: f64 = 90.0;
pub const MAX_COLOR_LENGTH: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub enum AssetKind {
    Image,
    Sound,
    Font,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub enum ValueKind {
    Bool {},
    #[serde(rename_all = "camelCase")]
    Number {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        min: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        max: Option<f64>,
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        integer: bool,
    },
    #[serde(rename_all = "camelCase")]
    String {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        max_length: Option<usize>,
    },
    Enum {
        options: Vec<String>,
    },
    Color {},
    Gradient {},
    File {
        asset: AssetKind,
    },
    // 같은 장면의 다른 요소 id
    ElementRef {
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        kinds: Vec<String>,
    },
    // 목록 안에서 항목을 가리키는 안정 id (스프라이트 포즈 등)
    Id {},
    #[serde(rename_all = "camelCase")]
    List {
        item: Box<ValueKind>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        max_items: Option<usize>,
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        unique: bool,
    },
    Object {
        fields: Vec<FieldRule>,
    },
    // 앱 구조(기능 묶음) 전용 - 안쪽 모양은 앱의 Rust 타입이 검사한다. 종류 정의에는 못 쓴다
    Json {},
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct FieldRule {
    pub name: String,
    pub value: ValueKind,
    pub default: Value,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub nullable: bool,
    // 조건이 맞을 때만 이 규칙으로 검사한다. 안 맞으면 값은 검사 없이 보존
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<Condition>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct Violation {
    pub code: ViolationCode,
    pub path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub enum ViolationCode {
    ValueTypeMismatch,
    ValueOutOfRange,
    ValueNotInteger,
    ValueUnknownOption,
    ValueTooLong,
    ValueTooManyItems,
    ValueDuplicateItem,
    ValueNotNullable,
    ValueInvalidColor,
    ValueInvalidGradient,
    UnknownField,
    ReferenceNotFound,
    ReferenceWrongKind,
    DuplicateId,
    ElementNotFound,
    GroupNotFound,
    UnknownKind,
    KindVersionLocked,
    InvalidFrame,
    InvalidBundle,
    BundleNotAllowed,
    InvalidInput,
    InvalidMove,
    SceneNotFound,
}

impl Violation {
    pub fn new(code: ViolationCode, path: impl Into<String>) -> Self {
        Self {
            code,
            path: path.into(),
        }
    }
}

// 참조 검사에 필요한 장면 정보 - 엔진이 문서에서 만들어 넘긴다
pub trait ReferenceScope {
    fn kind_of(&self, element_id: &str) -> Option<&str>;
}

pub struct NoReferences;

impl ReferenceScope for NoReferences {
    fn kind_of(&self, _element_id: &str) -> Option<&str> {
        None
    }
}

pub(crate) fn join_path(base: &str, name: &str) -> String {
    if base.is_empty() {
        name.to_string()
    } else {
        format!("{base}.{name}")
    }
}

pub fn is_valid_color(value: &str) -> bool {
    let value = value.trim();
    if value.is_empty() || value.len() > MAX_COLOR_LENGTH {
        return false;
    }
    if let Some(hex) = value.strip_prefix('#') {
        return matches!(hex.len(), 3 | 4 | 6 | 8) && hex.chars().all(|c| c.is_ascii_hexdigit());
    }
    if value.eq_ignore_ascii_case("transparent") {
        return true;
    }
    let lower = value.to_ascii_lowercase();
    let inner = lower
        .strip_prefix("rgba(")
        .or_else(|| lower.strip_prefix("rgb("))
        .and_then(|rest| rest.strip_suffix(')'));
    let Some(inner) = inner else {
        return false;
    };
    let parts: Vec<&str> = inner.split(',').map(str::trim).collect();
    matches!(parts.len(), 3 | 4) && parts.iter().all(|part| part.parse::<f64>().is_ok())
}

fn gradient_violation(value: &Value) -> bool {
    let Some(object) = value.as_object() else {
        return true;
    };
    if !object
        .get("angle")
        .is_some_and(|angle| angle.as_f64().is_some_and(f64::is_finite))
    {
        return true;
    }
    let Some(stops) = object.get("stops").and_then(Value::as_array) else {
        return true;
    };
    if !(MIN_GRADIENT_STOPS..=MAX_GRADIENT_STOPS).contains(&stops.len()) {
        return true;
    }
    stops.iter().any(|stop| {
        let color_ok = stop
            .get("color")
            .and_then(Value::as_str)
            .is_some_and(is_valid_color);
        let pos_ok = stop
            .get("pos")
            .and_then(Value::as_f64)
            .is_some_and(|pos| (0.0..=100.0).contains(&pos));
        !(color_ok && pos_ok)
    })
}

fn normalize_gradient(value: &Value) -> Option<Value> {
    let object = value.as_object()?;
    let angle = object
        .get("angle")
        .and_then(Value::as_f64)
        .filter(|angle| angle.is_finite())
        .unwrap_or(DEFAULT_GRADIENT_ANGLE);
    let stops: Vec<Value> = object
        .get("stops")?
        .as_array()?
        .iter()
        .filter_map(|stop| {
            let color = stop.get("color")?.as_str().filter(|c| is_valid_color(c))?;
            let pos = stop.get("pos")?.as_f64()?.clamp(0.0, 100.0);
            Some(serde_json::json!({ "color": color, "pos": pos }))
        })
        .take(MAX_GRADIENT_STOPS)
        .collect();
    if stops.len() < MIN_GRADIENT_STOPS {
        return None;
    }
    let mut next = object.clone();
    next.insert("angle".into(), angle.into());
    next.insert("stops".into(), Value::Array(stops));
    Some(Value::Object(next))
}

fn number_of(value: &Value) -> Option<f64> {
    value.as_f64().filter(|number| number.is_finite())
}

fn number_value(number: f64, integer: bool) -> Value {
    if integer {
        let rounded = number.round();
        if rounded >= 0.0 && rounded <= u64::MAX as f64 {
            return Value::from(rounded as u64);
        }
        if rounded >= i64::MIN as f64 {
            return Value::from(rounded as i64);
        }
    }
    serde_json::Number::from_f64(number)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

impl ValueKind {
    /// 쓰기 검사 - 어긋난 곳을 모두 모은다
    pub fn validate(
        &self,
        value: &Value,
        path: &str,
        scope: &dyn ReferenceScope,
        out: &mut Vec<Violation>,
    ) {
        match self {
            ValueKind::Bool {} => {
                if !value.is_boolean() {
                    out.push(Violation::new(ViolationCode::ValueTypeMismatch, path));
                }
            }
            ValueKind::Number { min, max, integer } => {
                let Some(number) = number_of(value) else {
                    out.push(Violation::new(ViolationCode::ValueTypeMismatch, path));
                    return;
                };
                if *integer && number.fract() != 0.0 {
                    out.push(Violation::new(ViolationCode::ValueNotInteger, path));
                }
                if min.is_some_and(|min| number < min) || max.is_some_and(|max| number > max) {
                    out.push(Violation::new(ViolationCode::ValueOutOfRange, path));
                }
            }
            ValueKind::String { max_length } => match value.as_str() {
                None => out.push(Violation::new(ViolationCode::ValueTypeMismatch, path)),
                Some(text) => {
                    if max_length.is_some_and(|max| text.chars().count() > max) {
                        out.push(Violation::new(ViolationCode::ValueTooLong, path));
                    }
                }
            },
            ValueKind::Enum { options } => match value.as_str() {
                None => out.push(Violation::new(ViolationCode::ValueTypeMismatch, path)),
                Some(text) => {
                    if !options.iter().any(|option| option == text) {
                        out.push(Violation::new(ViolationCode::ValueUnknownOption, path));
                    }
                }
            },
            ValueKind::Color {} => match value.as_str() {
                None => out.push(Violation::new(ViolationCode::ValueTypeMismatch, path)),
                Some(text) => {
                    if !is_valid_color(text) {
                        out.push(Violation::new(ViolationCode::ValueInvalidColor, path));
                    }
                }
            },
            ValueKind::Gradient {} => {
                if gradient_violation(value) {
                    out.push(Violation::new(ViolationCode::ValueInvalidGradient, path));
                }
            }
            ValueKind::File { .. } | ValueKind::Id {} => {
                if !value.is_string() {
                    out.push(Violation::new(ViolationCode::ValueTypeMismatch, path));
                }
            }
            ValueKind::ElementRef { kinds } => match value.as_str() {
                None => out.push(Violation::new(ViolationCode::ValueTypeMismatch, path)),
                Some(id) => match scope.kind_of(id) {
                    None => out.push(Violation::new(ViolationCode::ReferenceNotFound, path)),
                    Some(kind) => {
                        if !kinds.is_empty() && !kinds.iter().any(|allowed| allowed == kind) {
                            out.push(Violation::new(ViolationCode::ReferenceWrongKind, path));
                        }
                    }
                },
            },
            ValueKind::List {
                item,
                max_items,
                unique,
            } => {
                let Some(items) = value.as_array() else {
                    out.push(Violation::new(ViolationCode::ValueTypeMismatch, path));
                    return;
                };
                if max_items.is_some_and(|max| items.len() > max) {
                    out.push(Violation::new(ViolationCode::ValueTooManyItems, path));
                }
                if *unique || matches!(**item, ValueKind::Id {}) {
                    for (index, value) in items.iter().enumerate() {
                        if items[..index].contains(value) {
                            out.push(Violation::new(
                                ViolationCode::ValueDuplicateItem,
                                format!("{path}[{index}]"),
                            ));
                        }
                    }
                }
                for (index, value) in items.iter().enumerate() {
                    item.validate(value, &format!("{path}[{index}]"), scope, out);
                }
                if let ValueKind::Object { fields } = &**item {
                    validate_item_ids(fields, items, path, out);
                }
            }
            ValueKind::Object { fields } => match value.as_object() {
                None => out.push(Violation::new(ViolationCode::ValueTypeMismatch, path)),
                Some(object) => validate_fields(fields, object, None, path, scope, out),
            },
            ValueKind::Json {} => {}
        }
    }

    /// 읽기 정리 - 고칠 수 있으면 고친 값, 못 고치면 None(기본값으로 대체)
    pub fn normalize(&self, value: &Value, scope: &dyn ReferenceScope) -> Option<Value> {
        match self {
            ValueKind::Bool {} => value.as_bool().map(Value::Bool),
            ValueKind::Number { min, max, integer } => {
                let original = number_of(value)?;
                let mut number = original;
                if let Some(min) = min {
                    number = number.max(*min);
                }
                if let Some(max) = max {
                    number = number.min(*max);
                }
                if *integer {
                    number = number.round();
                }
                // 고칠 것이 없으면 원래 표기(1과 1.0)를 지킨다
                if number == original {
                    return Some(value.clone());
                }
                Some(number_value(number, *integer))
            }
            ValueKind::String { max_length } => {
                let text = value.as_str()?;
                Some(Value::String(match max_length {
                    Some(max) => text.chars().take(*max).collect(),
                    None => text.to_string(),
                }))
            }
            ValueKind::Enum { options } => value
                .as_str()
                .filter(|text| options.iter().any(|option| option == text))
                .map(|text| Value::String(text.to_string())),
            ValueKind::Color {} => value
                .as_str()
                .filter(|text| is_valid_color(text))
                .map(|text| Value::String(text.to_string())),
            ValueKind::Gradient {} => normalize_gradient(value),
            ValueKind::File { .. } | ValueKind::Id {} => {
                value.as_str().map(|text| Value::String(text.to_string()))
            }
            ValueKind::ElementRef { kinds } => {
                let id = value.as_str()?;
                let kind = scope.kind_of(id)?;
                (kinds.is_empty() || kinds.iter().any(|allowed| allowed == kind))
                    .then(|| Value::String(id.to_string()))
            }
            ValueKind::List {
                item,
                max_items,
                unique,
            } => {
                let items = value.as_array()?;
                let mut next: Vec<Value> = Vec::with_capacity(items.len());
                for value in items {
                    // 목록 항목은 못 고치면 빼낸다 - 목록 길이는 다른 칸과 묶이지 않는다
                    let Some(value) = item.normalize(value, scope) else {
                        continue;
                    };
                    if (*unique || matches!(**item, ValueKind::Id {})) && next.contains(&value) {
                        continue;
                    }
                    next.push(value);
                    if max_items.is_some_and(|max| next.len() >= max) {
                        break;
                    }
                }
                Some(Value::Array(next))
            }
            ValueKind::Object { fields } => {
                let object = value.as_object()?;
                Some(Value::Object(normalize_fields(fields, object, scope).0))
            }
            ValueKind::Json {} => Some(value.clone()),
        }
    }
}

// 같은 목록 안 항목 id 중복 금지
fn validate_item_ids(fields: &[FieldRule], items: &[Value], path: &str, out: &mut Vec<Violation>) {
    for field in fields
        .iter()
        .filter(|field| field.value == ValueKind::Id {})
    {
        let ids: Vec<Option<&Value>> = items.iter().map(|item| item.get(&field.name)).collect();
        for (index, id) in ids.iter().enumerate() {
            if id.is_some() && ids[..index].contains(id) {
                out.push(Violation::new(
                    ViolationCode::DuplicateId,
                    format!("{path}[{index}].{}", field.name),
                ));
            }
        }
    }
}

/// 칸 묶음 쓰기 검사. `previous`에 이미 있던 모르는 칸은 보존용이라 허용한다
pub fn validate_fields(
    fields: &[FieldRule],
    object: &Map<String, Value>,
    previous: Option<&Map<String, Value>>,
    path: &str,
    scope: &dyn ReferenceScope,
    out: &mut Vec<Violation>,
) {
    for (name, value) in object {
        let field_path = join_path(path, name);
        let Some(rule) = fields.iter().find(|rule| &rule.name == name) else {
            let preserved = previous.is_some_and(|previous| previous.get(name) == Some(value));
            if !preserved {
                out.push(Violation::new(ViolationCode::UnknownField, field_path));
            }
            continue;
        };
        if let Some(condition) = &rule.when {
            if !condition.matches(object) {
                continue;
            }
        }
        if value.is_null() {
            if !rule.nullable {
                out.push(Violation::new(ViolationCode::ValueNotNullable, field_path));
            }
            continue;
        }
        rule.value.validate(value, &field_path, scope, out);
    }
}

/// 칸 묶음 읽기 정리. 빠진 칸은 기본값으로 채우고 모르는 칸은 그대로 둔다.
/// 두 번째 값은 고친 칸 이름 목록
pub fn normalize_fields(
    fields: &[FieldRule],
    object: &Map<String, Value>,
    scope: &dyn ReferenceScope,
) -> (Map<String, Value>, Vec<String>) {
    let mut next = object.clone();
    let mut repaired = Vec::new();
    for rule in fields {
        let current = object.get(&rule.name);
        if let Some(condition) = &rule.when {
            if !condition.matches(object) {
                continue;
            }
        }
        let normalized = match current {
            None => None,
            Some(Value::Null) if rule.nullable => Some(Value::Null),
            Some(value) => rule.value.normalize(value, scope),
        };
        match normalized {
            Some(value) => {
                if current != Some(&value) {
                    repaired.push(rule.name.clone());
                }
                next.insert(rule.name.clone(), value);
            }
            None => {
                if current.is_some() {
                    repaired.push(rule.name.clone());
                }
                next.insert(rule.name.clone(), rule.default.clone());
            }
        }
    }
    (next, repaired)
}

/// 규칙표 기본값으로 채운 새 칸 묶음
pub fn default_fields(fields: &[FieldRule]) -> Map<String, Value> {
    fields
        .iter()
        .map(|rule| (rule.name.clone(), rule.default.clone()))
        .collect()
}

/// 규칙표에서 값 종류를 찾아 경로마다 호출 - 파일 보호·참조 고치기에 쓴다
pub fn visit_values<'a>(
    fields: &'a [FieldRule],
    object: &'a Map<String, Value>,
    visitor: &mut dyn FnMut(&'a ValueKind, &'a Value),
) {
    for rule in fields {
        let Some(value) = object.get(&rule.name) else {
            continue;
        };
        visit_value(&rule.value, value, visitor);
    }
}

fn visit_value<'a>(
    kind: &'a ValueKind,
    value: &'a Value,
    visitor: &mut dyn FnMut(&'a ValueKind, &'a Value),
) {
    match kind {
        ValueKind::List { item, .. } => {
            for value in value.as_array().into_iter().flatten() {
                visit_value(item, value, visitor);
            }
        }
        ValueKind::Object { fields } => {
            if let Some(object) = value.as_object() {
                visit_values(fields, object, visitor);
            }
        }
        _ => visitor(kind, value),
    }
}

/// 값 종류가 `target`과 맞는 칸을 고쳐 쓴다 - 참조 다시 잇기, 파일 경로 고치기
pub fn rewrite_values(
    fields: &[FieldRule],
    object: &mut Map<String, Value>,
    rewrite: &mut dyn FnMut(&ValueKind, &mut Value) -> bool,
) -> bool {
    let mut changed = false;
    for rule in fields {
        if let Some(value) = object.get_mut(&rule.name) {
            changed |= rewrite_value(&rule.value, value, rewrite);
        }
    }
    changed
}

fn rewrite_value(
    kind: &ValueKind,
    value: &mut Value,
    rewrite: &mut dyn FnMut(&ValueKind, &mut Value) -> bool,
) -> bool {
    match kind {
        ValueKind::List { item, .. } => {
            let mut changed = false;
            if let Some(items) = value.as_array_mut() {
                for value in items {
                    changed |= rewrite_value(item, value, rewrite);
                }
            }
            changed
        }
        ValueKind::Object { fields } => value
            .as_object_mut()
            .is_some_and(|object| rewrite_values(fields, object, rewrite)),
        _ => rewrite(kind, value),
    }
}

#[cfg(test)]
mod tests;
