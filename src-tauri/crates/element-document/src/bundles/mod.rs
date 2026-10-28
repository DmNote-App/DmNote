//! 기능 묶음 목록 - 앱 구조라서 Rust 구조체로 검사한다.
//! 엔진은 이름으로 묶음을 찾아 쓰기 검사·읽기 정리·기본값을 맡긴다.

use serde_json::Value;

use crate::value::Violation;

pub trait BundleCatalog {
    fn knows(&self, name: &str) -> bool;
    fn default_value(&self, name: &str) -> Value;
    /// 쓰기 검사. `previous`는 같은 요소의 저장된 값 - 모르는 칸 보존 판단에 쓴다
    fn validate(
        &self,
        name: &str,
        value: &Value,
        previous: Option<&Value>,
        path: &str,
        out: &mut Vec<Violation>,
    );
    /// 읽기 정리 - 못 고치면 None(기본값으로 대체)
    fn normalize(&self, name: &str, value: &Value) -> Option<Value>;
    /// 묶음 안 파일 경로 - 정리 대상에서 보호
    fn files<'a>(
        &self,
        _name: &str,
        _value: &'a Value,
        _out: &mut Vec<(crate::value::AssetKind, &'a str)>,
    ) {
    }
}

/// 묶음이 없는 엔진 - 엔진 단위 테스트용
pub struct NoBundles;

impl BundleCatalog for NoBundles {
    fn knows(&self, _name: &str) -> bool {
        false
    }

    fn default_value(&self, _name: &str) -> Value {
        Value::Null
    }

    fn validate(
        &self,
        _name: &str,
        _value: &Value,
        _previous: Option<&Value>,
        _path: &str,
        _out: &mut Vec<Violation>,
    ) {
    }

    fn normalize(&self, _name: &str, value: &Value) -> Option<Value> {
        Some(value.clone())
    }
}

mod builtin;

pub use builtin::{BuiltinBundles, BUILTIN_BUNDLE_NAMES};
