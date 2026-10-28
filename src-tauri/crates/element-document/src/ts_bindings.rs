//! Rust 원본에서 TS 타입 만들기 - 테스트 빌드에서만 돈다.
//! 커밋된 파일과 다르면 실패한다. 갱신: UPDATE_TS_BINDINGS=1 cargo test -p element-document

use std::path::PathBuf;

use ts_rs::TS;

use crate::condition::{
    AllCondition, AnyCondition, Condition, EqualsCondition, NotCondition, OneOfCondition,
};
use crate::document::{Document, Element, Frame, Group, InputBinding, Node, Scene};
use crate::load::LoadReport;
use crate::ops::{ChangeSet, FramePatch, Op, SceneChange};
use crate::patch::{DocumentPatch, ScenePatch};
use crate::schema::{DefinitionError, KindMigration, KindSchema, MigrationStep, Size};
use crate::session::PendingEdit;
use crate::value::{AssetKind, FieldRule, ValueKind, Violation, ViolationCode};

fn output_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../src/types/generated/elementDocument.ts")
}

fn generate() -> String {
    let declarations = [
        serde_json::Value::decl(),
        Document::decl(),
        Scene::decl(),
        Node::decl(),
        Group::decl(),
        Element::decl(),
        Frame::decl(),
        InputBinding::decl(),
        Op::decl(),
        FramePatch::decl(),
        ChangeSet::decl(),
        SceneChange::decl(),
        PendingEdit::decl(),
        DocumentPatch::decl(),
        ScenePatch::decl(),
        Violation::decl(),
        ViolationCode::decl(),
        LoadReport::decl(),
        KindSchema::decl(),
        Size::decl(),
        FieldRule::decl(),
        ValueKind::decl(),
        AssetKind::decl(),
        Condition::decl(),
        EqualsCondition::decl(),
        OneOfCondition::decl(),
        AllCondition::decl(),
        AnyCondition::decl(),
        NotCondition::decl(),
        KindMigration::decl(),
        MigrationStep::decl(),
        DefinitionError::decl(),
    ];
    let mut out = String::from(
        "// 자동 생성 파일 - 직접 고치지 않는다. 원본: src-tauri/crates/element-document\n// 갱신: UPDATE_TS_BINDINGS=1 cargo test -p element-document --manifest-path src-tauri/Cargo.toml\n\n",
    );
    for declaration in declarations {
        out.push_str("export ");
        out.push_str(&declaration);
        out.push_str("\n\n");
    }
    out.truncate(out.trim_end().len());
    out.push('\n');
    out
}

#[test]
fn ts_타입이_rust_원본과_같다() {
    let generated = generate();
    let path = output_path();
    if std::env::var_os("UPDATE_TS_BINDINGS").is_some() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, &generated).unwrap();
        return;
    }
    let committed = std::fs::read_to_string(&path).unwrap_or_default();
    assert!(
        committed == generated,
        "TS 타입이 Rust 원본과 다릅니다. UPDATE_TS_BINDINGS=1 cargo test -p element-document 로 갱신하세요"
    );
}
