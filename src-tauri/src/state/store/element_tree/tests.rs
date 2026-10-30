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
        serde_json::to_value(compact_document(&snapshot.element_document)).unwrap()
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
    // 저장은 빈 칸을 뺀 압축 모양 - 뜻은 같다
    assert_eq!(
        compact_document(&reloaded.data.element_document),
        compact_document(&snapshot.element_document)
    );
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
        plan @ (ElementDocumentCommitPlan::TreeOnly | ElementDocumentCommitPlan::TreeOrderOnly) => {
            let check_legacy = matches!(plan, ElementDocumentCommitPlan::TreeOnly);
            assert!(matches!(
                store
                    .commit_element_document_checked(&ops, check_legacy, None)
                    .unwrap(),
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
    // 트리 전용 노드는 빼고, 옛 종류 요소는 제자리 기본 모양으로 둔다
    assert_eq!(parsed.scenes["4key"].nodes.len(), total - 1);
    assert_eq!(parsed.scenes.len(), state.element_document.scenes.len());
}

#[test]
fn 흩어진_그룹은_저장된_z를_그대로_지켜_다시_읽어도_순서가_같다() {
    let (dir, store) = open_store();
    // g1 = {key0, key2}, key1은 그룹 밖 - 사이에 끼어 흩어진 그룹
    {
        let mut guard = store.state.write();
        let mut scratch = guard.data.clone();
        let positions = scratch.key_positions.get_mut("4key").unwrap();
        for (index, position) in positions.iter_mut().enumerate() {
            position.z_index = Some(index as i32);
            position.group_id = None;
        }
        positions[0].group_id = Some("g1".into());
        positions[2].group_id = Some("g1".into());
        store.commit_locked(&mut guard, scratch, ()).unwrap();
    }
    let snapshot = store.snapshot();
    let document = store.element_document_snapshot().1;
    assert_eq!(
        project_document(&document).unwrap(),
        crate::models::EditorDocumentV1::from_store(&snapshot),
        "옛 모양 z는 저장된 그대로 내보낸다"
    );
    store.flush_and_shutdown().unwrap();
    drop(store);
    let reloaded = crate::state::migration::load_store_from_path(
        &dir.join(crate::state::store::STORE_FILE_NAME),
    )
    .unwrap();
    assert_eq!(reloaded.data.key_positions, snapshot.key_positions);
    assert!(!reloaded.needs_persist);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 트리_값_하나가_깨져도_그_요소만_기본_모양으로_바꾸고_나머지는_그대로_읽는다() {
    let (dir, store) = open_store();
    store.flush_and_shutdown().unwrap();
    let before = store.snapshot();
    drop(store);
    let path = dir.join(crate::state::store::STORE_FILE_NAME);
    let mut value: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    let nodes = value[ELEMENT_DOCUMENT_FIELD]["scenes"]["6key"]["nodes"]
        .as_array_mut()
        .unwrap();
    let broken_id = nodes[0]["id"].as_str().unwrap().to_string();
    nodes[0]["values"]["count"] = serde_json::json!("abc");
    std::fs::write(&path, serde_json::to_vec_pretty(&value).unwrap()).unwrap();

    let loaded = crate::state::migration::load_store_from_path(&path).unwrap();
    assert!(loaded.repaired);
    assert_eq!(loaded.data.layer_groups, before.layer_groups);
    assert_eq!(loaded.data.keys, before.keys);
    // 모든 종류의 요소가 같은 자리에 남는다 (망가진 요소는 기본 모양으로 제자리)
    let ids = |document: &crate::models::EditorDocumentV1| {
        let value = serde_json::to_value(document).unwrap();
        let mut out = Vec::new();
        for field in [
            "keyPositions",
            "statPositions",
            "graphPositions",
            "knobPositions",
            "spritePositions",
        ] {
            for (mode, list) in value[field].as_object().into_iter().flatten() {
                for item in list.as_array().into_iter().flatten() {
                    out.push(format!("{field}/{mode}/{}", item["id"]));
                }
            }
        }
        out.sort();
        out
    };
    let loaded_ids = ids(&crate::models::EditorDocumentV1::from_store(&loaded.data));
    assert_eq!(
        loaded_ids,
        ids(&crate::models::EditorDocumentV1::from_store(&before))
    );
    assert!(loaded_ids.iter().any(|id| id.contains(&broken_id)));
    let _ = std::fs::remove_dir_all(&dir);
}

fn key_z(store: &crate::state::AppStore, mode: &str) -> Vec<(String, Option<i32>)> {
    store.snapshot().key_positions[mode]
        .iter()
        .map(|position| (position.id.clone(), position.z_index))
        .collect()
}

#[test]
fn 트리_쓰기로_옛_요소를_지워도_흩어진_그룹의_z는_그대로다() {
    let (dir, store) = open_store();
    {
        let mut guard = store.state.write();
        let mut scratch = guard.data.clone();
        let positions = scratch.key_positions.get_mut("4key").unwrap();
        for (index, position) in positions.iter_mut().enumerate() {
            position.z_index = Some(index as i32);
            position.group_id = None;
        }
        positions[0].group_id = Some("g1".into());
        positions[2].group_id = Some("g1".into());
        store.commit_locked(&mut guard, scratch, ()).unwrap();
    }
    let before = key_z(&store, "4key");
    let removed = before[3].0.clone();
    commit_planned(
        &store,
        serde_json::json!([{ "op": "remove", "scene": "4key", "ids": [removed] }]),
    );
    let after = key_z(&store, "4key");
    let expected: Vec<_> = before
        .into_iter()
        .filter(|(id, _)| *id != removed)
        .collect();
    assert_eq!(after, expected);
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 트리_쓰기로_넣은_옛_요소는_트리_자리에_맞는_z를_받고_id를_지킨다() {
    let (dir, store) = open_store();
    let template = store.element_document_snapshot().1.scenes["4key"]
        .elements()
        .into_iter()
        .find(|element| element.kind == "key")
        .unwrap()
        .clone();
    let mut node = serde_json::to_value(&template).unwrap();
    node["type"] = serde_json::json!("element");
    node["id"] = serde_json::json!("0b1c2d3e-0000-4000-8000-000000000001");
    commit_planned(
        &store,
        serde_json::json!([{ "op": "insert", "scene": "4key", "parent": null, "index": null, "node": node }]),
    );
    let z = key_z(&store, "4key");
    let inserted = z
        .iter()
        .find(|(id, _)| id == "0b1c2d3e-0000-4000-8000-000000000001")
        .expect("id를 지킨다");
    let top = z.iter().filter_map(|(_, z)| *z).max().unwrap();
    assert_eq!(inserted.1, Some(top), "맨 위에 넣었으니 가장 높은 z");
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 트리_전용_노드와의_순서만_바꾸는_옛_요소_옮기기도_커밋된다() {
    let (dir, store) = open_store();
    commit_planned(
        &store,
        serde_json::json!([{ "op": "insert", "scene": "4key", "parent": null, "index": null, "node": tracker_json("t1") }]),
    );
    let scene = store.element_document_snapshot().1.scenes["4key"].clone();
    let top_key = scene
        .nodes
        .iter()
        .rev()
        .find(|node| matches!(node, Node::Element(element) if is_legacy_kind(&element.kind)))
        .unwrap()
        .id()
        .to_string();
    commit_planned(
        &store,
        serde_json::json!([{ "op": "move", "scene": "4key", "ids": [top_key], "parent": null, "index": null }]),
    );
    let scene = store.element_document_snapshot().1.scenes["4key"].clone();
    assert_eq!(scene.nodes.last().unwrap().id(), top_key);
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 그룹_머리가_망가져도_멤버는_제자리에_남는다() {
    let mut state = default_state();
    state.layer_groups.insert(
        "4key".into(),
        vec![crate::models::LayerGroupDef {
            id: "g1".into(),
            name: "G".into(),
        }],
    );
    state.key_positions.get_mut("4key").unwrap()[0].group_id = Some("g1".into());
    attach_loaded_document(&mut state, None).unwrap();
    let mut value = serde_json::to_value(&*state.element_document).unwrap();
    let nodes = value["scenes"]["4key"]["nodes"].as_array_mut().unwrap();
    let group = nodes.iter_mut().find(|node| node["id"] == "g1").unwrap();
    group["name"] = serde_json::json!(123);
    let (parsed, dropped) = parse_document_lenient(value);
    assert_eq!(dropped, 1);
    assert_eq!(
        parsed.scenes["4key"].elements().len(),
        state.element_document.scenes["4key"].elements().len()
    );
    assert!(parsed.scenes["4key"].find_path("g1").is_some());
}

#[test]
fn 범위를_벗어난_자리_값은_버리고_그_요소만_대체한다() {
    let (dir, store) = open_store();
    store.flush_and_shutdown().unwrap();
    let before = store.snapshot();
    drop(store);
    let path = dir.join(crate::state::store::STORE_FILE_NAME);
    let mut value: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    let nodes = value[ELEMENT_DOCUMENT_FIELD]["scenes"]["6key"]["nodes"]
        .as_array_mut()
        .unwrap();
    let key = nodes.iter_mut().find(|node| node["kind"] == "key").unwrap();
    key["legacy"]["zIndex"] = serde_json::json!(10_000_000_000_i64);
    std::fs::write(&path, serde_json::to_vec_pretty(&value).unwrap()).unwrap();
    let loaded = crate::state::migration::load_store_from_path(&path).unwrap();
    assert!(loaded.repaired);
    assert_eq!(loaded.data.layer_groups, before.layer_groups);
    assert_eq!(loaded.data.keys, before.keys);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 흩어진_그룹_옆으로_옮겨도_옮기지_않은_요소끼리의_순서는_그대로다() {
    let (dir, store) = open_store();
    // X=z1, A=z0(g1), B=z2(g1), Y=z3 - 나머지는 위로
    {
        let mut guard = store.state.write();
        let mut scratch = guard.data.clone();
        let positions = scratch.key_positions.get_mut("4key").unwrap();
        for (index, position) in positions.iter_mut().enumerate() {
            position.group_id = None;
            position.z_index = Some(10 + index as i32);
        }
        positions[0].z_index = Some(1);
        positions[1].z_index = Some(0);
        positions[1].group_id = Some("g1".into());
        positions[2].z_index = Some(2);
        positions[2].group_id = Some("g1".into());
        positions[3].z_index = Some(3);
        store.commit_locked(&mut guard, scratch, ()).unwrap();
    }
    let order_without = |moved: &str| {
        let mut z: Vec<(i32, String)> = store.snapshot().key_positions["4key"]
            .iter()
            .filter(|position| position.id != moved)
            .map(|position| (position.z_index.unwrap_or(0), position.id.clone()))
            .collect();
        z.sort();
        z.into_iter().map(|(_, id)| id).collect::<Vec<_>>()
    };
    let y = store.snapshot().key_positions["4key"][3].id.clone();
    let before = order_without(&y);
    let scene = store.element_document_snapshot().1.scenes["4key"].clone();
    let x = store.snapshot().key_positions["4key"][0].id.clone();
    let x_at = scene.find_path(&x).unwrap()[0];
    commit_planned(
        &store,
        serde_json::json!([{ "op": "move", "scene": "4key", "ids": [y], "parent": null, "index": x_at + 1 }]),
    );
    assert_eq!(order_without(&y), before);
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 트리_쓰기로_장면을_만들거나_지울_수_없다() {
    let (dir, store) = open_store();
    let ops: Vec<Op> = serde_json::from_value(serde_json::json!([
        { "op": "addScene", "scene": "ghost" },
        { "op": "insert", "scene": "ghost", "parent": null, "index": null, "node": tracker_json("t1") }
    ]))
    .unwrap();
    assert!(matches!(
        store.plan_element_document_commit(&ops, None).unwrap(),
        ElementDocumentCommitPlan::Rejected(ElementDocumentCommitResult::Rejected {
            code: "MANAGED_ELSEWHERE",
            ..
        })
    ));
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

fn set_key_layout(store: &crate::state::AppStore, layout: &[(Option<i32>, Option<&str>)]) {
    let mut guard = store.state.write();
    let mut scratch = guard.data.clone();
    let positions = scratch.key_positions.get_mut("4key").unwrap();
    for (index, position) in positions.iter_mut().enumerate() {
        let (z, group) = layout
            .get(index)
            .copied()
            .unwrap_or((Some(100 + index as i32), None));
        position.z_index = z;
        position.group_id = group.map(str::to_string);
    }
    store.commit_locked(&mut guard, scratch, ()).unwrap();
}

fn tree_key_order(store: &crate::state::AppStore) -> Vec<String> {
    let mut out = Vec::new();
    walk(
        &store.element_document_snapshot().1.scenes["4key"].nodes,
        &mut |node, _| {
            if let Node::Element(element) = node {
                if element.kind == "key" {
                    out.push(element.id.clone());
                }
            }
        },
    );
    out
}

#[test]
fn 같은_z가_있어도_옮긴_요소는_놓은_자리에_남는다() {
    let (dir, store) = open_store();
    set_key_layout(&store, &[(Some(0), None), (Some(0), None)]);
    let keys: Vec<String> = store.snapshot().key_positions["4key"]
        .iter()
        .map(|position| position.id.clone())
        .collect();
    let scene = store.element_document_snapshot().1.scenes["4key"].clone();
    let k0_at = scene.find_path(&keys[0]).unwrap()[0];
    commit_planned(
        &store,
        serde_json::json!([{ "op": "move", "scene": "4key", "ids": [keys[7]], "parent": null, "index": k0_at + 1 }]),
    );
    let order = tree_key_order(&store);
    let at = |id: &String| order.iter().position(|other| other == id).unwrap();
    assert!(
        at(&keys[0]) < at(&keys[7]) && at(&keys[7]) < at(&keys[1]),
        "{order:?}"
    );
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 흩어진_그룹_맨_앞에_넣으면_그_그룹_맨_아래에_남는다() {
    let (dir, store) = open_store();
    // X=z1, A=z0(g1), B=z2(g1), Y=z3
    set_key_layout(
        &store,
        &[
            (Some(1), None),
            (Some(0), Some("g1")),
            (Some(2), Some("g1")),
            (Some(3), None),
        ],
    );
    let keys: Vec<String> = store.snapshot().key_positions["4key"]
        .iter()
        .map(|position| position.id.clone())
        .collect();
    commit_planned(
        &store,
        serde_json::json!([{ "op": "move", "scene": "4key", "ids": [keys[3]], "parent": "g1", "index": 0 }]),
    );
    let scene = store.element_document_snapshot().1.scenes["4key"].clone();
    let group = scene.find_path("g1").unwrap();
    let Some(Node::Group(group)) = scene.node_at(&group) else {
        panic!()
    };
    let members: Vec<&str> = group.children.iter().map(Node::id).collect();
    assert_eq!(
        members,
        vec![keys[3].as_str(), keys[1].as_str(), keys[2].as_str()]
    );
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n.max(1) as u64) as usize
    }
    fn chance(&mut self, percent: u64) -> bool {
        self.next() % 100 < percent
    }
}

// 장면의 옛 종류 요소 - (id, 부모 그룹) 트리 순서
fn legacy_layout_of(scene: &element_document::Scene) -> Vec<(String, Option<String>)> {
    let (mut out, mut ancestors) = (Vec::new(), Vec::<(usize, String)>::new());
    walk(&scene.nodes, &mut |node, path| {
        ancestors.retain(|(depth, _)| *depth < path.len());
        match node {
            Node::Group(group) => ancestors.push((path.len(), group.id.clone())),
            Node::Element(element) if is_legacy_kind(&element.kind) => out.push((
                element.id.clone(),
                ancestors.last().map(|(_, id)| id.clone()),
            )),
            Node::Element(_) => {}
        }
    });
    out
}

fn stacking_order(store: &crate::state::AppStore) -> Vec<String> {
    let snapshot = store.snapshot();
    let mut entries: Vec<((i64, usize, usize), String)> = Vec::new();
    for (index, position) in snapshot.key_positions["4key"].iter().enumerate() {
        entries.push((
            (position.z_index.map_or(index as i64, i64::from), 0, index),
            position.id.clone(),
        ));
    }
    for (index, position) in snapshot.stat_positions["4key"].iter().enumerate() {
        entries.push((
            (
                position.position.z_index.map_or(index as i64, i64::from),
                1,
                index,
            ),
            position.position.id.clone(),
        ));
    }
    entries.sort();
    entries.into_iter().map(|(_, id)| id).collect()
}

#[test]
fn 무작위_트리_쓰기로_옛_요소를_옮겨도_놓은_자리와_나머지_순서를_지킨다() {
    let rounds: usize = std::env::var("DMN_Z_FUZZ_ROUNDS")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(120);
    let mut rng = Rng(0x9e37_79b9_7f4a_7c15);
    let (dir, store) = open_store();
    let template = store.element_document_snapshot().1.scenes["4key"]
        .elements()
        .into_iter()
        .find(|element| element.kind == "key")
        .unwrap()
        .clone();
    let engine = Engine {
        kinds: builtin_kind_registry(),
        bundles: &BuiltinBundles,
    };
    let mut checked = 0;
    for round in 0..rounds {
        // 무작위 배치 - zIndex 일부 없음, 그룹 0~2개(흩어질 수 있음)
        {
            let mut guard = store.state.write();
            let mut scratch = guard.data.clone();
            let group_count = rng.below(3);
            let groups: Vec<crate::models::LayerGroupDef> = (0..group_count)
                .map(|index| crate::models::LayerGroupDef {
                    id: format!("g{index}"),
                    name: format!("G{index}"),
                })
                .collect();
            let mut zs = Vec::new();
            for _ in 0..scratch.key_positions["4key"].len() {
                zs.push((!rng.chance(30)).then(|| rng.below(12) as i32));
            }
            let group_of: Vec<Option<String>> = (0..zs.len())
                .map(|_| {
                    (group_count > 0 && rng.chance(40))
                        .then(|| format!("g{}", rng.below(group_count)))
                })
                .collect();
            for (index, position) in scratch
                .key_positions
                .get_mut("4key")
                .unwrap()
                .iter_mut()
                .enumerate()
            {
                position.z_index = zs[index];
                position.group_id = group_of[index].clone();
            }
            for position in scratch.stat_positions.get_mut("4key").unwrap() {
                position.position.z_index = (!rng.chance(30)).then(|| rng.below(12) as i32);
                position.position.group_id = None;
            }
            scratch.layer_groups.insert("4key".into(), groups);
            crate::state::migration::clear_dangling_group_ids(&mut scratch);
            store.commit_locked(&mut guard, scratch, ()).unwrap();
        }
        let document = store.element_document_snapshot().1;
        let scene = &document.scenes["4key"];
        let legacy = legacy_layout_of(scene);
        let pick = |rng: &mut Rng| legacy[rng.below(legacy.len())].0.clone();
        let parents: Vec<Option<String>> = std::iter::once(None)
            .chain(scene.nodes.iter().filter_map(|node| match node {
                Node::Group(group) => Some(Some(group.id.clone())),
                _ => None,
            }))
            .collect();
        let parent = parents[rng.below(parents.len())].clone();
        let siblings = match &parent {
            None => scene.nodes.len(),
            Some(id) => match scene.node_at(&scene.find_path(id).unwrap()) {
                Some(Node::Group(group)) => group.children.len(),
                _ => 0,
            },
        };
        let index = (!rng.chance(20)).then(|| rng.below(siblings + 1));
        let new_id = format!("00000000-0000-4000-8000-{round:012}");
        let (op, moved): (serde_json::Value, Vec<String>) = match rng.below(3) {
            0 => {
                let id = pick(&mut rng);
                (
                    serde_json::json!({ "op": "move", "scene": "4key", "ids": [id], "parent": parent, "index": index }),
                    vec![id],
                )
            }
            1 => {
                let mut node = serde_json::to_value(&template).unwrap();
                node["type"] = serde_json::json!("element");
                node["id"] = serde_json::json!(new_id);
                node.as_object_mut().unwrap().remove("legacy");
                (
                    serde_json::json!({ "op": "insert", "scene": "4key", "parent": parent, "index": index, "node": node }),
                    vec![new_id.clone()],
                )
            }
            _ => {
                let a = pick(&mut rng);
                let b = pick(&mut rng);
                if a == b {
                    continue;
                }
                (
                    serde_json::json!({ "op": "group", "scene": "4key", "id": format!("n{round}"), "name": "N", "ids": [a, b] }),
                    vec![a, b],
                )
            }
        };
        let ops: Vec<Op> = vec![serde_json::from_value(op.clone()).unwrap()];
        let mut expected = (*document).clone();
        if engine.apply(&mut expected, &ops).is_err() {
            continue;
        }
        let before_order = stacking_order(&store);
        match store.plan_element_document_commit(&ops, None).unwrap() {
            ElementDocumentCommitPlan::Legacy { request, .. } => {
                if store.commit_editor_document(*request).is_err() {
                    continue;
                }
            }
            ElementDocumentCommitPlan::TreeOrderOnly => {
                store
                    .commit_element_document_checked(&ops, false, None)
                    .unwrap();
            }
            ElementDocumentCommitPlan::TreeOnly | ElementDocumentCommitPlan::Rejected(_) => {
                continue;
            }
        }
        // 놓은 자리 - 옮긴 요소의 부모가 같고 그 부모 안 옛 요소 순서가 같다.
        // (그룹의 맨 위 멤버를 빼면 그룹은 남은 맨 위 멤버 자리로 옮겨 서므로 그룹 자리 자체는 보지 않는다)
        let result = store.element_document_snapshot().1;
        let result_layout = legacy_layout_of(&result.scenes["4key"]);
        let expected_layout = legacy_layout_of(&expected.scenes["4key"]);
        let siblings = |layout: &[(String, Option<String>)], parent: &Option<String>| {
            layout
                .iter()
                .filter(|(_, other)| other == parent)
                .map(|(id, _)| id.clone())
                .collect::<Vec<_>>()
        };
        for id in moved.iter().chain(std::iter::once(&new_id)) {
            let Some((_, parent)) = expected_layout.iter().find(|(other, _)| other == id) else {
                continue;
            };
            assert_eq!(
                result_layout
                    .iter()
                    .find(|(other, _)| other == id)
                    .map(|(_, parent)| parent),
                Some(parent),
                "round {round} op {op}"
            );
            assert_eq!(
                siblings(&result_layout, parent),
                siblings(&expected_layout, parent),
                "round {round} op {op}"
            );
        }
        let unmoved = |order: Vec<String>| -> Vec<String> {
            order
                .into_iter()
                .filter(|id| !moved.contains(id) && *id != new_id)
                .collect()
        };
        assert_eq!(
            unmoved(stacking_order(&store)),
            unmoved(before_order),
            "round {round} op {op}"
        );
        checked += 1;
    }
    assert!(checked > rounds / 3, "checked {checked}");
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

// 섞인 선택 끌기 - 옛 종류 요소(옛 편집 커밋)와 트리 요소(트리 커밋)를 같은 동작 id로 옮긴다
fn mixed_gesture_move(store: &crate::state::AppStore, key: &str, legacy_first: bool) {
    let gesture = Some(uuid::Uuid::new_v4().to_string());
    let legacy_ops: Vec<Op> = serde_json::from_value(serde_json::json!([
        { "op": "setFrame", "scene": "4key", "id": key, "frame": { "x": 321 } }
    ]))
    .unwrap();
    let tree_ops: Vec<Op> = serde_json::from_value(serde_json::json!([
        { "op": "setFrame", "scene": "4key", "id": "tracker-1", "frame": { "x": 77 } }
    ]))
    .unwrap();
    let commit_legacy = || match store
        .plan_element_document_commit(&legacy_ops, gesture.clone())
        .unwrap()
    {
        ElementDocumentCommitPlan::Legacy { request, .. } => {
            store.commit_editor_document(*request).unwrap();
        }
        other => panic!(
            "옛 편집 커밋이어야 한다: {}",
            matches!(other, ElementDocumentCommitPlan::TreeOnly)
        ),
    };
    let commit_tree = || {
        assert!(matches!(
            store
                .commit_element_document_checked(&tree_ops, true, gesture.clone())
                .unwrap(),
            ElementDocumentCommitResult::Committed { .. }
        ));
    };
    if legacy_first {
        commit_legacy();
        commit_tree();
    } else {
        commit_tree();
        commit_legacy();
    }
}

fn insert_tracker(store: &crate::state::AppStore) {
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
}

#[test]
fn 같은_동작의_옛_편집과_트리_편집은_한_번에_되돌리고_다시_한다() {
    use crate::state::history::HistoryDirection;
    for legacy_first in [true, false] {
        let (dir, store) = open_store();
        insert_tracker(&store);
        let key = store.snapshot().key_positions["4key"][1].id.clone();
        let key_x = store.snapshot().key_positions["4key"][1].dx;
        mixed_gesture_move(&store, &key, legacy_first);
        let positions = |store: &crate::state::AppStore| {
            let document = store.element_document_snapshot().1;
            (
                store.snapshot().key_positions["4key"][1].dx,
                document.scenes["4key"]
                    .element("tracker-1")
                    .unwrap()
                    .frame
                    .x,
            )
        };
        assert_eq!(positions(&store), (321.0, 77.0));

        let counters = Default::default();
        store
            .apply_history_operation(
                HistoryDirection::Undo,
                &uuid::Uuid::new_v4().to_string(),
                &counters,
                || {},
            )
            .unwrap();
        assert_eq!(
            positions(&store),
            (key_x, 5.0),
            "legacy_first={legacy_first}"
        );
        assert_eq!(
            project_document(&store.element_document_snapshot().1).unwrap(),
            crate::models::EditorDocumentV1::from_store(&store.snapshot())
        );

        store
            .apply_history_operation(
                HistoryDirection::Redo,
                &uuid::Uuid::new_v4().to_string(),
                &counters,
                || {},
            )
            .unwrap();
        assert_eq!(
            positions(&store),
            (321.0, 77.0),
            "legacy_first={legacy_first}"
        );

        // 한 번 더 되돌리면 넣기까지 되돌아간다 - 동작이 한 단계였다
        store
            .apply_history_operation(
                HistoryDirection::Undo,
                &uuid::Uuid::new_v4().to_string(),
                &counters,
                || {},
            )
            .unwrap();
        store
            .apply_history_operation(
                HistoryDirection::Undo,
                &uuid::Uuid::new_v4().to_string(),
                &counters,
                || {},
            )
            .unwrap();
        assert!(store.element_document_snapshot().1.scenes["4key"]
            .element("tracker-1")
            .is_none());
        store.flush_and_shutdown().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[test]
fn 옛_칸에_이미지를_둔_노브를_읽으면_이미지_묶음으로_올리고_옛_모양에도_남는다() {
    let mut state = default_state();
    state.knob_positions.insert(
        "4key".into(),
        vec![crate::models::KnobPosition {
            axis_id: String::new(),
            sensitivity: 1.0,
            reverse: false,
            position: crate::models::KeyPosition {
                id: "00000000-0000-4000-8000-0000000000aa".into(),
                dx: 10.0,
                dy: 20.0,
                width: 60.0,
                height: 60.0,
                ..Default::default()
            },
        }],
    );
    attach_loaded_document(&mut state, None).unwrap();
    // 노브에 이미지 묶음이 생기기 전 모양 - 이미지 칸이 옛 칸에 있다
    let mut stored = serde_json::to_value(&*state.element_document).unwrap();
    let knob = stored["scenes"]["4key"]["nodes"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|node| node["kind"] == "knob")
        .unwrap();
    knob["bundles"].as_object_mut().unwrap().remove("image");
    knob["legacy"]["fields"] =
        serde_json::json!({ "activeImage": "a.png", "idleTransparent": true });
    let dir = std::env::temp_dir().join(format!("dmn-knob-lift-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(crate::state::store::STORE_FILE_NAME);
    let mut value = serde_json::to_value(&state).unwrap();
    let object = value.as_object_mut().unwrap();
    for field in LEGACY_ELEMENT_FIELDS {
        object.remove(field);
    }
    object.insert(ELEMENT_DOCUMENT_FIELD.into(), stored);
    std::fs::write(&path, serde_json::to_vec_pretty(&value).unwrap()).unwrap();

    let loaded = crate::state::migration::load_store_from_path(&path).unwrap();
    assert!(!loaded.repaired);
    let knob = &loaded.data.knob_positions["4key"][0];
    assert_eq!(knob.position.active_image.as_deref(), Some("a.png"));
    assert!(knob.position.idle_transparent);
    let element = loaded.data.element_document.scenes["4key"]
        .element("00000000-0000-4000-8000-0000000000aa")
        .unwrap();
    assert_eq!(
        element.bundles["image"]["activeImage"],
        serde_json::json!("a.png")
    );
    let _ = std::fs::remove_dir_all(&dir);
}

fn move_tracker(store: &crate::state::AppStore, id: &str, x: f64, gesture: Option<String>) {
    let ops: Vec<Op> = serde_json::from_value(serde_json::json!([
        { "op": "setFrame", "scene": "4key", "id": id, "frame": { "x": x } }
    ]))
    .unwrap();
    assert!(matches!(
        store
            .commit_element_document_checked(&ops, true, gesture)
            .unwrap(),
        ElementDocumentCommitResult::Committed { .. }
    ));
}

fn undo(store: &crate::state::AppStore) -> Result<(), String> {
    use crate::state::history::HistoryDirection;
    let counters = Default::default();
    store
        .apply_history_operation(
            HistoryDirection::Undo,
            &uuid::Uuid::new_v4().to_string(),
            &counters,
            || {},
        )
        .map(|_| ())
}

#[test]
fn 같은_동작에서_제자리로_돌아온_트리_편집은_기록에서_빠지고_되돌리기가_막히지_않는다() {
    let (dir, store) = open_store();
    insert_tracker(&store);
    let gesture = Some(uuid::Uuid::new_v4().to_string());
    move_tracker(&store, "tracker-1", 6.0, gesture.clone());
    move_tracker(&store, "tracker-1", 5.0, gesture);
    // 제자리로 돌아온 동작은 기록이 없다 - 한 번 되돌리면 넣기가 되돌아간다
    undo(&store).unwrap();
    assert!(store.element_document_snapshot().1.scenes["4key"]
        .element("tracker-1")
        .is_none());
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 섞인_동작이_제자리로_돌아오면_기록에서_빠진다() {
    let (dir, store) = open_store();
    insert_tracker(&store);
    let key = store.snapshot().key_positions["4key"][1].id.clone();
    let key_x = store.snapshot().key_positions["4key"][1].dx;
    let gesture = Some(uuid::Uuid::new_v4().to_string());
    let legacy_move = |x: f64| {
        let ops: Vec<Op> = serde_json::from_value(serde_json::json!([
            { "op": "setFrame", "scene": "4key", "id": key, "frame": { "x": x } }
        ]))
        .unwrap();
        match store
            .plan_element_document_commit(&ops, gesture.clone())
            .unwrap()
        {
            ElementDocumentCommitPlan::Legacy { request, .. } => {
                store.commit_editor_document(*request).unwrap();
            }
            _ => panic!("옛 편집 커밋이어야 한다"),
        }
    };
    legacy_move(321.0);
    move_tracker(&store, "tracker-1", 77.0, gesture.clone());
    legacy_move(key_x);
    move_tracker(&store, "tracker-1", 5.0, gesture.clone());
    undo(&store).unwrap();
    assert!(store.element_document_snapshot().1.scenes["4key"]
        .element("tracker-1")
        .is_none());
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 사이에_다른_트리_편집이_끼면_같은_동작이라도_따로_기록한다() {
    let (dir, store) = open_store();
    insert_tracker(&store);
    let insert: Op = serde_json::from_value(serde_json::json!({
        "op": "insert", "scene": "4key", "parent": null, "index": null,
        "node": { "type": "element", "id": "tracker-2", "kind": "cursorTracker",
                  "frame": { "x": 5, "y": 5, "width": 120, "height": 120 } }
    }))
    .unwrap();
    store.commit_element_document(&[insert]).unwrap();
    let key = store.snapshot().key_positions["4key"][1].id.clone();
    let key_x = store.snapshot().key_positions["4key"][1].dx;
    let gesture = Some(uuid::Uuid::new_v4().to_string());
    // 옛 편집(g) → 다른 트리 편집 P → 트리 편집(g)
    let ops: Vec<Op> = serde_json::from_value(serde_json::json!([
        { "op": "setFrame", "scene": "4key", "id": key, "frame": { "x": 321 } }
    ]))
    .unwrap();
    match store
        .plan_element_document_commit(&ops, gesture.clone())
        .unwrap()
    {
        ElementDocumentCommitPlan::Legacy { request, .. } => {
            store.commit_editor_document(*request).unwrap();
        }
        _ => panic!("옛 편집 커밋이어야 한다"),
    }
    move_tracker(&store, "tracker-2", 50.0, None);
    move_tracker(&store, "tracker-1", 77.0, gesture);
    let xs = |store: &crate::state::AppStore| {
        let document = store.element_document_snapshot().1;
        let scene = &document.scenes["4key"];
        (
            scene.element("tracker-1").unwrap().frame.x,
            scene.element("tracker-2").unwrap().frame.x,
            store.snapshot().key_positions["4key"][1].dx,
        )
    };
    assert_eq!(xs(&store), (77.0, 50.0, 321.0));
    undo(&store).unwrap();
    assert_eq!(xs(&store), (5.0, 50.0, 321.0));
    undo(&store).unwrap();
    assert_eq!(xs(&store), (5.0, 5.0, 321.0));
    undo(&store).unwrap();
    assert_eq!(xs(&store), (5.0, 5.0, key_x));
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 같은_동작_사이에_다른_편집이_끼면_되돌리기_단계를_잃지_않는다() {
    let (dir, store) = open_store();
    insert_tracker(&store);
    let gesture = Some(uuid::Uuid::new_v4().to_string());
    move_tracker(&store, "tracker-1", 6.0, gesture.clone());
    move_tracker(&store, "tracker-1", 4.0, None);
    move_tracker(&store, "tracker-1", 5.0, gesture);
    let x = |store: &crate::state::AppStore| {
        store.element_document_snapshot().1.scenes["4key"]
            .element("tracker-1")
            .map(|element| element.frame.x)
    };
    for expected in [Some(4.0), Some(6.0), Some(5.0), None] {
        undo(&store).unwrap();
        assert_eq!(x(&store), expected);
    }
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 옛_종류와_트리_요소를_한_트리_커밋으로_옮기면_한_번에_되돌리고_다시_한다() {
    use crate::state::history::HistoryDirection;
    let (dir, store) = open_store();
    insert_tracker(&store);
    let key = store.snapshot().key_positions["4key"][1].id.clone();
    let key_x = store.snapshot().key_positions["4key"][1].dx;
    // 트리 선택에 옛 종류(트리로 옮긴 노브 등)와 트리 요소가 섞인 끌기 - 한 커밋
    let ops: Vec<Op> = serde_json::from_value(serde_json::json!([
        { "op": "setFrame", "scene": "4key", "id": key, "frame": { "x": 321 } },
        { "op": "setFrame", "scene": "4key", "id": "tracker-1", "frame": { "x": 77 } }
    ]))
    .unwrap();
    match store.plan_element_document_commit(&ops, None).unwrap() {
        ElementDocumentCommitPlan::Legacy { request, .. } => {
            store.commit_editor_document(*request).unwrap();
        }
        _ => panic!("옛 편집 커밋이어야 한다"),
    }
    let positions = |store: &crate::state::AppStore| {
        (
            store.snapshot().key_positions["4key"][1].dx,
            store.element_document_snapshot().1.scenes["4key"]
                .element("tracker-1")
                .unwrap()
                .frame
                .x,
        )
    };
    assert_eq!(positions(&store), (321.0, 77.0));
    undo(&store).unwrap();
    assert_eq!(positions(&store), (key_x, 5.0));
    let counters = Default::default();
    store
        .apply_history_operation(
            HistoryDirection::Redo,
            &uuid::Uuid::new_v4().to_string(),
            &counters,
            || {},
        )
        .unwrap();
    assert_eq!(positions(&store), (321.0, 77.0));
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 지운_키를_가리키는_트리거가_있는_스프라이트도_트리_쓰기로_옮기고_돌린다() {
    // 옛 계약 - 키를 지워도 스프라이트 트리거는 남는다(패널에 '삭제된 키'). 트리 쓰기도 막지 않는다
    let dir = std::env::temp_dir().join(format!("dmn-element-commit-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let mut state = default_state();
    let sprite_id = uuid::Uuid::new_v4().to_string();
    let mut sprite = crate::models::ReactiveSpritePosition {
        id: sprite_id.clone(),
        ..Default::default()
    };
    sprite.poses.push(crate::models::SpritePose {
        pose_id: uuid::Uuid::new_v4().to_string(),
        name: None,
        triggers: vec![uuid::Uuid::new_v4().to_string()],
        transform: sprite.idle_transform,
        pivot: None,
        image_override: None,
        image_override_metrics: None,
    });
    state.sprite_positions.insert("4key".into(), vec![sprite]);
    std::fs::write(
        dir.join(crate::state::store::STORE_FILE_NAME),
        serde_json::to_vec_pretty(&state).unwrap(),
    )
    .unwrap();
    let store = crate::state::AppStore::initialize_for_test(&dir).unwrap();
    commit_planned(
        &store,
        serde_json::json!([{ "op": "setFrame", "scene": "4key", "id": sprite_id, "frame": { "x": 77, "rotation": 30 } }]),
    );
    let moved = &store.snapshot().sprite_positions["4key"][0];
    assert_eq!(moved.dx, 77.0);
    assert_eq!(moved.rotation, 30.0);
    assert_eq!(moved.poses[0].triggers.len(), 1);
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 스프라이트_자세의_하나뿐인_트리거_키를_트리_쓰기로_지워도_트리거는_남는다() {
    // 옛 계약 - 키를 지워도 자세 트리거는 남는다(패널에 '삭제된 키'). 비우면 옛 검증이 거부한다
    let (dir, store) = open_store();
    let key = store.snapshot().key_positions["4key"][0].id.clone();
    {
        let mut guard = store.state.write();
        let mut scratch = guard.data.clone();
        let mut sprite = crate::models::ReactiveSpritePosition {
            id: uuid::Uuid::new_v4().to_string(),
            ..Default::default()
        };
        sprite.poses.push(crate::models::SpritePose {
            pose_id: uuid::Uuid::new_v4().to_string(),
            name: None,
            triggers: vec![key.clone()],
            transform: sprite.idle_transform,
            pivot: None,
            image_override: None,
            image_override_metrics: None,
        });
        scratch.sprite_positions.insert("4key".into(), vec![sprite]);
        store.commit_locked(&mut guard, scratch, ()).unwrap();
    }
    commit_planned(
        &store,
        serde_json::json!([{ "op": "remove", "scene": "4key", "ids": [key] }]),
    );
    let snapshot = store.snapshot();
    assert!(snapshot.key_positions["4key"].iter().all(|p| p.id != key));
    assert_eq!(
        snapshot.sprite_positions["4key"][0].poses[0].triggers,
        vec![key]
    );
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

fn plugin_kind_schema() -> element_document::schema::KindSchema {
    serde_json::from_value(serde_json::json!({
        "kind": "plugin:demo",
        "version": 1,
        "fields": [{ "name": "label", "value": { "type": "string" }, "default": "" }],
        "defaultSize": { "width": 100, "height": 50 },
        "fallbackSize": { "width": 100, "height": 50 }
    }))
    .unwrap()
}

fn plugin_commit(
    store: &crate::state::AppStore,
    ops: serde_json::Value,
) -> ElementDocumentCommitResult {
    let ops: Vec<Op> = serde_json::from_value(ops).unwrap();
    store
        .commit_element_document_checked(&ops, true, None)
        .unwrap()
}

#[test]
fn 플러그인_외부_종류는_등록하면_트리에_넣고_고칠_수_있고_빼면_모르는_종류로_보존된다() {
    let (dir, store) = open_store();
    let insert = serde_json::json!([{ "op": "insert", "scene": "4key", "parent": null, "index": null, "node": {
        "type": "element", "id": "p1", "kind": "plugin:demo",
        "frame": { "x": 0, "y": 0, "width": 100, "height": 50, "rotation": 0 },
        "values": { "label": "a" }
    } }]);
    // 등록 전에는 모르는 종류라 넣을 수 없다
    assert!(matches!(
        plugin_commit(&store, insert.clone()),
        ElementDocumentCommitResult::Rejected { .. }
    ));
    // 내장 종류 이름이나 앞머리 없는 이름은 받지 않는다
    let mut builtin = plugin_kind_schema();
    builtin.kind = "key".into();
    assert!(store.register_external_kind(builtin).is_err());
    store.register_external_kind(plugin_kind_schema()).unwrap();
    assert!(matches!(
        plugin_commit(&store, insert),
        ElementDocumentCommitResult::Committed { .. }
    ));
    let set_label = serde_json::json!([{ "op": "setValues", "scene": "4key", "id": "p1", "values": { "label": "b" } }]);
    assert!(matches!(
        plugin_commit(&store, set_label.clone()),
        ElementDocumentCommitResult::Committed { .. }
    ));
    // 빼면 값은 보존되고 값 쓰기는 막히지만 옮기기는 된다
    store.unregister_external_kind("plugin:demo");
    assert!(matches!(
        plugin_commit(&store, set_label),
        ElementDocumentCommitResult::Rejected { .. }
    ));
    assert!(matches!(
        plugin_commit(
            &store,
            serde_json::json!([{ "op": "setFrame", "scene": "4key", "id": "p1", "frame": { "x": 9 } }])
        ),
        ElementDocumentCommitResult::Committed { .. }
    ));
    let (_, document) = store.element_document_snapshot();
    let element = document.scenes["4key"].element("p1").unwrap();
    assert_eq!(element.values["label"], serde_json::json!("b"));
    assert_eq!(element.frame.x, 9.0);
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 트리_편집을_되돌려도_그_사이_바뀐_플러그인_인스턴스는_되돌아가지_않는다() {
    use crate::state::history::HistoryDirection;
    let (dir, store) = open_store();
    let bucket = |x: f64| serde_json::json!([{ "instanceId": "i1", "position": { "x": x, "y": 0 }, "tabId": "4key" }]);
    {
        let mut guard = store.state.write();
        let mut scratch = guard.data.clone();
        crate::state::plugin::write_plugin_instance_bucket(&mut scratch, "demo", Some(bucket(1.0)));
        store.commit_locked(&mut guard, scratch, ()).unwrap();
    }
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
    // 그 사이 플러그인 인스턴스가 바뀐다 (플러그인 기록 몫)
    {
        let mut guard = store.state.write();
        let mut scratch = guard.data.clone();
        crate::state::plugin::write_plugin_instance_bucket(&mut scratch, "demo", Some(bucket(9.0)));
        store.commit_locked(&mut guard, scratch, ()).unwrap();
    }
    store
        .apply_history_operation(
            HistoryDirection::Undo,
            &uuid::Uuid::new_v4().to_string(),
            &Default::default(),
            || {},
        )
        .unwrap();
    let snapshot = store.snapshot();
    assert!(snapshot.element_document.scenes["4key"]
        .element("tracker-1")
        .is_none());
    assert_eq!(
        crate::state::plugin::read_plugin_instance_bucket(&snapshot, "demo"),
        Some(bucket(9.0))
    );
    assert!(snapshot.element_document.scenes["4key"]
        .element("demo::i1")
        .is_some());
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 프리셋_트리_정보에는_플러그인_인스턴스를_싣지_않고_전체_프리셋을_불러와도_인스턴스는_남는다() {
    let mut state = default_state();
    crate::state::store::attach_loaded_document(&mut state, None).unwrap();
    crate::state::plugin::write_plugin_instance_bucket(
        &mut state,
        "demo",
        Some(
            serde_json::json!([{ "instanceId": "i1", "position": { "x": 1, "y": 2 }, "tabId": "4key" }]),
        ),
    );
    let scene = &state.element_document.scenes["4key"];
    assert!(crate::models::legacy_layout::preset_scene(scene).is_none());
    let before = crate::state::plugin::read_plugin_instance_bucket(&state, "demo");
    apply_full_preset_tree(&mut state, None).unwrap();
    assert_eq!(
        crate::state::plugin::read_plugin_instance_bucket(&state, "demo"),
        before
    );
}

#[test]
fn 플러그인_노드_옆으로만_자리를_바꾼_트리_커밋은_빈_되돌리기_기록을_남기지_않는다() {
    let (dir, store) = open_store();
    let insert: Op = serde_json::from_value(serde_json::json!({
        "op": "insert", "scene": "4key", "parent": null, "index": null,
        "node": { "type": "element", "id": "tracker-1", "kind": "cursorTracker",
                  "frame": { "x": 5, "y": 5, "width": 120, "height": 120 } }
    }))
    .unwrap();
    store.commit_element_document(&[insert]).unwrap();
    {
        let mut guard = store.state.write();
        let mut scratch = guard.data.clone();
        crate::state::plugin::write_plugin_instance_bucket(
            &mut scratch,
            "demo",
            Some(
                serde_json::json!([{ "instanceId": "00000000-0000-4000-8000-0000000000a1",
                "position": { "x": 0, "y": 0 }, "tabId": "4key" }]),
            ),
        );
        store.commit_locked(&mut guard, scratch, ()).unwrap();
    }
    let undo_entries = |store: &crate::state::AppStore| {
        let status = store.history_status();
        (status.history_revision, status.can_undo, status.can_redo)
    };
    let before = undo_entries(&store);
    // 맨 위가 [트래커, 플러그인] - 트래커를 맨 위로 올리면 플러그인 노드 옆으로만 바뀐다
    let raise: Op = serde_json::from_value(serde_json::json!({
        "op": "move", "scene": "4key", "ids": ["tracker-1"], "parent": null, "index": null
    }))
    .unwrap();
    assert!(matches!(
        store.commit_element_document(&[raise]).unwrap(),
        ElementDocumentCommitResult::Committed { .. }
    ));
    assert_eq!(undo_entries(&store), before);
    store.flush_and_shutdown().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 옛_모양에서_탭이_빠져_장면이_버려져도_그_탭의_플러그인_인스턴스는_보존된다() {
    let mut before = default_state();
    // 사용자 탭 하나 - 옛 모양에서 빠지면 장면이 버려진다
    let keys = before.keys["4key"].clone();
    let positions = before.key_positions["4key"]
        .iter()
        .map(|position| crate::models::KeyPosition {
            id: uuid::Uuid::new_v4().to_string(),
            ..position.clone()
        })
        .collect::<Vec<_>>();
    before.keys.insert("custom-x".into(), keys);
    before.key_positions.insert("custom-x".into(), positions);
    crate::state::store::attach_loaded_document(&mut before, None).unwrap();
    assert!(before.element_document.scenes.contains_key("custom-x"));
    let instances = serde_json::json!([{ "instanceId": "00000000-0000-4000-8000-0000000000a2",
        "position": { "x": 0, "y": 0 }, "tabId": "custom-x" }]);
    crate::state::plugin::write_plugin_instance_bucket(
        &mut before,
        "demo",
        Some(instances.clone()),
    );
    let mut after = before.clone();
    after.keys.remove("custom-x");
    after.key_positions.remove("custom-x");
    sync_element_document(&before, &mut after).unwrap();
    assert!(!after.element_document.scenes.contains_key("custom-x"));
    assert_eq!(
        crate::state::plugin::read_plugin_instance_bucket(&after, "demo"),
        Some(instances)
    );
}
