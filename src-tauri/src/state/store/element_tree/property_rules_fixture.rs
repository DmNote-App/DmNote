//! 패널 속성 패치의 칸 규칙을 트리 모양으로 고정하는 fixture - 프론트 트리 쓰기 계산
//! (src/renderer/elementKinds/runtime/fieldView.ts의 propertyPatchOps)과 공유한다.
//! 옛 편집 연산 fixture(editor-ops-parity.json)의 속성 패치 경우를 저장된 옛 모양처럼 트리로 읽고,
//! 플러그인 editor.commit과 같은 길(옛 편집 연산 적용 → 커밋 때 트리에 맞추기)을 거친 트리를 적는다.
//! 갱신: UPDATE_TS_BINDINGS=1 cargo test --lib property_rules_fixture

use element_document::Document;
use serde::Deserialize;
use serde_json::{json, Value};

use super::{attach_loaded_document, sync_element_document};
use crate::models::{AppStoreData, EditorDocumentV1, EditorOpV1};
use crate::state::editor_ops::prepare_editor_ops_transition;

const OPS_PARITY_FIXTURE: &str =
    include_str!("../../../../../tests/fixtures/editor-ops-parity.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpsParityFixture {
    cases: Vec<OpsParityCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpsParityCase {
    name: String,
    initial_document: EditorDocumentV1,
    ops: Vec<EditorOpV1>,
}

// 요소가 든 장면과 그 요소 (없으면 null)
fn located(document: &Document, id: &str) -> (Value, Value) {
    document
        .scenes
        .iter()
        .find_map(|(scene, nodes)| {
            nodes
                .element(id)
                .map(|element| (json!(scene), serde_json::to_value(element).unwrap()))
        })
        .unwrap_or((Value::Null, Value::Null))
}

// 연산이 고치는 요소마다 (장면, 고치기 전, 고친 뒤) - 다른 요소는 연산과 상관없어 싣지 않는다
fn targets(before: &Document, after: &Document, ops: &[EditorOpV1]) -> Vec<Value> {
    let mut ids: Vec<&str> = Vec::new();
    for op in ops {
        if let EditorOpV1::PatchElement { id, .. } = op {
            if !ids.contains(&id.as_str()) {
                ids.push(id);
            }
        }
    }
    ids.into_iter()
        .map(|id| {
            let (scene, node) = located(before, id);
            let (_, next) = located(after, id);
            json!({ "id": id, "scene": scene, "before": node, "after": next })
        })
        .collect()
}

fn generate() -> String {
    let fixture: OpsParityFixture = serde_json::from_str(OPS_PARITY_FIXTURE).unwrap();
    let cases: Vec<Value> = fixture
        .cases
        .into_iter()
        .filter(|case| {
            case.ops
                .iter()
                .all(|op| matches!(op, EditorOpV1::PatchElement { .. }))
        })
        .map(|case| {
            // 저장된 옛 모양을 불러온 트리
            let mut before = AppStoreData::default();
            case.initial_document.apply_to_store(&mut before);
            attach_loaded_document(&mut before, None).unwrap();
            let prepared = prepare_editor_ops_transition(&before, &case.ops)
                .unwrap_or_else(|error| panic!("case {}: ops rejected: {error:?}", case.name));
            let mut after = prepared.scratch;
            sync_element_document(&before, &mut after).unwrap();
            json!({
                "name": case.name,
                "ops": case.ops,
                "elements": targets(before.element_document(), after.element_document(), &case.ops),
            })
        })
        .collect();
    let fixture = json!({ "cases": cases });
    format!("{}\n", serde_json::to_string_pretty(&fixture).unwrap())
}

#[test]
fn 속성_칸_규칙_fixture가_백엔드_결과와_같다() {
    let generated = generate();
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../tests/fixtures/element-property-rules.json");
    if std::env::var_os("UPDATE_TS_BINDINGS").is_some() {
        std::fs::write(&path, &generated).unwrap();
        return;
    }
    assert!(
        std::fs::read_to_string(&path).unwrap_or_default() == generated,
        "fixture가 백엔드 결과와 다릅니다. UPDATE_TS_BINDINGS=1 cargo test --lib property_rules_fixture 로 갱신하세요"
    );
}
