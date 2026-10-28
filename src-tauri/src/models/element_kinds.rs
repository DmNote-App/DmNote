use std::sync::OnceLock;

use element_document::KindRegistry;

// 내장 요소 종류 정의 - 프론트 정의 파일에서 빌드 때 뽑은 순수 데이터 (npm run kinds:extract)
const BUILTIN_KINDS_JSON: &str = include_str!("../../kinds/builtin-kinds.json");

pub fn builtin_kind_registry() -> &'static KindRegistry {
    static REGISTRY: OnceLock<KindRegistry> = OnceLock::new();
    REGISTRY.get_or_init(|| {
        KindRegistry::from_json(BUILTIN_KINDS_JSON).expect("내장 요소 종류 정의가 올바르지 않음")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::EditorElementTypeV1;

    #[test]
    fn 옛_저장_모양_종류는_모두_정의돼_있다() {
        let registry = builtin_kind_registry();
        for kind in EditorElementTypeV1::ALL {
            let name = serde_json::to_value(kind).unwrap();
            assert!(registry.get(name.as_str().unwrap()).is_some(), "{name}");
        }
        assert!(registry.get("cursorTracker").is_some());
    }
}
