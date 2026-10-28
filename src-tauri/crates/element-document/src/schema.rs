//! 종류 정의 중 백엔드가 읽는 부분 - 규칙표, 쓰는 기능 묶음, 입력, 크기, 옮기는 방법

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::value::{FieldRule, NoReferences, ValueKind, Violation};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KindSchema {
    pub kind: String,
    pub version: u32,
    #[serde(default)]
    pub fields: Vec<FieldRule>,
    #[serde(default)]
    pub bundles: Vec<String>,
    // 받을 수 있는 입력 종류 (keySlot, axis, pointer 등)
    #[serde(default)]
    pub inputs: Vec<String>,
    pub default_size: Size,
    pub fallback_size: Size,
    #[serde(default = "default_true")]
    pub rotatable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_per_scene: Option<usize>,
    #[serde(default)]
    pub migrations: Vec<KindMigration>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KindMigration {
    // 이 버전에서 다음 버전으로 옮긴다
    pub from: u32,
    pub steps: Vec<MigrationStep>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", deny_unknown_fields)]
pub enum MigrationStep {
    Rename {
        from: String,
        to: String,
    },
    MapValue {
        field: String,
        from: Value,
        to: Value,
    },
    SetDefault {
        field: String,
        value: Value,
    },
    Remove {
        field: String,
    },
    // 선언으로 못 옮기는 경우 - 편집 창이 종류 코드의 훅을 돌려 결과를 저장한다
    Hook {
        name: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefinitionError {
    pub kind: String,
    pub message: String,
}

impl KindSchema {
    pub fn field(&self, name: &str) -> Option<&FieldRule> {
        self.fields.iter().find(|rule| rule.name == name)
    }

    pub fn default_values(&self) -> Map<String, Value> {
        crate::value::default_fields(&self.fields)
    }

    pub fn uses_bundle(&self, name: &str) -> bool {
        self.bundles.iter().any(|bundle| bundle == name)
    }

    pub fn accepts_input(&self, input_type: &str) -> bool {
        self.inputs.iter().any(|input| input == input_type)
    }

    /// 정의 자체의 일관성 검사 - 빌드·등록 때 돈다
    pub fn check(&self) -> Result<(), DefinitionError> {
        let error = |message: String| DefinitionError {
            kind: self.kind.clone(),
            message,
        };
        if self.kind.trim().is_empty() {
            return Err(error("종류 이름이 비어 있음".into()));
        }
        if self.version == 0 {
            return Err(error("버전은 1부터".into()));
        }
        check_fields(&self.fields).map_err(error)?;
        for (index, migration) in self.migrations.iter().enumerate() {
            if migration.from != index as u32 + 1 {
                return Err(error(format!(
                    "옮기기는 1부터 빠짐없이 이어져야 함 (index {index}, from {})",
                    migration.from
                )));
            }
        }
        if self.migrations.len() as u32 + 1 != self.version {
            return Err(error(format!(
                "버전 {}에는 옮기기 {}개가 필요",
                self.version,
                self.version - 1
            )));
        }
        Ok(())
    }
}

fn check_fields(fields: &[FieldRule]) -> Result<(), String> {
    for (index, rule) in fields.iter().enumerate() {
        if rule.name.is_empty() {
            return Err("칸 이름이 비어 있음".into());
        }
        if fields[..index].iter().any(|other| other.name == rule.name) {
            return Err(format!("칸 이름 중복: {}", rule.name));
        }
        if let Some(condition) = &rule.when {
            for field in condition.fields() {
                if !fields.iter().any(|other| other.name == field) {
                    return Err(format!("{}의 조건이 없는 칸 {field}을 가리킴", rule.name));
                }
            }
        }
        if !(rule.default.is_null() && rule.nullable) {
            let mut violations: Vec<Violation> = Vec::new();
            // 참조 기본값은 비워 두는 것만 허용
            if matches!(rule.value, ValueKind::ElementRef { .. }) {
                return Err(format!(
                    "{}: 요소 참조 칸은 기본값이 null이어야 함",
                    rule.name
                ));
            }
            rule.value
                .validate(&rule.default, &rule.name, &NoReferences, &mut violations);
            if !violations.is_empty() {
                return Err(format!("{}: 기본값이 규칙에 맞지 않음", rule.name));
            }
        }
        match &rule.value {
            ValueKind::Object { fields } => check_fields(fields)?,
            ValueKind::List { item, .. } => {
                if let ValueKind::Object { fields } = &**item {
                    check_fields(fields)?;
                }
            }
            ValueKind::Json {} => {
                return Err(format!("{}: json 값 종류는 앱 구조 전용", rule.name));
            }
            ValueKind::Enum { options } if options.is_empty() => {
                return Err(format!("{}: 선택지가 비어 있음", rule.name));
            }
            _ => {}
        }
    }
    Ok(())
}

/// 앱이 아는 종류 정의 묶음. 내장 종류는 빌드 때 뽑은 데이터, 외부 종류는 등록 때 받은 데이터
#[derive(Debug, Clone, Default)]
pub struct KindRegistry {
    kinds: BTreeMap<String, KindSchema>,
}

impl KindRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_json(json: &str) -> Result<Self, DefinitionError> {
        let schemas: Vec<KindSchema> =
            serde_json::from_str(json).map_err(|error| DefinitionError {
                kind: String::new(),
                message: error.to_string(),
            })?;
        let mut registry = Self::new();
        for schema in schemas {
            registry.register(schema)?;
        }
        Ok(registry)
    }

    pub fn register(&mut self, schema: KindSchema) -> Result<(), DefinitionError> {
        schema.check()?;
        self.kinds.insert(schema.kind.clone(), schema);
        Ok(())
    }

    pub fn get(&self, kind: &str) -> Option<&KindSchema> {
        self.kinds.get(kind)
    }

    pub fn kinds(&self) -> impl Iterator<Item = &KindSchema> {
        self.kinds.values()
    }
}

#[cfg(test)]
mod tests;
