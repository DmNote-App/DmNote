//! store의 요소 트리 문서 - 종류별 배열(옛 모양)과 늘 같은 내용을 가리키게 맞춘다
//!
//! 옛 종류는 아직 옛 모양 경로(편집 커밋·프리셋·탭 관리·되돌리기)가 쓰므로,
//! 영속 커밋마다 옛 모양이 바뀌었으면 트리에 반영한다. 트리에만 있는 정보는 지킨다.

use anyhow::{Context, Result};
use element_document::bundles::BuiltinBundles;
use element_document::{Document, IdSource, Loader};
use serde_json::Value;

use crate::models::legacy_layout::{import_document, is_legacy_kind, reconcile_document};
use crate::models::{builtin_kind_registry, AppStoreData, EditorDocumentV1};

// 저장 파일에서 트리 문서가 실리는 칸
pub(crate) const ELEMENT_DOCUMENT_FIELD: &str = "elementDocument";

struct UuidSource;

impl IdSource for UuidSource {
    fn next_id(&mut self) -> String {
        uuid::Uuid::new_v4().to_string()
    }
}

fn legacy_changed(before: &AppStoreData, after: &AppStoreData) -> bool {
    before.keys != after.keys
        || before.key_positions != after.key_positions
        || before.stat_positions != after.stat_positions
        || before.graph_positions != after.graph_positions
        || before.knob_positions != after.knob_positions
        || before.sprite_positions != after.sprite_positions
        || before.layer_groups != after.layer_groups
}

/// 불러온 store에 트리 문서를 붙인다. 저장할 것이 생기면 true
pub(crate) fn attach_loaded_document(
    state: &mut AppStoreData,
    stored: Option<Value>,
) -> Result<bool> {
    let legacy = EditorDocumentV1::from_store(state);
    let stored = stored.and_then(|value| match serde_json::from_value::<Document>(value) {
        Ok(document) => Some(document),
        Err(error) => {
            log::warn!("[Store] 요소 트리 문서를 읽지 못해 옛 모양에서 다시 만듭니다: {error}");
            None
        }
    });
    let mut document = match &stored {
        Some(stored) => reconcile_document(stored, &legacy).context("요소 트리 맞추기 실패")?,
        None => import_document(&legacy).context("요소 트리 가져오기 실패")?,
    };
    let report = Loader {
        kinds: builtin_kind_registry(),
        bundles: &BuiltinBundles,
        managed_elsewhere: &is_legacy_kind,
    }
    .load(&mut document, &mut UuidSource);
    if !report.pending_hooks.is_empty() || !report.locked_kinds.is_empty() {
        log::info!(
            "[Store] 요소 종류 보존: 훅 대기 {:?}, 잠금 {:?}",
            report.pending_hooks,
            report.locked_kinds
        );
    }
    // 트리 문서가 없던 파일(옛 store.json)은 부르는 쪽이 새 파일로 저장한다
    let changed = stored.as_ref().is_some_and(|stored| stored != &document);
    state.element_document = document;
    Ok(changed)
}

/// 영속 커밋 직전 - 옛 모양이 바뀌었으면 트리에 반영한다
pub(crate) fn sync_element_document(before: &AppStoreData, after: &mut AppStoreData) -> Result<()> {
    if !legacy_changed(before, after) {
        return Ok(());
    }
    let legacy = EditorDocumentV1::from_store(after);
    after.element_document =
        reconcile_document(&after.element_document, &legacy).context("요소 트리 맞추기 실패")?;
    Ok(())
}

#[cfg(test)]
mod tests;
