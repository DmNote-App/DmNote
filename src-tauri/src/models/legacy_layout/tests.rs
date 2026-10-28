use std::collections::HashMap;

use element_document::document::walk;
use element_document::{Engine, Node, Op};
use serde_json::json;

use super::*;
use crate::defaults::{default_keys, default_positions, default_stat_positions};
use crate::models::{
    GraphPosition, GraphStatType, GraphType, KnobPosition, LayerGroupDef, ReactiveSpritePosition,
    SpritePose, StatPosition, StatType,
};

fn element_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

// 기본 탭 데이터 + 그래프·노브·스프라이트·그룹을 고루 섞은 옛 문서
fn sample() -> EditorDocumentV1 {
    let mut key_positions = default_positions().clone();
    for positions in key_positions.values_mut() {
        for position in positions.iter_mut() {
            position.id = element_id();
        }
    }
    let mut stat_positions = default_stat_positions().clone();
    for positions in stat_positions.values_mut() {
        for position in positions.iter_mut() {
            position.position.id = element_id();
        }
    }
    let four = key_positions.get_mut("4key").unwrap();
    four[0].group_id = Some("g1".into());
    four[2].group_id = Some("g1".into());
    four[1].z_index = Some(40);
    four[3].layer_name = Some("오른쪽".into());
    four[3].graph_animation_enabled = Some(true);
    let trigger = four[0].id.clone();

    let graph = GraphPosition {
        stat_type: GraphStatType::KpsMax,
        graph_type: GraphType::Bar,
        graph_speed: 2500,
        graph_color: "#123456".into(),
        show_avg_line: false,
        position: KeyPosition {
            id: element_id(),
            width: 200.0,
            height: 100.0,
            z_index: Some(5),
            group_id: Some("g1".into()),
            note_glow_size: 33.0,
            ..KeyPosition::default()
        },
    };
    let knob = KnobPosition {
        axis_id: "hid:1:2".into(),
        sensitivity: 2.5,
        reverse: true,
        position: KeyPosition {
            id: element_id(),
            ..KeyPosition::default()
        },
    };
    let sprite = ReactiveSpritePosition {
        id: element_id(),
        base_image: Some("images/base.png".into()),
        poses: vec![SpritePose {
            pose_id: element_id(),
            triggers: vec![trigger],
            ..SpritePose::default()
        }],
        z_index: Some(1),
        ..ReactiveSpritePosition::default()
    };
    let mut stat = stat_positions
        .get("4key")
        .and_then(|list| list.first())
        .cloned()
        .unwrap_or(StatPosition {
            stat_type: StatType::Total,
            position: KeyPosition::default(),
        });
    stat.position.id = element_id();
    stat.stat_type = StatType::KpsAvg;

    EditorDocumentV1 {
        schema_version: super::super::EDITOR_SCHEMA_VERSION,
        keys: default_keys().clone(),
        key_positions,
        stat_positions: HashMap::from([("4key".to_string(), vec![stat])]),
        graph_positions: HashMap::from([("4key".to_string(), vec![graph])]),
        knob_positions: HashMap::from([
            ("4key".to_string(), vec![knob]),
            ("5key".to_string(), vec![]),
        ]),
        sprite_positions: HashMap::from([("4key".to_string(), vec![sprite])]),
        layer_groups: HashMap::from([(
            "4key".to_string(),
            vec![
                LayerGroupDef {
                    id: "g1".into(),
                    name: "왼손".into(),
                },
                LayerGroupDef {
                    id: "g-plugin".into(),
                    name: "플러그인만".into(),
                },
            ],
        )]),
    }
}

fn tree_ids(document: &Document, mode: &str) -> Vec<String> {
    let mut out = Vec::new();
    walk(&document.scenes[mode].nodes, &mut |node, path| {
        out.push(format!("{}@{}", node.id(), path.len()));
    });
    out
}

#[test]
fn 가져온_뒤_내보내면_원래_옛_모양과_같다() {
    let legacy = sample();
    let document = import_document(&legacy).unwrap();
    // 4key는 흩어진 그룹을 모아서 zIndex가 다시 매겨진다 - 그 장면만 순서 값이 달라진다
    let mut projected = project_document(&document).unwrap();
    for mode in legacy.keys.keys().filter(|mode| *mode != "4key") {
        assert_eq!(projected.keys[mode], legacy.keys[mode], "{mode} keys");
        assert_eq!(
            projected.key_positions.get(mode),
            legacy.key_positions.get(mode),
            "{mode}"
        );
        assert_eq!(
            projected.stat_positions.get(mode),
            legacy.stat_positions.get(mode),
            "{mode}"
        );
    }
    assert_eq!(projected.knob_positions.get("5key"), Some(&vec![]));
    assert_eq!(projected.layer_groups, legacy.layer_groups);

    // zIndex만 빼면 4key도 같다
    let strip = |document: &mut EditorDocumentV1| {
        for list in document.key_positions.values_mut() {
            list.iter_mut().for_each(|position| position.z_index = None);
        }
        for list in document.graph_positions.values_mut() {
            list.iter_mut()
                .for_each(|position| position.position.z_index = None);
        }
        for list in document.sprite_positions.values_mut() {
            list.iter_mut().for_each(|position| position.z_index = None);
        }
        for list in document.stat_positions.values_mut() {
            list.iter_mut()
                .for_each(|position| position.position.z_index = None);
        }
        for list in document.knob_positions.values_mut() {
            list.iter_mut()
                .for_each(|position| position.position.z_index = None);
        }
    };
    let mut expected = legacy.clone();
    strip(&mut expected);
    strip(&mut projected);
    assert_eq!(projected, expected);
}

#[test]
fn 그룹이_흩어져_있지_않으면_z_index까지_그대로_되돌린다() {
    let mut legacy = sample();
    for position in legacy.key_positions.get_mut("4key").unwrap() {
        position.group_id = None;
    }
    legacy.graph_positions.get_mut("4key").unwrap()[0]
        .position
        .group_id = None;
    let projected = project_document(&import_document(&legacy).unwrap()).unwrap();
    assert_eq!(projected, legacy);
}

#[test]
fn 흩어진_그룹은_가장_위_멤버_자리로_모은다() {
    let legacy = sample();
    let document = import_document(&legacy).unwrap();
    let four = &legacy.key_positions["4key"];
    let ids = tree_ids(&document, "4key");
    let group_at = ids.iter().position(|id| id == "g1@1").unwrap();
    // 그룹 멤버(키 0, 키 2, 그래프)는 그룹 바로 아래 깊이 2로 이어진다
    let members: Vec<&String> = ids[group_at + 1..group_at + 4].iter().collect();
    for member in [
        &four[0].id,
        &four[2].id,
        &legacy.graph_positions["4key"][0].position.id,
    ] {
        assert!(
            members.contains(&&format!("{member}@2")),
            "{member} in {members:?}"
        );
    }
    // 멤버 없는 그룹도 남는다
    assert!(ids.contains(&"g-plugin@1".to_string()));
}

#[test]
fn 종류별로_공통_정보_묶음_고유_값_입력이_나뉜다() {
    let legacy = sample();
    let document = import_document(&legacy).unwrap();
    let scene = &document.scenes["4key"];
    let key = scene.element(&legacy.key_positions["4key"][3].id).unwrap();
    assert_eq!(key.name.as_deref(), Some("오른쪽"));
    assert_eq!(
        key.input,
        Some(InputBinding::Key {
            slot: json!(legacy.keys["4key"][3])
        })
    );
    assert!(key.bundles.contains_key("note") && key.bundles.contains_key("sound"));
    assert_eq!(
        key.extra["legacy"]["fields"],
        json!({ "graphAnimationEnabled": true })
    );

    let graph = scene
        .element(&legacy.graph_positions["4key"][0].position.id)
        .unwrap();
    assert_eq!(graph.values["graphType"], json!("bar"));
    assert_eq!(graph.values["graphSpeed"], json!(2500));
    assert_eq!(graph.bundles.keys().collect::<Vec<_>>(), vec!["surface"]);
    // 그래프가 안 쓰는 노트 칸도 기본값과 다르면 보존한다
    assert_eq!(graph.extra["legacy"]["fields"]["noteGlowSize"], json!(33.0));

    let knob = scene
        .element(&legacy.knob_positions["4key"][0].position.id)
        .unwrap();
    assert_eq!(
        knob.input,
        Some(InputBinding::Axis {
            axis_id: "hid:1:2".into()
        })
    );
    assert_eq!(knob.values["sensitivity"], json!(2.5));

    let sprite = scene
        .element(&legacy.sprite_positions["4key"][0].id)
        .unwrap();
    assert_eq!(sprite.values["baseImage"], json!("images/base.png"));
    assert_eq!(
        sprite.values["poses"][0]["triggers"],
        json!([legacy.key_positions["4key"][0].id])
    );
    assert!(sprite.bundles.is_empty());
}

#[test]
fn 옛_쓰기로_값만_바뀌면_트리_구조와_새_종류를_지킨다() {
    let legacy = sample();
    let mut document = import_document(&legacy).unwrap();
    // 트리에만 있는 정보: 그룹 숨김, 새 종류 요소
    let kinds = {
        let mut registry = builtin_kind_registry().clone();
        registry
            .register(serde_json::from_value(json!({
                "kind": "probe", "version": 1, "fields": [],
                "defaultSize": { "width": 10, "height": 10 }, "fallbackSize": { "width": 10, "height": 10 }
            })).unwrap())
            .unwrap();
        registry
    };
    let engine = Engine {
        kinds: &kinds,
        bundles: &BuiltinBundles,
    };
    let probe: Node = serde_json::from_value(json!({
        "type": "element", "id": "probe-1", "kind": "probe",
        "frame": { "x": 0, "y": 0, "width": 10, "height": 10 }
    }))
    .unwrap();
    engine
        .apply(
            &mut document,
            &[
                Op::Insert {
                    scene: "4key".into(),
                    parent: Some("g1".into()),
                    index: Some(0),
                    node: probe,
                },
                Op::SetGroup {
                    scene: "4key".into(),
                    id: "g1".into(),
                    name: None,
                    hidden: Some(true),
                },
            ],
        )
        .unwrap();

    let mut edited = legacy.clone();
    edited.key_positions.get_mut("4key").unwrap()[0].dx = 999.0;
    let next = reconcile_document(&document, Some(LegacyRef::from(&legacy)), &edited).unwrap();
    let scene = &next.scenes["4key"];
    assert_eq!(
        scene
            .element(&legacy.key_positions["4key"][0].id)
            .unwrap()
            .frame
            .x,
        999.0
    );
    assert_eq!(scene.parent_of("probe-1"), Some(Some("g1".to_string())));
    assert_eq!(tree_ids(&next, "4key"), tree_ids(&document, "4key"));
    let hidden = scene.nodes.iter().find_map(|node| match node {
        Node::Group(group) if group.id == "g1" => Some(group.hidden),
        _ => None,
    });
    assert_eq!(hidden, Some(true));
}

#[test]
fn 옛_쓰기로_순서가_바뀌면_새로_만들고_새_종류는_아래_이웃_뒤에_끼운다() {
    let mut legacy = sample();
    for position in legacy.key_positions.get_mut("4key").unwrap() {
        position.group_id = None;
    }
    legacy.graph_positions.get_mut("4key").unwrap()[0]
        .position
        .group_id = None;
    let mut document = import_document(&legacy).unwrap();
    let first_key = legacy.key_positions["4key"][0].id.clone();
    let probe: Node = serde_json::from_value(json!({
        "type": "element", "id": "probe-1", "kind": "probe",
        "frame": { "x": 0, "y": 0, "width": 10, "height": 10 }
    }))
    .unwrap();
    let scene = document.scenes.get_mut("4key").unwrap();
    let anchor = scene.find_path(&first_key).unwrap();
    scene.nodes.insert(anchor[0] + 1, probe);

    let mut edited = legacy.clone();
    // 첫 키를 맨 위로
    edited.key_positions.get_mut("4key").unwrap()[0].z_index = Some(1000);
    let next = reconcile_document(&document, Some(LegacyRef::from(&legacy)), &edited).unwrap();
    let ids = tree_ids(&next, "4key");
    let key_at = ids
        .iter()
        .position(|id| id == &format!("{first_key}@1"))
        .unwrap();
    assert_eq!(ids[key_at + 1], "probe-1@1");
    // 그 위에는 멤버 없는 그룹만 남는다
    assert_eq!(
        ids[key_at + 2..],
        ["g1@1".to_string(), "g-plugin@1".to_string()]
    );
}

#[test]
fn 옛_쓰기로_탭이_지워지면_장면도_지운다() {
    let legacy = sample();
    let document = import_document(&legacy).unwrap();
    let mut edited = legacy.clone();
    edited.keys.remove("8key");
    edited.key_positions.remove("8key");
    edited.stat_positions.remove("8key");
    let next = reconcile_document(&document, Some(LegacyRef::from(&legacy)), &edited).unwrap();
    assert!(!next.scenes.contains_key("8key"));
}

#[test]
fn 트리에서_순서를_바꾸면_그_장면의_z_index를_다시_매긴다() {
    let mut legacy = sample();
    for position in legacy.key_positions.get_mut("4key").unwrap() {
        position.group_id = None;
    }
    legacy.graph_positions.get_mut("4key").unwrap()[0]
        .position
        .group_id = None;
    let mut document = import_document(&legacy).unwrap();
    let first_key = legacy.key_positions["4key"][0].id.clone();
    let engine = Engine {
        kinds: builtin_kind_registry(),
        bundles: &BuiltinBundles,
    };
    engine
        .apply(
            &mut document,
            &[Op::Move {
                scene: "4key".into(),
                ids: vec![first_key.clone()],
                parent: None,
                index: None,
            }],
        )
        .unwrap();
    let projected = project_document(&document).unwrap();
    let four = &projected.key_positions["4key"];
    let top = four
        .iter()
        .map(|position| position.z_index.unwrap())
        .max()
        .unwrap();
    assert_eq!(four[0].z_index, Some(top));
    // 다른 탭은 그대로
    assert_eq!(
        projected.key_positions["5key"],
        legacy.key_positions["5key"]
    );
}

#[test]
fn 증분_맞추기는_전체_맞추기와_같은_결과를_낸다() {
    let legacy = sample();
    let document = import_document(&legacy).unwrap();
    let mut edited = legacy.clone();
    edited.key_positions.get_mut("4key").unwrap()[2].note_glow_size = 77.0;
    edited.keys.get_mut("4key").unwrap()[2] = KeySlot::from("Q");
    edited.graph_positions.get_mut("4key").unwrap()[0].graph_speed = 4000;
    let incremental =
        reconcile_document(&document, Some(LegacyRef::from(&legacy)), &edited).unwrap();
    let full = reconcile_document(&document, None, &edited).unwrap();
    assert_eq!(incremental, full);
    // 바뀌지 않은 탭은 그대로
    assert_eq!(incremental.scenes["6key"], document.scenes["6key"]);
}

#[test]
#[ignore]
fn 측정_요소_많을_때_맞추기_시간() {
    let mut legacy = sample();
    let template = legacy.key_positions["4key"][0].clone();
    for tab in ["4key", "5key", "6key", "8key"] {
        let keys = legacy.keys.get_mut(tab).unwrap();
        let positions = legacy.key_positions.get_mut(tab).unwrap();
        keys.clear();
        positions.clear();
        for index in 0..150 {
            keys.push(KeySlot::from(format!("K{index}")));
            let mut position = template.clone();
            position.id = element_id();
            position.group_id = None;
            position.dx = index as f64;
            positions.push(position);
        }
    }
    let document = import_document(&legacy).unwrap();
    let mut edited = legacy.clone();
    edited.key_positions.get_mut("4key").unwrap()[3].dx = 999.0;
    let started = std::time::Instant::now();
    for _ in 0..20 {
        let _ = reconcile_document(&document, Some(LegacyRef::from(&legacy)), &edited).unwrap();
    }
    eprintln!(
        "reconcile 600 keys (증분): {:?} / 회",
        started.elapsed() / 20
    );
    let started = std::time::Instant::now();
    for _ in 0..20 {
        let _ = reconcile_document(&document, None, &edited).unwrap();
    }
    eprintln!(
        "reconcile 600 keys (전체): {:?} / 회",
        started.elapsed() / 20
    );
    let started = std::time::Instant::now();
    for _ in 0..20 {
        let _ = project_document(&document).unwrap();
    }
    eprintln!("project 600 keys: {:?} / 회", started.elapsed() / 20);
    let started = std::time::Instant::now();
    for _ in 0..20 {
        let _ = std::hint::black_box(document.clone());
    }
    eprintln!("문서 복사 600 keys: {:?} / 회", started.elapsed() / 20);
    let started = std::time::Instant::now();
    for _ in 0..20 {
        let _ = std::hint::black_box(legacy.clone());
    }
    eprintln!("옛 모양 복사 600 keys: {:?} / 회", started.elapsed() / 20);
}

#[test]
fn 구조가_바뀌어도_트리_전용_요소는_원래_그룹_안에_남는다() {
    let legacy = sample();
    let mut document = import_document(&legacy).unwrap();
    let probe: Node = serde_json::from_value(json!({
        "type": "element", "id": "probe-1", "kind": "probe",
        "frame": { "x": 0, "y": 0, "width": 10, "height": 10 }
    }))
    .unwrap();
    // 그룹 g1의 맨 아래에 둔다 - 같은 그룹 안 아래 이웃이 없다
    let scene = document.scenes.get_mut("4key").unwrap();
    let group_path = scene.find_path("g1").unwrap();
    if let Some(Node::Group(group)) = scene.node_at_mut(&group_path) {
        group.children.insert(0, probe);
    }
    let mut edited = legacy.clone();
    // 구조 변화 - 키 하나의 zIndex를 바꾼다
    edited.key_positions.get_mut("4key").unwrap()[1].z_index = Some(999);
    let next = reconcile_document(&document, Some(LegacyRef::from(&legacy)), &edited).unwrap();
    assert_eq!(
        next.scenes["4key"].parent_of("probe-1"),
        Some(Some("g1".to_string()))
    );
}

#[test]
fn 그룹_바로_위의_맨_위_트리_요소는_구조가_바뀌어도_그룹에_들어가지_않는다() {
    let legacy = sample();
    let mut document = import_document(&legacy).unwrap();
    let probe: Node = serde_json::from_value(json!({
        "type": "element", "id": "probe-1", "kind": "probe",
        "frame": { "x": 0, "y": 0, "width": 10, "height": 10 }
    }))
    .unwrap();
    let scene = document.scenes.get_mut("4key").unwrap();
    let group_at = scene.find_path("g1").unwrap()[0];
    scene.nodes.insert(group_at + 1, probe);
    let mut edited = legacy.clone();
    edited.key_positions.get_mut("4key").unwrap()[1].z_index = Some(999);
    let next = reconcile_document(&document, Some(LegacyRef::from(&legacy)), &edited).unwrap();
    let scene = &next.scenes["4key"];
    assert_eq!(scene.parent_of("probe-1"), Some(None));
    // 그룹 바로 위 자리를 지킨다
    let path = scene.find_path("probe-1").unwrap();
    assert_eq!(scene.nodes[path[0] - 1].id(), "g1");
}

#[test]
fn 바로_아래_이웃이_그룹을_떠나거나_사라져도_트리_요소는_제자리_근처에_남는다() {
    let legacy = sample();
    let base = import_document(&legacy).unwrap();
    let probe: Node = serde_json::from_value(json!({
        "type": "element", "id": "probe-1", "kind": "probe",
        "frame": { "x": 0, "y": 0, "width": 10, "height": 10 }
    }))
    .unwrap();
    // 맨 위 단계에서 그룹 g1 바로 위
    let mut document = base.clone();
    let scene = document.scenes.get_mut("4key").unwrap();
    let group_at = scene.find_path("g1").unwrap()[0];
    scene.nodes.insert(group_at + 1, probe.clone());
    let probe_before = scene.find_path("probe-1").unwrap()[0];
    assert!(probe_before > 0);

    // 그룹 해제 - 멤버가 맨 위 단계로 나오고, 트리 요소는 그 위에 남는다
    let mut ungrouped = legacy.clone();
    for position in ungrouped.key_positions.get_mut("4key").unwrap() {
        position.group_id = None;
    }
    ungrouped.graph_positions.get_mut("4key").unwrap()[0]
        .position
        .group_id = None;
    let next = reconcile_document(&document, Some(LegacyRef::from(&legacy)), &ungrouped).unwrap();
    let scene = &next.scenes["4key"];
    assert_eq!(scene.parent_of("probe-1"), Some(None));
    assert_ne!(
        scene.find_path("probe-1").unwrap(),
        vec![0],
        "맨 아래로 떨어지지 않는다"
    );
    let probe_at = scene.find_path("probe-1").unwrap()[0];
    let below = scene.nodes[probe_at - 1]
        .as_element()
        .map(|element| element.kind.clone());
    assert!(below.is_some_and(|kind| is_legacy_kind(&kind)));
}

#[test]
fn 바로_아래_키가_그룹에_들어가거나_지워져도_트리_요소는_맨_아래로_떨어지지_않는다() {
    let mut legacy = sample();
    for position in legacy.key_positions.get_mut("4key").unwrap() {
        position.group_id = None;
    }
    legacy.graph_positions.get_mut("4key").unwrap()[0]
        .position
        .group_id = None;
    let base = import_document(&legacy).unwrap();
    let probe: Node = serde_json::from_value(json!({
        "type": "element", "id": "probe-1", "kind": "probe",
        "frame": { "x": 0, "y": 0, "width": 10, "height": 10 }
    }))
    .unwrap();
    let anchor_id = legacy.key_positions["4key"][3].id.clone();
    let mut document = base.clone();
    let scene = document.scenes.get_mut("4key").unwrap();
    let anchor_at = scene.find_path(&anchor_id).unwrap()[0];
    scene.nodes.insert(anchor_at + 1, probe);

    // 바로 아래 키를 그룹에 넣는다 - 트리 요소는 맨 위 단계에서 그 그룹 바로 위
    let mut grouped = legacy.clone();
    grouped.key_positions.get_mut("4key").unwrap()[3].group_id = Some("g1".into());
    let next = reconcile_document(&document, Some(LegacyRef::from(&legacy)), &grouped).unwrap();
    let scene = &next.scenes["4key"];
    assert_eq!(scene.parent_of("probe-1"), Some(None));
    let at = scene.find_path("probe-1").unwrap()[0];
    assert_eq!(scene.nodes[at - 1].id(), "g1");

    // 바로 아래 키를 지운다 - 그다음 아래 옛 요소 위
    let mut removed = legacy.clone();
    removed.key_positions.get_mut("4key").unwrap().remove(3);
    removed.keys.get_mut("4key").unwrap().remove(3);
    let next = reconcile_document(&document, Some(LegacyRef::from(&legacy)), &removed).unwrap();
    let scene = &next.scenes["4key"];
    let at = scene.find_path("probe-1").unwrap()[0];
    assert!(at > 0, "맨 아래로 떨어지지 않는다");
}

fn graft_scene(nodes: serde_json::Value) -> Scene {
    serde_json::from_value(json!({ "nodes": nodes })).unwrap()
}

fn node_json(id: &str, kind: &str) -> serde_json::Value {
    json!({ "type": "element", "id": id, "kind": kind,
            "frame": { "x": 0, "y": 0, "width": 1, "height": 1 } })
}

fn shape_of(scene: &Scene) -> Vec<String> {
    let mut out = Vec::new();
    walk(&scene.nodes, &mut |node, path| {
        out.push(format!("{}@{}", node.id(), path.len()))
    });
    out
}

#[test]
fn 끼울_자리가_같으면_기준점이_달라도_트리_요소_순서를_지킨다() {
    // [A, T1, B, T2] 에서 A·B를 그룹 S로 묶은 뒤
    let previous = graft_scene(json!([
        node_json("A", "key"),
        node_json("T1", "probe"),
        node_json("B", "key"),
        node_json("T2", "probe")
    ]));
    let mut next = graft_scene(json!([
        { "type": "group", "id": "S", "name": "S", "children": [node_json("A", "key"), node_json("B", "key")] }
    ]));
    graft_tree_only(&previous, &mut next);
    assert_eq!(shape_of(&next), vec!["S@1", "A@2", "B@2", "T1@1", "T2@1"]);
}

#[test]
fn 옛_종류_멤버_없는_그룹_위의_트리_요소는_그_그룹_위에_남는다() {
    let previous = graft_scene(json!([
        node_json("A", "key"),
        { "type": "group", "id": "E", "name": "E", "children": [node_json("T3", "probe")] },
        node_json("T1", "probe")
    ]));
    let mut next = graft_scene(json!([
        node_json("A", "key"),
        { "type": "group", "id": "E", "name": "E", "children": [] }
    ]));
    graft_tree_only(&previous, &mut next);
    assert_eq!(shape_of(&next), vec!["A@1", "E@1", "T3@2", "T1@1"]);
}

#[test]
fn 여러_구조_변경이_한번에_와도_트리_요소를_잃지_않고_남은_그룹에_둔다() {
    // [P{X, Ta, D, Tm}, G{Tb}] → P가 없어지고 X는 G로, D는 G 앞 맨 위로.
    // 없어진 그룹의 요소는 맨 위 단계로 나오고(Ta·Tm), 남은 그룹의 요소는 그 그룹에 남는다.
    // 한 커밋에 여러 구조 변경이 겹치면 트리 요소끼리 위아래가 바뀔 수 있다(받아들임)
    let previous = graft_scene(json!([
        { "type": "group", "id": "P", "name": "P", "children": [
            node_json("X", "key"), node_json("Ta", "probe"), node_json("D", "key"), node_json("Tm", "probe")
        ] },
        { "type": "group", "id": "G", "name": "G", "children": [node_json("Tb", "probe")] }
    ]));
    let mut next = graft_scene(json!([
        node_json("D", "key"),
        { "type": "group", "id": "G", "name": "G", "children": [node_json("X", "key")] }
    ]));
    graft_tree_only(&previous, &mut next);
    let shape = shape_of(&next);
    for id in ["Ta@1", "Tm@1", "Tb@2"] {
        assert!(shape.contains(&id.to_string()), "{id} in {shape:?}");
    }
    assert_eq!(next.parent_of("Tb"), Some(Some("G".to_string())));
}

#[test]
fn 옛_멤버_없는_그룹을_풀면_안의_트리_요소는_그_그룹_자리에_남는다() {
    let group = |id: &str, children: serde_json::Value| json!({ "type": "group", "id": id, "name": id, "children": children });
    // A1 G2{T3} G6{T5} T7 → G6 해제
    let previous = graft_scene(json!([
        node_json("A1", "key"),
        group("G2", json!([node_json("T3", "probe")])),
        group("G6", json!([node_json("T5", "probe")])),
        node_json("T7", "probe")
    ]));
    let mut next = graft_scene(json!([node_json("A1", "key"), group("G2", json!([]))]));
    graft_tree_only(&previous, &mut next);
    assert_eq!(
        shape_of(&next),
        vec!["A1@1", "G2@1", "T3@2", "T5@1", "T7@1"]
    );

    // L{A T1} G{T2} T3 → G 해제 - T2가 상관없는 옛 그룹 L 안으로 들어가지 않는다
    let previous = graft_scene(json!([
        group(
            "L",
            json!([node_json("A", "key"), node_json("T1", "probe")])
        ),
        group("G", json!([node_json("T2", "probe")])),
        node_json("T3", "probe")
    ]));
    let mut next = graft_scene(json!([group("L", json!([node_json("A", "key")]))]));
    graft_tree_only(&previous, &mut next);
    assert_eq!(shape_of(&next), vec!["L@1", "A@2", "T1@2", "T2@1", "T3@1"]);
}

#[test]
fn 옛_멤버가_생긴_그룹은_기준으로_삼지_않는다() {
    // A4 A5 G2{T9} T3 → A4를 G2에 넣으면 G2는 A4 자리로 내려간다
    let previous = graft_scene(json!([
        node_json("A4", "key"),
        node_json("A5", "key"),
        { "type": "group", "id": "G2", "name": "G2", "children": [node_json("T9", "probe")] },
        node_json("T3", "probe")
    ]));
    let mut next = graft_scene(json!([
        { "type": "group", "id": "G2", "name": "G2", "children": [node_json("A4", "key")] },
        node_json("A5", "key")
    ]));
    graft_tree_only(&previous, &mut next);
    let shape = shape_of(&next);
    assert_eq!(shape.last().map(String::as_str), Some("T3@1"), "{shape:?}");
}
