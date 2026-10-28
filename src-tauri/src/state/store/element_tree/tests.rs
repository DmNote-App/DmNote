use super::*;
use crate::defaults::{default_keys, default_positions, default_stat_positions};
use crate::models::legacy_layout::project_document;

fn default_state() -> AppStoreData {
    let mut state = AppStoreData {
        keys: default_keys().clone(),
        key_positions: default_positions().clone(),
        stat_positions: default_stat_positions().clone(),
        ..AppStoreData::default()
    };
    crate::state::native_element_id::backfill_store_element_ids(&mut state);
    state
}

#[test]
fn 옛_store를_불러오면_트리_문서를_만들고_옛_모양과_같은_내용을_가리킨다() {
    let mut state = default_state();
    let changed = attach_loaded_document(&mut state, None).unwrap();
    assert!(!changed, "트리 문서가 없던 파일은 부르는 쪽이 저장한다");
    let projected = project_document(&state.element_document).unwrap();
    assert_eq!(projected.keys, state.keys);
    assert_eq!(projected.layer_groups, state.layer_groups);
    assert_eq!(state.element_document.scenes.len(), state.keys.len());
}

#[test]
fn 저장된_트리_문서가_옛_모양과_같으면_저장할_것이_없다() {
    let mut state = default_state();
    attach_loaded_document(&mut state, None).unwrap();
    let stored = serde_json::to_value(&state.element_document).unwrap();
    let mut reloaded = state.clone();
    assert!(!attach_loaded_document(&mut reloaded, Some(stored)).unwrap());
    assert_eq!(reloaded.element_document, state.element_document);
}

#[test]
fn 읽지_못하는_트리_문서는_옛_모양에서_다시_만든다() {
    let mut state = default_state();
    attach_loaded_document(&mut state, Some(serde_json::json!({ "scenes": 3 }))).unwrap();
    assert_eq!(state.element_document.scenes.len(), state.keys.len());
}

#[test]
fn 옛_모양이_바뀐_커밋만_트리에_반영한다() {
    let mut before = default_state();
    attach_loaded_document(&mut before, None).unwrap();

    let mut settings_only = before.clone();
    settings_only.always_on_top = !settings_only.always_on_top;
    settings_only
        .element_document
        .extra
        .insert("probe".into(), serde_json::json!(1));
    sync_element_document(&before, &mut settings_only).unwrap();
    assert_eq!(
        settings_only.element_document.extra["probe"],
        serde_json::json!(1)
    );

    let mut moved = before.clone();
    let key = &mut moved.key_positions.get_mut("4key").unwrap()[0];
    key.dx += 7.0;
    let id = key.id.clone();
    let x = key.dx;
    sync_element_document(&before, &mut moved).unwrap();
    assert_eq!(
        moved.element_document.scenes["4key"]
            .element(&id)
            .unwrap()
            .frame
            .x,
        x
    );
}

#[test]
fn 옛_store_json은_가져오기만_하고_새_파일에_저장한다() {
    let dir = std::env::temp_dir().join(format!("dmn-element-tree-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let previous = dir.join(crate::state::store::PREVIOUS_STORE_FILE_NAME);
    let original = serde_json::to_vec_pretty(&default_state()).unwrap();
    std::fs::write(&previous, &original).unwrap();

    let store = crate::state::AppStore::initialize_for_test(&dir).unwrap();
    let snapshot = store.snapshot();
    store.flush_and_shutdown().unwrap();
    drop(store);

    assert_eq!(
        std::fs::read(&previous).unwrap(),
        original,
        "옛 파일은 그대로"
    );
    let current: serde_json::Value = serde_json::from_slice(
        &std::fs::read(dir.join(crate::state::store::STORE_FILE_NAME)).unwrap(),
    )
    .unwrap();
    assert_eq!(
        current[ELEMENT_DOCUMENT_FIELD],
        serde_json::to_value(&snapshot.element_document).unwrap()
    );
    assert_eq!(snapshot.element_document.scenes.len(), snapshot.keys.len());

    // 다시 열면 새 파일을 읽고 저장할 것이 없다
    let reloaded = crate::state::migration::load_store_from_path(
        &dir.join(crate::state::store::STORE_FILE_NAME),
    )
    .unwrap();
    assert!(!reloaded.needs_persist);
    assert_eq!(reloaded.data.element_document, snapshot.element_document);
    let _ = std::fs::remove_dir_all(&dir);
}
