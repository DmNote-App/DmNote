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
    let changed = attach_loaded_document(&mut state, None).unwrap().changed;
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
    let stored = serde_json::to_value(persisted_document(&state.element_document)).unwrap();
    let mut reloaded = state.clone();
    assert!(
        !attach_loaded_document(&mut reloaded, Some(stored))
            .unwrap()
            .changed
    );
    assert_eq!(reloaded.element_document, state.element_document);
}

#[test]
fn 읽지_못하는_트리_문서는_옛_모양에서_다시_만든다() {
    let mut state = default_state();
    let outcome =
        attach_loaded_document(&mut state, Some(serde_json::json!({ "scenes": 3 }))).unwrap();
    assert!(outcome.unreadable && outcome.changed);
    assert_eq!(state.element_document.scenes.len(), state.keys.len());
}

#[test]
fn 옛_모양이_바뀐_커밋만_트리에_반영한다() {
    let mut before = default_state();
    attach_loaded_document(&mut before, None).unwrap();

    let mut settings_only = before.clone();
    settings_only.always_on_top = !settings_only.always_on_top;
    std::sync::Arc::make_mut(&mut settings_only.element_document)
        .extra
        .insert("probe".into(), serde_json::json!(1));
    sync_element_document(&before, &mut settings_only).unwrap();
    assert_eq!(
        std::sync::Arc::make_mut(&mut settings_only.element_document).extra["probe"],
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
        serde_json::to_value(persisted_document(&snapshot.element_document)).unwrap()
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

fn open_store() -> (std::path::PathBuf, crate::state::AppStore) {
    let dir = std::env::temp_dir().join(format!("dmn-element-commit-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let mut state = default_state();
    state.layer_groups.insert(
        "4key".into(),
        vec![crate::models::LayerGroupDef {
            id: "g1".into(),
            name: "왼손".into(),
        }],
    );
    state.key_positions.get_mut("4key").unwrap()[0].group_id = Some("g1".into());
    std::fs::write(
        dir.join(crate::state::store::STORE_FILE_NAME),
        serde_json::to_vec_pretty(&state).unwrap(),
    )
    .unwrap();
    let store = crate::state::AppStore::initialize_for_test(&dir).unwrap();
    (dir, store)
}

#[test]
fn 트리_쓰기는_옛_종류_요소를_고치지_못한다() {
    let (dir, store) = open_store();
    let (revision, document) = store.element_document_snapshot();
    let key = document.scenes["4key"].elements()[0].id.clone();
    let op: Op = serde_json::from_value(serde_json::json!({
        "op": "setFrame", "scene": "4key", "id": key, "frame": { "x": 1 }
    }))
    .unwrap();
    let result = store.commit_element_document(&[op]).unwrap();
    assert!(matches!(
        result,
        ElementDocumentCommitResult::Rejected {
            code: "MANAGED_ELSEWHERE",
            ..
        }
    ));
    assert_eq!(store.element_document_snapshot(), (revision, document));
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 그룹_숨김처럼_트리에만_있는_정보는_커밋하고_리비전이_오른다() {
    let (dir, store) = open_store();
    let (revision, _) = store.element_document_snapshot();
    let op: Op = serde_json::from_value(serde_json::json!({
        "op": "setGroup", "scene": "4key", "id": "g1", "hidden": true
    }))
    .unwrap();
    let result = store.commit_element_document(&[op]).unwrap();
    let ElementDocumentCommitResult::Committed {
        revision: next,
        changes,
    } = result
    else {
        panic!("{result:?}");
    };
    assert_eq!(next, revision + 1);
    assert!(changes.scenes["4key"].changed.contains("g1"));
    // 옛 모양은 그대로
    assert!(store.snapshot().layer_groups["4key"]
        .iter()
        .any(|group| group.id == "g1"));

    let rename: Op = serde_json::from_value(serde_json::json!({
        "op": "setGroup", "scene": "4key", "id": "g1", "name": "바뀜"
    }))
    .unwrap();
    assert!(matches!(
        store.commit_element_document(&[rename]).unwrap(),
        ElementDocumentCommitResult::Rejected {
            code: "MANAGED_ELSEWHERE",
            ..
        }
    ));
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 트리_전용_요소_편집을_되돌리고_다시_한다() {
    use crate::state::history::HistoryDirection;
    let (dir, store) = open_store();
    let key = store.snapshot().key_positions["4key"][1].id.clone();
    let insert: Op = serde_json::from_value(serde_json::json!({
        "op": "insert", "scene": "4key", "parent": null, "index": null,
        "node": { "type": "element", "id": "tracker-1", "kind": "cursorTracker",
                  "frame": { "x": 5, "y": 5, "width": 120, "height": 120 } }
    }))
    .unwrap();
    assert!(matches!(
        store.commit_element_document(&[insert]).unwrap(),
        ElementDocumentCommitResult::Committed { .. }
    ));
    let inserted = store.element_document_snapshot().1;
    assert!(inserted.scenes["4key"].element("tracker-1").is_some());
    // 기본 고유 값과 표면 묶음이 채워진다
    let tracker = inserted.scenes["4key"].element("tracker-1").unwrap();
    assert_eq!(tracker.values["mode"], serde_json::json!("motion"));
    assert!(tracker.bundles.contains_key("surface"));

    // 그 사이 옛 경로 편집은 되돌리기에 휩쓸리지 않는다
    {
        let mut guard = store.state.write();
        let mut scratch = guard.data.clone();
        scratch.key_positions.get_mut("4key").unwrap()[1].dx = 333.0;
        store.commit_locked(&mut guard, scratch, ()).unwrap();
    }

    let counters = Default::default();
    store
        .apply_history_operation(
            HistoryDirection::Undo,
            &uuid::Uuid::new_v4().to_string(),
            &counters,
            || {},
        )
        .unwrap();
    let undone = store.element_document_snapshot().1;
    assert!(undone.scenes["4key"].element("tracker-1").is_none());
    assert_eq!(undone.scenes["4key"].element(&key).unwrap().frame.x, 333.0);

    store
        .apply_history_operation(
            HistoryDirection::Redo,
            &uuid::Uuid::new_v4().to_string(),
            &counters,
            || {},
        )
        .unwrap();
    assert!(store.element_document_snapshot().1.scenes["4key"]
        .element("tracker-1")
        .is_some());
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 지운_탭을_되살리면_트리_전용_요소도_돌아온다() {
    let mut state = default_state();
    attach_loaded_document(&mut state, None).unwrap();
    let engine = Engine {
        kinds: builtin_kind_registry(),
        bundles: &BuiltinBundles,
    };
    let insert: Op = serde_json::from_value(serde_json::json!({
        "op": "insert", "scene": "4key", "parent": null, "index": null,
        "node": { "type": "element", "id": "tracker-1", "kind": "cursorTracker",
                  "frame": { "x": 5, "y": 5, "width": 120, "height": 120 } }
    }))
    .unwrap();
    engine
        .apply(
            std::sync::Arc::make_mut(&mut state.element_document),
            &[insert],
        )
        .unwrap();
    let with_tab = state.clone();

    // 탭 지우기 (옛 모양에서 4key가 빠진다)
    let mut deleted = with_tab.clone();
    deleted.keys.remove("4key");
    deleted.key_positions.remove("4key");
    deleted.stat_positions.remove("4key");
    sync_element_document(&with_tab, &mut deleted).unwrap();
    assert!(!deleted.element_document.scenes.contains_key("4key"));
    let snapshot = element_tree_snapshot(&with_tab.element_document, ["4key".to_string()].iter());

    // 되돌리기 - 옛 모양을 되살리고 뼈대로 트리를 되살린 뒤 커밋 때 맞춘다
    let mut restored = deleted.clone();
    restored.keys = with_tab.keys.clone();
    restored.key_positions = with_tab.key_positions.clone();
    restored.stat_positions = with_tab.stat_positions.clone();
    restored.element_document = std::sync::Arc::new(restore_element_tree(
        &restored.element_document,
        &snapshot,
        true,
    ));
    sync_element_document(&deleted, &mut restored).unwrap();
    let scene = &restored.element_document.scenes["4key"];
    assert!(scene.element("tracker-1").is_some());
    // 옛 종류 요소는 뼈대가 아니라 실제 값으로 채워진다
    let key = &restored.key_positions["4key"][0];
    assert_eq!(scene.element(&key.id).unwrap().frame.x, key.dx);
    assert_eq!(
        scene.elements().len(),
        with_tab.element_document.scenes["4key"].elements().len()
    );
}

fn with_tree_only_element(state: &mut AppStoreData) -> String {
    let document = std::sync::Arc::make_mut(&mut state.element_document);
    let scene = document.scenes.get_mut("4key").unwrap();
    let tracker: element_document::Element = serde_json::from_value(serde_json::json!({
        "id": "tracker-1",
        "kind": "cursorTracker",
        "frame": { "x": 5.0, "y": 6.0, "width": 120.0, "height": 120.0, "rotation": 0.0 },
        "values": { "mode": "position" },
        "bundles": { "surface": { "borderWidth": 2 } },
    }))
    .unwrap();
    scene.nodes.insert(1, Node::Element(tracker));
    // 읽기 정리(기본값 채우기)를 거친 모양으로 맞춘다
    let stored = serde_json::to_value(&*state.element_document).unwrap();
    attach_loaded_document(state, Some(stored)).unwrap();
    "tracker-1".into()
}

#[test]
fn 저장할_때_옛_종류_요소는_뼈대만_남기고_읽으면_같은_문서가_된다() {
    let mut state = default_state();
    attach_loaded_document(&mut state, None).unwrap();
    let tracker = with_tree_only_element(&mut state);
    let persisted = persisted_document(&state.element_document);
    let mut legacy_seen = 0;
    walk(&persisted.scenes["4key"].nodes, &mut |node, _| {
        let Node::Element(element) = node else { return };
        if element.id == tracker {
            assert!(!element.bundles.is_empty() && !element.values.is_empty());
            return;
        }
        legacy_seen += 1;
        assert!(element.bundles.is_empty() && element.values.is_empty());
        let legacy = element.extra["legacy"].as_object().unwrap();
        assert!(!legacy.contains_key("fields"), "칸 값은 옛 모양에 있다");
        assert!(legacy.contains_key("index"));
    });
    assert!(legacy_seen > 0);
    let full = serde_json::to_vec(&*state.element_document).unwrap().len();
    let skeleton = serde_json::to_vec(&persisted).unwrap().len();
    assert!(skeleton * 3 < full, "뼈대 {skeleton}B, 전체 {full}B");

    let mut reloaded = state.clone();
    reloaded.element_document = Default::default();
    let outcome = attach_loaded_document(
        &mut reloaded,
        Some(serde_json::to_value(&persisted).unwrap()),
    )
    .unwrap();
    assert!(!outcome.changed);
    assert_eq!(reloaded.element_document, state.element_document);
}

#[test]
fn 전체를_담은_예전_저장_모양도_읽고_뼈대로_다시_저장한다() {
    let mut state = default_state();
    attach_loaded_document(&mut state, None).unwrap();
    with_tree_only_element(&mut state);
    let full = serde_json::to_value(&*state.element_document).unwrap();
    let mut reloaded = state.clone();
    let outcome = attach_loaded_document(&mut reloaded, Some(full)).unwrap();
    assert!(outcome.changed && !outcome.unreadable);
    assert_eq!(reloaded.element_document, state.element_document);
}
