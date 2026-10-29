use super::*;
use crate::defaults::{default_keys, default_positions, default_stat_positions};
use crate::models::legacy_layout::project_document;
use element_document::document::walk;

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
    let stored = serde_json::to_value(&*state.element_document).unwrap();
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
        serde_json::to_value(&*snapshot.element_document).unwrap()
    );
    // 저장 원본은 트리 하나 - 옛 종류 배열은 싣지 않는다
    for field in LEGACY_ELEMENT_FIELDS {
        assert!(current.get(field).is_none(), "{field}");
    }
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

fn commit(store: &crate::state::AppStore, ops: serde_json::Value) -> ElementDocumentCommitResult {
    let ops: Vec<Op> = serde_json::from_value(ops).unwrap();
    store.commit_element_document(&ops).unwrap()
}

fn tracker_json(id: &str) -> serde_json::Value {
    serde_json::json!({ "type": "element", "id": id, "kind": "cursorTracker",
                        "frame": { "x": 5, "y": 5, "width": 120, "height": 120 } })
}

#[test]
fn 트리_요소끼리는_트리에서_묶고_풀고_이름을_바꾸며_옛_그룹_목록에는_나타나지_않는다() {
    let (dir, store) = open_store();
    let key = store.snapshot().key_positions["4key"][1].id.clone();
    for id in ["t1", "t2"] {
        let inserted = commit(
            &store,
            serde_json::json!([{ "op": "insert", "scene": "4key", "parent": null,
                                 "index": null, "node": tracker_json(id) }]),
        );
        assert!(matches!(
            inserted,
            ElementDocumentCommitResult::Committed { .. }
        ));
    }
    // 옛 종류 요소가 섞이면 묶을 수 없다
    assert!(matches!(
        commit(
            &store,
            serde_json::json!([{ "op": "group", "scene": "4key", "id": "tg", "name": "T",
                                 "ids": ["t1", key] }]),
        ),
        ElementDocumentCommitResult::Rejected {
            code: "MANAGED_ELSEWHERE",
            ..
        }
    ));
    assert!(matches!(
        commit(
            &store,
            serde_json::json!([
                { "op": "group", "scene": "4key", "id": "tg", "name": "T", "ids": ["t1", "t2"] },
                { "op": "setGroup", "scene": "4key", "id": "tg", "name": "트래커" }
            ]),
        ),
        ElementDocumentCommitResult::Committed { .. }
    ));
    let document = store.element_document_snapshot().1;
    assert_eq!(
        document.scenes["4key"].parent_of("t1"),
        Some(Some("tg".to_string()))
    );
    let legacy = project_document(&document).unwrap();
    assert!(
        !legacy.layer_groups["4key"]
            .iter()
            .any(|group| group.id == "tg"),
        "트리 전용 그룹은 옛 모양에 나타나지 않는다"
    );
    assert!(store.snapshot().layer_groups["4key"]
        .iter()
        .all(|group| group.id != "tg"));

    // 옛 경로로 구조가 바뀌어도 트리 그룹은 안쪽까지 그대로 남는다
    {
        let mut guard = store.state.write();
        let mut scratch = guard.data.clone();
        scratch.key_positions.get_mut("4key").unwrap().swap(0, 1);
        scratch.keys.get_mut("4key").unwrap().swap(0, 1);
        store.commit_locked(&mut guard, scratch, ()).unwrap();
    }
    let document = store.element_document_snapshot().1;
    let scene = &document.scenes["4key"];
    assert_eq!(scene.parent_of("t1"), Some(Some("tg".to_string())));
    assert_eq!(scene.parent_of("t2"), Some(Some("tg".to_string())));

    assert!(matches!(
        commit(
            &store,
            serde_json::json!([{ "op": "ungroup", "scene": "4key", "id": "tg" }]),
        ),
        ElementDocumentCommitResult::Committed { .. }
    ));
    let document = store.element_document_snapshot().1;
    assert_eq!(document.scenes["4key"].parent_of("t1"), Some(None));
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 트리_그룹을_지운_것을_되돌리면_안쪽까지_되살아난다() {
    use crate::state::history::HistoryDirection;
    let (dir, store) = open_store();
    assert!(matches!(
        commit(
            &store,
            serde_json::json!([
                { "op": "insert", "scene": "4key", "parent": null, "index": null, "node": tracker_json("t1") },
                { "op": "insert", "scene": "4key", "parent": null, "index": null, "node": tracker_json("t2") },
                { "op": "group", "scene": "4key", "id": "tg", "name": "T", "ids": ["t1", "t2"] }
            ]),
        ),
        ElementDocumentCommitResult::Committed { .. }
    ));
    assert!(matches!(
        commit(
            &store,
            serde_json::json!([{ "op": "remove", "scene": "4key", "ids": ["tg"] }]),
        ),
        ElementDocumentCommitResult::Committed { .. }
    ));
    assert!(store.element_document_snapshot().1.scenes["4key"]
        .find_path("t1")
        .is_none());
    let counters = Default::default();
    store
        .apply_history_operation(
            HistoryDirection::Undo,
            &uuid::Uuid::new_v4().to_string(),
            &counters,
            || {},
        )
        .unwrap();
    let document = store.element_document_snapshot().1;
    let scene = &document.scenes["4key"];
    assert_eq!(scene.parent_of("t1"), Some(Some("tg".to_string())));
    assert_eq!(scene.parent_of("t2"), Some(Some("tg".to_string())));
    let mut ids = Vec::new();
    walk(&scene.nodes, &mut |node, _| ids.push(node.id().to_string()));
    assert_eq!(ids.iter().filter(|id| *id == "tg").count(), 1);
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

fn tracker_after_second_key(store: &crate::state::AppStore) -> (String, Vec<String>) {
    let document = store.element_document_snapshot().1;
    let mut order = Vec::new();
    walk(&document.scenes["4key"].nodes, &mut |node, _| {
        order.push(node.id().to_string())
    });
    let second = store.snapshot().key_positions["4key"][1].id.clone();
    (second, order)
}

#[test]
fn 프리셋을_불러오면_트리_요소가_새_id로_같은_옛_요소_옆에_오고_되돌리면_원래대로다() {
    let (dir, store) = open_store();
    let second = store.snapshot().key_positions["4key"][1].id.clone();
    // 두 번째 키 바로 위에 트래커
    let scene = store.element_document_snapshot().1.scenes["4key"].clone();
    let at = scene.find_path(&second).unwrap();
    assert!(matches!(
        commit(
            &store,
            serde_json::json!([{ "op": "insert", "scene": "4key",
                "parent": if at.len() > 1 { serde_json::json!(scene.parent_of(&second).unwrap()) } else { serde_json::Value::Null },
                "index": at[at.len() - 1] + 1, "node": tracker_json("t1") }]),
        ),
        ElementDocumentCommitResult::Committed { .. }
    ));
    let before = store.snapshot();
    let preset: std::collections::BTreeMap<String, element_document::Scene> = before
        .element_document
        .scenes
        .iter()
        .filter_map(|(mode, scene)| {
            crate::models::legacy_layout::preset_scene(scene).map(|scene| (mode.clone(), scene))
        })
        .collect();
    let history_target = crate::state::history::PresetFullHistorySnapshot::from_store(&before);

    // 프리셋 불러오기 - 옛 요소 id가 새로 매겨지고 트리는 프리셋에서 다시 만든다
    {
        let mut guard = store.state.write();
        let mut scratch = guard.data.clone();
        crate::state::native_element_id::rekey_store_element_ids(&mut scratch);
        apply_full_preset_tree(&mut scratch, Some(&preset)).unwrap();
        store.commit_locked(&mut guard, scratch, ()).unwrap();
    }
    let (new_second, order) = tracker_after_second_key(&store);
    assert_ne!(new_second, second);
    let at = order.iter().position(|id| *id == new_second).unwrap();
    assert_ne!(order[at + 1], "t1", "트리 요소 id도 새로 매긴다");
    let tracker = store.element_document_snapshot().1.scenes["4key"]
        .element(&order[at + 1])
        .map(|element| element.kind.clone());
    assert_eq!(tracker.as_deref(), Some("cursorTracker"), "{order:?}");

    // 옛 프리셋(트리 정보 없음)이면 트리 전용 노드 없이 프리셋 그대로
    {
        let mut guard = store.state.write();
        let mut scratch = guard.data.clone();
        apply_full_preset_tree(&mut scratch, None).unwrap();
        store.commit_locked(&mut guard, scratch, ()).unwrap();
    }
    let document = store.element_document_snapshot().1;
    assert!(document.scenes["4key"]
        .elements()
        .iter()
        .all(|element| is_legacy_kind(&element.kind)));

    // 되돌리기 - 기록한 뼈대로 장면을 되놓으면 원래 트래커가 원래 자리에 온다
    {
        let mut guard = store.state.write();
        let mut scratch = guard.data.clone();
        history_target.document.apply_to_store(&mut scratch);
        scratch.element_document = std::sync::Arc::new(
            restore_scenes_from_legacy(
                &scratch.element_document,
                &history_target.element_tree,
                &history_target.document,
            )
            .unwrap(),
        );
        store.commit_locked(&mut guard, scratch, ()).unwrap();
    }
    let (restored_second, order) = tracker_after_second_key(&store);
    assert_eq!(restored_second, second);
    let at = order.iter().position(|id| *id == second).unwrap();
    assert_eq!(order[at + 1], "t1", "{order:?}");
    assert_eq!(
        project_document(&store.element_document_snapshot().1).unwrap(),
        crate::models::EditorDocumentV1::from_store(&store.snapshot())
    );
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 탭_프리셋은_트리_정보가_있을_때만_그_탭의_트리_요소를_바꾼다() {
    let mut state = default_state();
    attach_loaded_document(&mut state, None).unwrap();
    with_tree_only_element(&mut state);
    let before = state.element_document.clone();
    apply_tab_preset_tree(&mut state, "4key", None).unwrap();
    assert_eq!(state.element_document, before, "옛 프리셋이면 그대로");

    let empty = element_document::Scene {
        nodes: Vec::new(),
        extra: Default::default(),
    };
    apply_tab_preset_tree(&mut state, "4key", Some(&empty)).unwrap();
    assert!(state.element_document.scenes["4key"]
        .elements()
        .iter()
        .all(|element| is_legacy_kind(&element.kind)));
    assert_eq!(
        state.element_document.scenes["5key"], before.scenes["5key"],
        "다른 탭은 그대로"
    );
}

#[test]
fn 탭_프리셋을_되돌려도_다른_탭은_뼈대로_남지_않는다() {
    let (dir, store) = open_store();
    let history_target =
        crate::state::history::PresetFullHistorySnapshot::from_store(&store.snapshot());
    // 4key만 다시 매긴다 (탭 프리셋 불러오기)
    {
        let mut guard = store.state.write();
        let mut scratch = guard.data.clone();
        crate::state::native_element_id::rekey_mode_element_ids_for_collections(
            &mut scratch,
            "4key",
            crate::models::ElementKindSet::ALL,
        );
        store.commit_locked(&mut guard, scratch, ()).unwrap();
    }
    let five_before = store.element_document_snapshot().1.scenes["5key"].clone();
    {
        let mut guard = store.state.write();
        let mut scratch = guard.data.clone();
        history_target.document.apply_to_store(&mut scratch);
        scratch.element_document = std::sync::Arc::new(
            restore_scenes_from_legacy(
                &scratch.element_document,
                &history_target.element_tree,
                &history_target.document,
            )
            .unwrap(),
        );
        store.commit_locked(&mut guard, scratch, ()).unwrap();
    }
    let document = store.element_document_snapshot().1;
    assert_eq!(document.scenes["5key"], five_before);
    assert_eq!(
        project_document(&document).unwrap(),
        crate::models::EditorDocumentV1::from_store(&store.snapshot())
    );
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 트리_그룹이_빠지기나_옮기기로_비면_함께_지운다() {
    let (dir, store) = open_store();
    assert!(matches!(
        commit(
            &store,
            serde_json::json!([
                { "op": "insert", "scene": "4key", "parent": null, "index": null, "node": tracker_json("t1") },
                { "op": "insert", "scene": "4key", "parent": null, "index": null, "node": tracker_json("t2") },
                { "op": "group", "scene": "4key", "id": "tg", "name": "T", "ids": ["t1", "t2"] }
            ]),
        ),
        ElementDocumentCommitResult::Committed { .. }
    ));
    assert!(matches!(
        commit(
            &store,
            serde_json::json!([{ "op": "move", "scene": "4key", "ids": ["t1"], "parent": null, "index": null }]),
        ),
        ElementDocumentCommitResult::Committed { .. }
    ));
    assert!(store.element_document_snapshot().1.scenes["4key"]
        .find_path("tg")
        .is_some());
    let ElementDocumentCommitResult::Committed { changes, .. } = commit(
        &store,
        serde_json::json!([{ "op": "remove", "scene": "4key", "ids": ["t2"] }]),
    ) else {
        panic!()
    };
    assert!(store.element_document_snapshot().1.scenes["4key"]
        .find_path("tg")
        .is_none());
    assert!(changes.scenes["4key"].removed.contains("tg"));
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

fn commit_planned(store: &crate::state::AppStore, ops: serde_json::Value) {
    let ops: Vec<Op> = serde_json::from_value(ops).unwrap();
    match store.plan_element_document_commit(&ops, None).unwrap() {
        ElementDocumentCommitPlan::Legacy { request, .. } => {
            store.commit_editor_document(*request).unwrap();
        }
        ElementDocumentCommitPlan::TreeOnly => {
            assert!(matches!(
                store.commit_element_document(&ops).unwrap(),
                ElementDocumentCommitResult::Committed { .. }
            ));
        }
        ElementDocumentCommitPlan::Rejected(result) => panic!("{result:?}"),
    }
}

#[test]
fn 트리_쓰기로_옛_종류_요소를_고치면_옛_편집_커밋으로_옛_모양이_바뀌고_되돌릴_수_있다() {
    use crate::state::history::HistoryDirection;
    let (dir, store) = open_store();
    let key = store.snapshot().key_positions["4key"][2].id.clone();
    let before_dx = store.snapshot().key_positions["4key"][2].dx;
    commit_planned(
        &store,
        serde_json::json!([{ "op": "setFrame", "scene": "4key", "id": key, "frame": { "x": 321 } }]),
    );
    assert_eq!(store.snapshot().key_positions["4key"][2].dx, 321.0);
    assert_eq!(
        store.element_document_snapshot().1.scenes["4key"]
            .element(&key)
            .unwrap()
            .frame
            .x,
        321.0
    );
    let counters = Default::default();
    store
        .apply_history_operation(
            HistoryDirection::Undo,
            &uuid::Uuid::new_v4().to_string(),
            &counters,
            || {},
        )
        .unwrap();
    assert_eq!(store.snapshot().key_positions["4key"][2].dx, before_dx);
    assert_eq!(
        project_document(&store.element_document_snapshot().1).unwrap(),
        crate::models::EditorDocumentV1::from_store(&store.snapshot())
    );
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 옛_종류_요소와_트리_요소를_한_그룹으로_묶으면_옛_그룹이_되고_트리_요소도_그_안에_있다() {
    let (dir, store) = open_store();
    commit_planned(
        &store,
        serde_json::json!([{ "op": "insert", "scene": "4key", "parent": null, "index": null, "node": tracker_json("t1") }]),
    );
    let key = store.snapshot().key_positions["4key"][3].id.clone();
    commit_planned(
        &store,
        serde_json::json!([{ "op": "group", "scene": "4key", "id": "mixed", "name": "섞임", "ids": [key, "t1"] }]),
    );
    let snapshot = store.snapshot();
    assert!(snapshot.layer_groups["4key"]
        .iter()
        .any(|group| group.id == "mixed"));
    assert_eq!(
        snapshot.key_positions["4key"][3].group_id.as_deref(),
        Some("mixed")
    );
    let document = store.element_document_snapshot().1;
    assert_eq!(
        document.scenes["4key"].parent_of("t1"),
        Some(Some("mixed".to_string()))
    );
    assert_eq!(
        project_document(&document).unwrap(),
        crate::models::EditorDocumentV1::from_store(&snapshot)
    );
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 트리만_담은_저장_파일을_읽으면_옛_모양을_트리에서_다시_만든다() {
    let mut state = default_state();
    attach_loaded_document(&mut state, None).unwrap();
    with_tree_only_element(&mut state);
    let dir = std::env::temp_dir().join(format!("dmn-tree-only-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(crate::state::store::STORE_FILE_NAME);
    let mut value = serde_json::to_value(&state).unwrap();
    let object = value.as_object_mut().unwrap();
    for field in LEGACY_ELEMENT_FIELDS {
        object.remove(field);
    }
    object.insert(
        ELEMENT_DOCUMENT_FIELD.into(),
        serde_json::to_value(&*state.element_document).unwrap(),
    );
    std::fs::write(&path, serde_json::to_vec_pretty(&value).unwrap()).unwrap();

    let loaded = crate::state::migration::load_store_from_path(&path).unwrap();
    assert!(!loaded.repaired);
    assert_eq!(loaded.data.keys, state.keys);
    assert_eq!(loaded.data.key_positions, state.key_positions);
    assert_eq!(loaded.data.stat_positions, state.stat_positions);
    assert_eq!(loaded.data.layer_groups, state.layer_groups);
    assert_eq!(loaded.data.element_document, state.element_document);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 트리의_망가진_노드만_빼고_읽고_손상_복구로_표시한다() {
    let mut state = default_state();
    attach_loaded_document(&mut state, None).unwrap();
    with_tree_only_element(&mut state);
    let mut document = serde_json::to_value(&*state.element_document).unwrap();
    let nodes = document["scenes"]["4key"]["nodes"].as_array_mut().unwrap();
    let total = nodes.len();
    // 트래커의 frame을 망가뜨린다
    let broken = nodes
        .iter_mut()
        .find(|node| node["id"] == "tracker-1")
        .unwrap();
    broken["frame"] = serde_json::json!("??");
    let (parsed, dropped) = parse_document_lenient(document);
    assert_eq!(dropped, 1);
    assert_eq!(parsed.scenes["4key"].nodes.len(), total - 1);
    assert_eq!(parsed.scenes.len(), state.element_document.scenes.len());
}
