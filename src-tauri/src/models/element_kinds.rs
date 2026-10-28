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
    fn 내장_종류_정의는_편집_종류_목록과_같다() {
        let kinds: Vec<String> = builtin_kind_registry()
            .kinds()
            .map(|schema| schema.kind.clone())
            .collect();
        let mut expected: Vec<String> = [
            EditorElementTypeV1::Key,
            EditorElementTypeV1::Stat,
            EditorElementTypeV1::Graph,
            EditorElementTypeV1::Knob,
            EditorElementTypeV1::Sprite,
        ]
        .iter()
        .map(|kind| {
            serde_json::to_value(kind)
                .unwrap()
                .as_str()
                .unwrap()
                .to_string()
        })
        .collect();
        expected.sort();
        assert_eq!(kinds, expected);
    }
}
