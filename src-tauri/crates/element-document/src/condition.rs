//! 다른 칸 값에 따라 달라지는 규칙의 조건 - 백엔드가 읽어야 하므로 함수가 아니라 데이터로 적는다

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub enum Condition {
    Equals(EqualsCondition),
    OneOf(OneOfCondition),
    All(AllCondition),
    Any(AnyCondition),
    Not(NotCondition),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct EqualsCondition {
    pub field: String,
    pub equals: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct OneOfCondition {
    pub field: String,
    pub one_of: Vec<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct AllCondition {
    pub all: Vec<Condition>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct AnyCondition {
    pub any: Vec<Condition>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct NotCondition {
    pub not: Box<Condition>,
}

impl Condition {
    pub fn matches(&self, object: &Map<String, Value>) -> bool {
        match self {
            Condition::Equals(condition) => object.get(&condition.field) == Some(&condition.equals),
            Condition::OneOf(condition) => object
                .get(&condition.field)
                .is_some_and(|value| condition.one_of.contains(value)),
            Condition::All(condition) => condition.all.iter().all(|inner| inner.matches(object)),
            Condition::Any(condition) => condition.any.iter().any(|inner| inner.matches(object)),
            Condition::Not(condition) => !condition.not.matches(object),
        }
    }

    // 조건이 가리키는 칸 이름 - 정의 검사에서 없는 칸을 막는다
    pub fn fields(&self) -> Vec<&str> {
        match self {
            Condition::Equals(condition) => vec![condition.field.as_str()],
            Condition::OneOf(condition) => vec![condition.field.as_str()],
            Condition::All(condition) => condition.all.iter().flat_map(Condition::fields).collect(),
            Condition::Any(condition) => condition.any.iter().flat_map(Condition::fields).collect(),
            Condition::Not(condition) => condition.not.fields(),
        }
    }
}
