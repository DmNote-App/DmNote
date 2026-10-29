use serde_json::json;

use super::*;
use crate::bundles::NoBundles;
use crate::test_support::{dial_values, document, element, group, ids, registry};

fn engine(kinds: &KindRegistry) -> Engine<'_> {
    Engine {
        kinds,
        bundles: &NoBundles,
    }
}

fn pad(id: &str) -> Node {
    Node::Element(element(id, "pad", json!({})))
}

fn dial(id: &str) -> Node {
    Node::Element(element(id, "dial", dial_values()))
}

fn scene_ops(ops: serde_json::Value) -> Vec<Op> {
    serde_json::from_value(ops).unwrap()
}

#[test]
fn 넣기는_빠진_고유_값을_기본값으로_채우고_id_중복을_막는다() {
    let kinds = registry();
    let mut doc = document(vec![pad("a")]);
    let changes = engine(&kinds)
        .apply(
            &mut doc,
            &[Op::Insert {
                scene: "tab".into(),
                parent: None,
                index: None,
                node: Node::Element(element("d", "dial", json!({}))),
            }],
        )
        .unwrap();
    assert_eq!(ids(&doc), vec!["a@0", "d@1"]);
    assert_eq!(
        doc.scenes["tab"].element("d").unwrap().values["sensitivity"],
        json!(1)
    );
    assert!(changes.scenes["tab"].changed.contains("d"));
    assert!(changes.scenes["tab"].structure);

    let error = engine(&kinds)
        .apply(
            &mut doc,
            &[Op::Insert {
                scene: "tab".into(),
                parent: None,
                index: Some(0),
                node: pad("a"),
            }],
        )
        .unwrap_err();
    assert_eq!(error[0].code, ViolationCode::DuplicateId);
}

#[test]
fn 연산_묶음은_하나라도_어긋나면_문서를_그대로_둔다() {
    let kinds = registry();
    let mut doc = document(vec![pad("a"), dial("d")]);
    let before = doc.clone();
    let error = engine(&kinds)
        .apply(
            &mut doc,
            &scene_ops(json!([
                { "op": "setFrame", "scene": "tab", "id": "a", "frame": { "x": 50 } },
                { "op": "setValues", "scene": "tab", "id": "d", "values": { "sensitivity": 99 } }
            ])),
        )
        .unwrap_err();
    assert_eq!(
        error,
        vec![Violation::new(
            ViolationCode::ValueOutOfRange,
            "ops[1].values.sensitivity"
        )]
    );
    assert_eq!(doc, before);
}

#[test]
fn 칸_값_바꾸기는_적은_칸만_바꾸고_바뀐_요소만_알린다() {
    let kinds = registry();
    let mut doc = document(vec![pad("a"), dial("d")]);
    let changes = engine(&kinds)
        .apply(&mut doc, &scene_ops(json!([{ "op": "setValues", "scene": "tab", "id": "d", "values": { "mode": "slide" } }])))
        .unwrap();
    let values = &doc.scenes["tab"].element("d").unwrap().values;
    assert_eq!(values["mode"], json!("slide"));
    assert_eq!(values["sensitivity"], json!(1));
    assert_eq!(
        changes.scenes["tab"].changed.iter().collect::<Vec<_>>(),
        vec!["d"]
    );
    assert!(!changes.scenes["tab"].structure);

    // 같은 값이면 알릴 것이 없다
    let changes = engine(&kinds)
        .apply(&mut doc, &scene_ops(json!([{ "op": "setValues", "scene": "tab", "id": "d", "values": { "mode": "slide" } }])))
        .unwrap();
    assert!(changes
        .scenes
        .get("tab")
        .is_none_or(|change| change.changed.is_empty()));
}

#[test]
fn 위치_크기는_유효한_값만_받는다() {
    let kinds = registry();
    let mut doc = document(vec![pad("a")]);
    let frames = [
        FramePatch {
            width: Some(0.0),
            ..Default::default()
        },
        FramePatch {
            rotation: Some(270.0),
            ..Default::default()
        },
        FramePatch {
            x: Some(f64::NAN),
            ..Default::default()
        },
    ];
    for frame in frames {
        let ops = vec![Op::SetFrame {
            scene: "tab".into(),
            id: "a".into(),
            frame,
        }];
        assert_eq!(
            engine(&kinds).apply(&mut doc, &ops).unwrap_err()[0].code,
            ViolationCode::InvalidFrame
        );
    }
}

#[test]
fn 참조는_묶음이_끝난_뒤_장면_기준으로_검사한다() {
    let kinds = registry();
    let mut doc = document(vec![dial("d")]);
    // 같은 묶음 안에서 대상을 먼저 넣으면 통과
    engine(&kinds)
        .apply(
            &mut doc,
            &[
                Op::SetValues {
                    scene: "tab".into(),
                    id: "d".into(),
                    values: json!({ "target": "p" }).as_object().unwrap().clone(),
                },
                Op::Insert {
                    scene: "tab".into(),
                    parent: None,
                    index: None,
                    node: pad("p"),
                },
            ],
        )
        .unwrap();
    let error = engine(&kinds)
        .apply(&mut doc, &scene_ops(json!([{ "op": "setValues", "scene": "tab", "id": "d", "values": { "target": "nope" } }])))
        .unwrap_err();
    assert_eq!(error[0].code, ViolationCode::ReferenceNotFound);
    let error = engine(&kinds)
        .apply(&mut doc, &scene_ops(json!([{ "op": "setValues", "scene": "tab", "id": "d", "values": { "target": "d" } }])))
        .unwrap_err();
    assert_eq!(error[0].code, ViolationCode::ReferenceWrongKind);
}

#[test]
fn 지운_요소를_가리키던_참조는_비우고_그_요소도_바뀐_것으로_알린다() {
    let kinds = registry();
    let mut values = dial_values();
    values["target"] = json!("p");
    values["poses"] = json!([{ "poseId": "x", "triggers": ["p", "q"] }]);
    let mut doc = document(vec![
        pad("p"),
        pad("q"),
        Node::Element(element("d", "dial", values)),
    ]);
    let changes = engine(&kinds)
        .apply(
            &mut doc,
            &scene_ops(json!([{ "op": "remove", "scene": "tab", "ids": ["p"] }])),
        )
        .unwrap();
    let values = &doc.scenes["tab"].element("d").unwrap().values;
    assert_eq!(values["target"], json!(null));
    assert_eq!(
        values["poses"],
        json!([{ "poseId": "x", "triggers": ["q"] }])
    );
    assert!(changes.scenes["tab"].removed.contains("p"));
    assert!(changes.scenes["tab"].changed.contains("d"));
}

#[test]
fn 옮기기는_고른_노드의_순서를_지키고_자리는_남는_노드_기준이다() {
    let kinds = registry();
    let mut doc = document(vec![pad("a"), pad("b"), pad("c"), pad("d"), pad("e")]);
    // d, b를 c 앞(index 2) 자리로 - 결과는 a b d c e
    engine(&kinds)
        .apply(
            &mut doc,
            &scene_ops(json!([{ "op": "move", "scene": "tab", "ids": ["d", "b"], "index": 2 }])),
        )
        .unwrap();
    assert_eq!(ids(&doc), vec!["a@0", "b@1", "d@2", "c@3", "e@4"]);
    // 맨 위로
    engine(&kinds)
        .apply(
            &mut doc,
            &scene_ops(json!([{ "op": "move", "scene": "tab", "ids": ["a"] }])),
        )
        .unwrap();
    assert_eq!(ids(&doc), vec!["b@0", "d@1", "c@2", "e@3", "a@4"]);
}

#[test]
fn 그룹을_자기_안으로_옮길_수_없다() {
    let kinds = registry();
    let mut doc = document(vec![group("g", vec![group("h", vec![pad("a")])])]);
    let error = engine(&kinds)
        .apply(
            &mut doc,
            &scene_ops(json!([{ "op": "move", "scene": "tab", "ids": ["g"], "parent": "h" }])),
        )
        .unwrap_err();
    assert_eq!(error[0].code, ViolationCode::InvalidMove);
}

#[test]
fn 묶기는_가장_위_멤버_자리에_그룹을_만들고_풀기는_그_자리에_펼친다() {
    let kinds = registry();
    let mut doc = document(vec![pad("a"), pad("b"), pad("c"), pad("d")]);
    engine(&kinds)
        .apply(&mut doc, &scene_ops(json!([{ "op": "group", "scene": "tab", "id": "g", "name": "G", "ids": ["c", "a"] }])))
        .unwrap();
    assert_eq!(ids(&doc), vec!["b@0", "g@1", "a@1.0", "c@1.1", "d@2"]);

    // 그룹 안 멤버를 다른 그룹으로
    engine(&kinds)
        .apply(
            &mut doc,
            &scene_ops(json!([{ "op": "group", "scene": "tab", "id": "h", "ids": ["a", "d"] }])),
        )
        .unwrap();
    assert_eq!(
        ids(&doc),
        vec!["b@0", "g@1", "c@1.0", "h@2", "a@2.0", "d@2.1"]
    );

    engine(&kinds)
        .apply(
            &mut doc,
            &scene_ops(json!([{ "op": "ungroup", "scene": "tab", "id": "h" }])),
        )
        .unwrap();
    assert_eq!(ids(&doc), vec!["b@0", "g@1", "c@1.0", "a@2", "d@3"]);
}

#[test]
fn 중첩_그룹_안에서_묶으면_그_그룹_안에_생긴다() {
    let kinds = registry();
    let mut doc = document(vec![group("g", vec![pad("a"), pad("b"), pad("c")])]);
    engine(&kinds)
        .apply(
            &mut doc,
            &scene_ops(json!([{ "op": "group", "scene": "tab", "id": "h", "ids": ["a", "b"] }])),
        )
        .unwrap();
    assert_eq!(
        ids(&doc),
        vec!["g@0", "h@0.0", "a@0.0.0", "b@0.0.1", "c@0.1"]
    );
}

#[test]
fn 모르는_종류는_옮기기_크기_삭제만_된다() {
    let kinds = registry();
    let mut doc = document(vec![Node::Element(element(
        "x",
        "gone",
        json!({ "secret": 1 }),
    ))]);
    engine(&kinds)
        .apply(
            &mut doc,
            &scene_ops(
                json!([{ "op": "setFrame", "scene": "tab", "id": "x", "frame": { "width": 90 } }]),
            ),
        )
        .unwrap();
    let error = engine(&kinds)
        .apply(&mut doc, &scene_ops(json!([{ "op": "setValues", "scene": "tab", "id": "x", "values": { "secret": 2 } }])))
        .unwrap_err();
    assert_eq!(error[0].code, ViolationCode::UnknownKind);
    assert_eq!(
        doc.scenes["tab"].element("x").unwrap().values["secret"],
        json!(1)
    );
    engine(&kinds)
        .apply(
            &mut doc,
            &scene_ops(json!([{ "op": "remove", "scene": "tab", "ids": ["x"] }])),
        )
        .unwrap();
}

#[test]
fn 앱보다_새_버전_종류는_값을_잠근다() {
    let kinds = registry();
    let mut doc = document(vec![dial("d")]);
    doc.kind_versions.insert("dial".into(), 3);
    let error = engine(&kinds)
        .apply(&mut doc, &scene_ops(json!([{ "op": "setValues", "scene": "tab", "id": "d", "values": { "mode": "slide" } }])))
        .unwrap_err();
    assert_eq!(error[0].code, ViolationCode::KindVersionLocked);
}

#[test]
fn 입력은_종류가_받는_입력만_붙는다() {
    let kinds = registry();
    let mut doc = document(vec![pad("a"), dial("d")]);
    engine(&kinds)
        .apply(&mut doc, &scene_ops(json!([{ "op": "setInput", "scene": "tab", "id": "a", "input": { "type": "key", "slot": "A" } }])))
        .unwrap();
    let error = engine(&kinds)
        .apply(&mut doc, &scene_ops(json!([{ "op": "setInput", "scene": "tab", "id": "d", "input": { "type": "key", "slot": "A" } }])))
        .unwrap_err();
    assert_eq!(error[0].code, ViolationCode::InvalidInput);
}

#[test]
fn 복제할_때_함께_복제된_요소를_가리키면_복제본으로_다시_잇는다() {
    let kinds = registry();
    let mut values = dial_values();
    values["target"] = json!("p");
    values["poses"] = json!([{ "poseId": "x", "triggers": ["p", "outside"] }]);
    let mut nodes = vec![pad("p2"), Node::Element(element("d2", "dial", values))];
    let mapping = [("p".to_string(), "p2".to_string())].into_iter().collect();
    remap_references(&kinds, &mut nodes, &mapping);
    let Node::Element(copy) = &nodes[1] else {
        panic!()
    };
    assert_eq!(copy.values["target"], json!("p2"));
    assert_eq!(
        copy.values["poses"][0]["triggers"],
        json!(["p2", "outside"])
    );
}

#[test]
fn 문서_차이는_바뀐_요소와_구조_변화를_나눠_알린다() {
    let before = document(vec![pad("a"), pad("b")]);
    let mut after = document(vec![pad("b"), pad("a"), pad("c")]);
    after
        .scenes
        .get_mut("tab")
        .unwrap()
        .element_mut("b")
        .unwrap()
        .frame
        .x = 5.0;
    let changes = diff(&before, &after);
    let change = &changes.scenes["tab"];
    assert_eq!(change.changed.iter().collect::<Vec<_>>(), vec!["b", "c"]);
    assert!(change.structure);
    assert!(change.removed.is_empty());
}

#[test]
fn 장면당_개수_상한을_넘으면_거부한다() {
    let mut kinds = registry();
    let mut schema = kinds.get("pad").unwrap().clone();
    schema.max_per_scene = Some(1);
    kinds.register(schema).unwrap();
    let mut doc = document(vec![pad("a")]);
    let error = engine(&kinds)
        .apply(
            &mut doc,
            &[Op::Insert {
                scene: "tab".into(),
                parent: None,
                index: None,
                node: pad("b"),
            }],
        )
        .unwrap_err();
    assert_eq!(error[0].code, ViolationCode::ValueTooManyItems);
}

#[test]
fn 손대지_않은_요소의_끊긴_참조는_다른_편집을_막지_않는다() {
    let kinds = registry();
    let mut values = dial_values();
    values["target"] = json!("gone");
    let mut doc = document(vec![Node::Element(element("d", "dial", values)), pad("a")]);
    engine(&kinds)
        .apply(
            &mut doc,
            &scene_ops(
                json!([{ "op": "setFrame", "scene": "tab", "id": "a", "frame": { "x": 3 } }]),
            ),
        )
        .unwrap();
    // 끊긴 참조를 가진 요소 자신을 고치면 그때는 막는다
    let error = engine(&kinds)
        .apply(&mut doc, &scene_ops(json!([{ "op": "setValues", "scene": "tab", "id": "d", "values": { "mode": "slide" } }])))
        .unwrap_err();
    assert_eq!(error[0].code, ViolationCode::ReferenceNotFound);
}

#[test]
fn 그룹과_그_자식을_함께_묶으면_그룹째_옮긴다() {
    let kinds = registry();
    let mut doc = document(vec![group("g", vec![pad("a"), pad("b")]), pad("c")]);
    engine(&kinds)
        .apply(
            &mut doc,
            &scene_ops(
                json!([{ "op": "group", "scene": "tab", "id": "h", "ids": ["g", "a", "c"] }]),
            ),
        )
        .unwrap();
    assert_eq!(
        ids(&doc),
        vec!["h@0", "g@0.0", "a@0.0.0", "b@0.0.1", "c@0.1"]
    );
}

#[test]
fn 공통_정보의_null은_지우기로_읽는다() {
    let op: Op = serde_json::from_value(serde_json::json!({
        "op": "setCommon", "scene": "s", "id": "a", "name": null, "className": null
    }))
    .unwrap();
    let Op::SetCommon {
        name,
        class_name,
        use_inline_styles,
        ..
    } = op
    else {
        unreachable!()
    };
    assert_eq!(name, Some(None));
    assert_eq!(class_name, Some(None));
    assert_eq!(use_inline_styles, None, "적지 않은 칸은 그대로 둔다");
}
